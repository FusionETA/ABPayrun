import { Hono } from "hono"

import type { ParsedTimesheet } from "../domain/timesheet"
import type { AppEnv } from "../lib/hono-env"
import { requireAuth } from "../middleware/auth.middleware"
import { listCompanies } from "../repositories/company.repository"
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

  return c.html(
    <Layout title="Convert" user={{ name: user.name, email: user.email }}>
      <ConvertPage
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
 * / employee / outlet against AltomateHR, and render the preview. Nothing is
 * posted here — the preview's Run action (all-or-nothing) is the next build.
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

  let parsed: ParsedTimesheet
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    parsed = parseTimesheet(buf)
  } catch (err) {
    console.error("[abpay] timesheet parse failed:", err)
    return c.redirect("/convert?uploadError=parse")
  }

  const report = await validateTimesheet(parsed, await listCompanies())

  return c.html(
    <Layout title="Preview" user={{ name: user.name, email: user.email }}>
      <ConvertPreview month={allowed} parsed={parsed} report={report} />
    </Layout>,
  )
})
