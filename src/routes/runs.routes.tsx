import { Hono } from "hono"

import type { ParsedTimesheet } from "../domain/timesheet"
import type { AppEnv } from "../lib/hono-env"
import { periodLabel } from "../lib/period"
import { requireAuth } from "../middleware/auth.middleware"
import { listCompanies } from "../repositories/company.repository"
import {
  createImport,
  findImportByPeriod,
  latestImport,
  resetImport,
  saveImportPayload,
} from "../repositories/import.repository"
import { clearRunsForImport } from "../repositories/run.repository"
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
    default:
      return null
  }
}

/**
 * Convert flow (GET). The allowed month is recomputed server-side; there is
 * no month parameter to tamper with, so a run can only be started for the
 * next month in sequence, and only when every company is in sync.
 */
runsRoutes.get("/convert", requireAuth, async (c) => {
  const user = c.get("user")
  const overview = await getRunsOverview()

  const allowed = overview.inSync ? overview.unifiedNext : null
  let reason: string | null = null
  if (!allowed) {
    if (overview.loadedCount === 0) {
      reason =
        "No companies are connected yet — connect one on the Companies page first."
    } else if (overview.blocked.length > 0) {
      const names = overview.blocked.map((b) => b.company.name).join(", ")
      reason = `Waiting on approval: ${names}. Submit each company's latest run in AltomateHR before the next month can run.`
    } else {
      reason =
        "Your connected companies are on different next months. Bring the trailing companies up to the same period before a combined run."
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
        c.req.query("err") ? { type: "err", msg: c.req.query("err")! } : null
      }
    >
      <ConvertPage
        resume={resume}
        month={allowed}
        companies={overview.companies.filter((v) => v.connected && !v.error)}
        reason={allowed ? null : reason}
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
  const allowed = overview.inSync ? overview.unifiedNext : null
  if (!allowed) return c.redirect("/convert")

  const body = await c.req.parseBody()
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
  // and post steps can come back to it. The month's runs can't exist yet
  // (the month only opens once every company's latest run is submitted), so
  // any earlier attempt at it is safe to start over.
  const existing = await findImportByPeriod(allowed.year, allowed.month)
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
    await clearRunsForImport(existing.id)
  }
  await saveImportPayload(importId, JSON.stringify(parsed))

  return c.html(
    <Layout title="Preview" user={{ name: user.name, email: user.email }}>
      <ConvertPreview month={allowed} parsed={parsed} report={report} importId={importId} />
    </Layout>,
  )
})
