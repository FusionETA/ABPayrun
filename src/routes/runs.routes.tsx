import { Hono } from "hono"

import type { ParsedTimesheet } from "../domain/timesheet"
import type { AppEnv } from "../lib/hono-env"
import { periodLabel, parsePeriodKey, samePeriod } from "../lib/period"
import { requireAuth } from "../middleware/auth.middleware"
import { listCompanies } from "../repositories/company.repository"
import {
  createImport,
  findImportByPeriod,
  latestImport,
  resetImport,
  saveImportPayload,
} from "../repositories/import.repository"
import { resetRunsForImport } from "../repositories/run.repository"
import { getRunsOverview } from "../services/runs.service"
import { parseTimesheet } from "../services/timesheet.service"
import { validateTimesheet } from "../services/validate.service"
import { ConvertPage } from "../views/convert"
import { ConvertPreview } from "../views/convert-preview"
import { Layout } from "../views/layout"
import { RunsPage } from "../views/runs"

export const runsRoutes = new Hono<AppEnv>()

/** Dashboard: per-company payroll runs from AltomateHR + the next month. */
runsRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user")
  const overview = await getRunsOverview()
  const ok = c.req.query("ok")
  const err = c.req.query("err")
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
      <RunsPage overview={overview} />
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
  const overview = await getRunsOverview()

  let reason: string | null = null
  if (overview.choices.length === 0) {
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

  // A month that was started but not fully posted: offer to carry on.
  const last = await latestImport()
  const resume =
    last && last.status !== "POSTED"
      ? {
          id: last.id,
          label: periodLabel({ year: last.period_year, month: last.period_month }),
          status: last.status,
        }
      : null

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
        companies={overview.companies.filter((v) => v.connected && !v.error)}
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

  const report = await validateTimesheet(parsed, companies)

  // Keep the upload as this month's import, so the column-mapping, review
  // and post steps can come back to it. Uploading a month again starts it
  // over: posting replaces the draft runs ABPay made for it (their ids are
  // kept for that) and leaves any company already approved alone. Only an
  // import being posted right now has to finish first.
  const existing = await findImportByPeriod(allowed.year, allowed.month)
  if (existing?.status === "POSTING") {
    const msg = `${periodLabel(allowed)} is being posted right now — wait for it to finish.`
    return c.redirect(`/convert?err=${encodeURIComponent(msg)}`)
  }
  const importId =
    existing?.id ??
    (await createImport({
      periodYear: allowed.year,
      periodMonth: allowed.month,
      filename: file.name,
      uploadedBy: user.email,
    }))
  if (existing) {
    await resetImport(existing.id, { filename: file.name, uploadedBy: user.email })
    await resetRunsForImport(existing.id)
  }
  await saveImportPayload(importId, JSON.stringify(parsed))

  return c.html(
    <Layout title="Preview" user={{ name: user.name, email: user.email }}>
      <ConvertPreview month={allowed} parsed={parsed} report={report} importId={importId} />
    </Layout>,
  )
})
