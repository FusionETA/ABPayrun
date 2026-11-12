import { Hono } from "hono"

import type { ParsedTimesheet } from "../domain/timesheet"
import type { AppEnv } from "../lib/hono-env"
import { periodKey, periodLabel, parsePeriodKey, samePeriod } from "../lib/period"
import { requireAuth } from "../middleware/auth.middleware"
import { listCompanies } from "../repositories/company.repository"
import {
  createImport,
  listImports,
  listImportsForPeriod,
  nameFromFile,
  resetImport,
  saveImportPayload,
  timesheetName,
} from "../repositories/import.repository"
import { resetRunsForImport } from "../repositories/run.repository"
import { runFileTag } from "../domain/posting"
import {
  companiesWithoutPayroll,
  outsideAccessMessage,
  peopleOutsideAccess,
  loadAccess,
  noPayrollMessage,
  type Access,
} from "../services/access.service"
import { getRunsOverview, type RunsOverview } from "../services/runs.service"
import { parseTimesheet } from "../services/timesheet.service"
import { validateTimesheet } from "../services/validate.service"
import { companiesWithNothingToReplace, loadImport } from "../services/posting.service"
import { ConvertPage } from "../views/convert"
import { ConvertPreview } from "../views/convert-preview"
import { Layout } from "../views/layout"
import { RunsPage } from "../views/runs"

export const runsRoutes = new Hono<AppEnv>()

/**
 * The runs overview as this person may see it: only their companies, the
 * ones they can't run payroll for in `noPayroll`, the ones where they see
 * only some employees in `limited` (a run's totals hold everyone's pay, so
 * neither shows runs or pay), and whether they can run payroll anywhere.
 */
function overviewFor(overview: RunsOverview, access: Access) {
  const companies = overview.companies.filter((v) => access.canSee(v.company.altomate_org_id))
  const idsWhere = (keep: (orgId: string) => boolean) =>
    new Set(companies.map((v) => v.company.altomate_org_id).filter(keep))
  const noPayroll = idsWhere((id) => !access.canRunPayroll(id))
  const limited = idsWhere((id) => access.canRunPayroll(id) && access.limitedIn(id))
  const canUpload = companies.some(
    (v) => v.connected && !v.error && !noPayroll.has(v.company.altomate_org_id),
  )
  return { overview: { ...overview, companies }, noPayroll, limited, canUpload }
}

/** Dashboard: per-company payroll runs from AltomateHR + the next month. */
runsRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user")
  const access = c.get("access")
  const { overview, noPayroll, limited, canUpload } = overviewFor(await getRunsOverview(), access)
  const ok = c.req.query("ok")
  const err = c.req.query("err") ?? access.error ?? undefined
  const flash = ok
    ? ({ type: "ok", msg: ok } as const)
    : err
      ? ({ type: "err", msg: err } as const)
      : null
  return c.html(
    <Layout
      title="Dashboard"
      user={{ name: user.name, email: user.email }}
      flash={flash}
    >
      <RunsPage overview={overview} noPayroll={noPayroll} limited={limited} canUpload={canUpload} />
    </Layout>,
  )
})

function convertUploadError(code: string | undefined): string | null {
  switch (code) {
    case "nofile":
      return "No file received — pick an .xlsx timesheet and try again."
    case "parse":
      return "Couldn't read that file — is it the timesheet .xlsx?"
    case "period":
      return "Choose a payroll month from the list — that month can't be run."
    case "target":
      return "That month already has a timesheet — choose whether this is a new one or which one it replaces."
    case "posting":
      return "That timesheet is being posted right now — wait for it to finish, then upload again."
    case "name":
      return "Give the timesheet a name (it becomes the run name in AltomateHR)."
    case "duplicate":
      return "That month already has a timesheet with this name — choose to replace it, or use another name."
    default:
      return null
  }
}

/**
 * Convert flow (GET). The months on offer are recomputed server-side from
 * each company's runs: from the month after the newest run (or a year back
 * when there are none) up to next month once every company's latest run is
 * approved — or, while a month is waiting on approval, just that month, to
 * re-import it.
 */
runsRoutes.get("/convert", requireAuth, async (c) => {
  const user = c.get("user")
  const access = c.get("access")
  const view = overviewFor(await getRunsOverview(), access)
  // Nothing to upload for someone without payroll access anywhere.
  const overview = view.canUpload || view.overview.loadedCount === 0
    ? view.overview
    : { ...view.overview, choices: [] }

  let reason: string | null = null
  if (!view.canUpload && view.overview.loadedCount > 0) {
    reason =
      access.error ??
      "Your access in AltomateHR doesn't include running payroll for any of your companies."
  } else if (overview.choices.length === 0) {
    if (overview.loadedCount === 0) {
      reason =
        "No companies are connected yet — connect one on the Companies page first."
    } else {
      const open = overview.blocked
        .map((b) => `${b.company.name} (${b.latest ? periodLabel(b.latest) : "latest run"})`)
        .join(", ")
      reason = `Runs in more than one month are waiting on approval: ${open}. Submit the earlier month's runs in AltomateHR — then that month can be re-imported, or the next one started.`
    }
  }

  // Every timesheet started but not fully posted: offer to carry on with
  // each — a month can have several.
  const resume = (view.canUpload ? await listImports() : [])
    .filter((imp) => imp.status !== "POSTED")
    .map((imp) => ({
      id: imp.id,
      label: `${periodLabel({ year: imp.period_year, month: imp.period_month })} – ${timesheetName(imp)}`,
      status: imp.status,
    }))

  // The timesheets already uploaded for each month on offer: a new upload
  // for one of those months is either another timesheet or a replacement.
  const existing = (
    await Promise.all(
      overview.choices.map(async (p) =>
        (await listImportsForPeriod(p.year, p.month)).map((imp) => ({
          id: imp.id,
          period: periodKey(p),
          name: timesheetName(imp),
          status: imp.status,
        })),
      ),
    )
  ).flat()

  return c.html(
    <Layout
      title="Convert"
      user={{ name: user.name, email: user.email }}
      flash={
        c.req.query("err")
          ? { type: "err", msg: c.req.query("err")! }
          : c.req.query("ok")
            ? { type: "ok", msg: c.req.query("ok")! }
            : null
      }
    >
      <ConvertPage
        resume={resume}
        choices={overview.choices}
        earliest={overview.earliest}
        reopen={overview.reopen}
        companies={overview.companies.filter(
          (v) => v.connected && !v.error && !view.noPayroll.has(v.company.altomate_org_id),
        )}
        existing={existing}
        addTo={overview.addTo}
        reason={reason}
        uploadError={convertUploadError(c.req.query("uploadError"))}
      />
    </Layout>,
  )
})

/**
 * Convert flow (POST): parse the uploaded timesheet, validate every company
 * / employee / outlet against AltomateHR, save it as the month's import and
 * render the preview. Nothing is posted here — that's /imports/:id/post,
 * after the column mapping and the review.
 */
runsRoutes.post("/convert", requireAuth, async (c) => {
  const user = c.get("user")
  const overview = await getRunsOverview()
  if (overview.choices.length === 0) return c.redirect("/convert")
  if (!overviewFor(overview, c.get("access")).canUpload) return c.redirect("/convert")

  const body = await c.req.parseBody()
  // Only a month the list offers is accepted; the list is rebuilt from live
  // runs, so a month that's been run since the page loaded is refused.
  const picked = parsePeriodKey(String(body["period"] ?? ""))
  const allowed = picked && overview.choices.find((p) => samePeriod(p, picked))
  if (!allowed) return c.redirect("/convert?uploadError=period")
  const file = body["timesheet"]
  if (!(file instanceof File) || file.size === 0) {
    return c.redirect("/convert?uploadError=nofile")
  }

  const companies = await listCompanies()
  let parsed: ParsedTimesheet
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    parsed = parseTimesheet(
      buf,
      companies.flatMap((co) => (co.code ? [co.code] : [])),
    )
  } catch (err) {
    console.error("[abpay] timesheet parse failed:", err)
    return c.redirect("/convert?uploadError=parse")
  }

  // Every company on the sheet must be one they may run payroll for — asked
  // afresh, and before anything is saved or shown: the preview shows pay.
  const access = await loadAccess(user, { fresh: true })
  if (access.error) return c.redirect(`/convert?err=${encodeURIComponent(access.error)}`)
  const blocked = companiesWithoutPayroll(
    access,
    companies,
    parsed.companies.map((g) => g.company),
  )
  if (blocked.length > 0) {
    return c.redirect(`/convert?err=${encodeURIComponent(noPayrollMessage(blocked))}`)
  }

  const report = await validateTimesheet(parsed, companies)

  // Someone limited to some employees may post only for them: anyone else on
  // the sheet refuses the whole file, before it's saved or its pay shown.
  const outside = await peopleOutsideAccess(access, parsed, companies, { report })
  if (outside.length > 0) {
    return c.redirect(`/convert?err=${encodeURIComponent(outsideAccessMessage(outside))}`)
  }

  // Keep the upload as a timesheet of the month, so the column-mapping,
  // review and post steps can come back to it. A month can have several
  // timesheets, each posted as its own run per company and named after it;
  // the form says whether this is another one or which one it replaces.
  // Replacing starts that timesheet over: posting replaces the draft runs
  // ABPay made for it (their ids are kept for that) and leaves any company
  // already approved alone. Only a timesheet being posted right now has to
  // finish first.
  const monthImports = await listImportsForPeriod(allowed.year, allowed.month)
  const target = String(body["target"] ?? "")
  const replacing =
    target && target !== "new" ? monthImports.find((i) => String(i.id) === target) : undefined
  // A corrected copy keeps its timesheet's name unless another is typed.
  const typed = String(body["name"] ?? "").replace(/\s+/g, " ").trim()
  const name = (typed || (replacing ? timesheetName(replacing) : nameFromFile(file.name)))
    .slice(0, 60)
    .trim()
  if (!name) return c.redirect("/convert?uploadError=name")
  if (monthImports.length > 0 && !replacing && target !== "new") {
    return c.redirect("/convert?uploadError=target")
  }
  if (replacing?.status === "POSTING") return c.redirect("/convert?uploadError=posting")
  // Replacing a timesheet deletes the draft runs it made — so its people,
  // not just the new file's, must all be ones this person's access covers.
  // A company whose run was already deleted in AltomateHR (or approved) has
  // nothing left to delete, so its people aren't checked.
  if (replacing) {
    const old = await loadImport(replacing.id)
    let theirs: string[] = []
    if (old && access.enforced) {
      const skip = await companiesWithNothingToReplace(replacing.id, companies)
      const stillThere = {
        ...old.parsed,
        companies: old.parsed.companies.filter((g) => !skip.has(g.company.toUpperCase())),
      }
      theirs = await peopleOutsideAccess(access, stillThere, companies, { fresh: true })
    }
    if (theirs.length > 0) {
      return c.redirect(
        `/convert?err=${encodeURIComponent(
          `You can't replace "${timesheetName(replacing)}": its draft runs in AltomateHR include people your access doesn't cover — ${theirs.join("; ")}. Ask an admin whose access covers them to replace it, or delete that company's draft run in AltomateHR first.`,
        )}`,
      )
    }
  }
  // Two timesheets of a month can't share a name — nor names AltomateHR
  // would file the same way ("Kitchen 1" / "Kitchen-1").
  const clash = monthImports.find(
    (i) =>
      i.id !== replacing?.id &&
      (timesheetName(i).toLowerCase() === name.toLowerCase() ||
        (runFileTag(name) !== "" &&
          runFileTag(timesheetName(i)).toLowerCase() === runFileTag(name).toLowerCase())),
  )
  if (clash) return c.redirect("/convert?uploadError=duplicate")

  const importId =
    replacing?.id ??
    (await createImport({
      periodYear: allowed.year,
      periodMonth: allowed.month,
      name,
      filename: file.name,
      uploadedBy: user.email,
    }))
  if (replacing) {
    await resetImport(replacing.id, { name, filename: file.name, uploadedBy: user.email })
    await resetRunsForImport(replacing.id)
  }
  await saveImportPayload(importId, JSON.stringify(parsed))

  return c.html(
    <Layout title="Preview" user={{ name: user.name, email: user.email }}>
      <ConvertPreview month={allowed} name={name} parsed={parsed} report={report} importId={importId} />
    </Layout>,
  )
})
