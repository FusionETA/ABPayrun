import { Hono } from "hono"

import { MAPPABLE_COLUMNS } from "../domain/posting"
import type { AppEnv } from "../lib/hono-env"
import { requireAuth } from "../middleware/auth.middleware"
import { listCompanies } from "../repositories/company.repository"
import { saveColumnMappings } from "../repositories/mapping.repository"
import { listRunsForImport } from "../repositories/run.repository"
import { AltomateApiError } from "../services/altomate.service"
import {
  buildPostingPlan,
  currentMapping,
  loadImport,
  loadMappableCategories,
  postImport,
} from "../services/posting.service"
import { ImportMappingPage } from "../views/import-mapping"
import { ImportResultPage } from "../views/import-result"
import { ImportReviewPage } from "../views/import-review"
import { Layout } from "../views/layout"

/**
 * The posting flow after the upload preview:
 *   /imports/:id/mapping  choose what each timesheet column posts as
 *   /imports/:id/review   exactly what will be sent, and every blocker
 *   /imports/:id/post     post to AltomateHR (draft runs)
 *   /imports/:id          what happened, per company
 */
export const importsRoutes = new Hono<AppEnv>()

function importId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

function flashFrom(ok: string | undefined, err: string | undefined) {
  return ok
    ? ({ type: "ok", msg: ok } as const)
    : err
      ? ({ type: "err", msg: err } as const)
      : null
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

importsRoutes.get("/imports/:id/mapping", requireAuth, async (c) => {
  const user = c.get("user")
  const id = importId(c.req.param("id"))
  const imp = id ? await loadImport(id) : null
  if (!imp) return c.redirect("/convert")

  let categories
  try {
    categories = await loadMappableCategories()
  } catch (err) {
    const msg =
      err instanceof AltomateApiError ? err.message : "Couldn't load AltomateHR's pay items."
    return c.redirect(`/convert?err=${encodeURIComponent(msg)}`)
  }
  const mapping = await currentMapping()
  const lines = imp.parsed.companies.flatMap((g) => g.employees)
  const columns = MAPPABLE_COLUMNS.map((col) => ({
    key: col.key,
    label: col.label,
    defaultCategory: col.defaultCategory,
    selected: mapping[col.key],
    total: round2(lines.reduce((s, l) => s + Math.abs(l[col.key]), 0)),
    employees: lines.filter((l) => l[col.key] !== 0).length,
  }))

  return c.html(
    <Layout
      title="Map columns"
      user={{ name: user.name, email: user.email }}
      flash={flashFrom(c.req.query("ok"), c.req.query("err"))}
    >
      <ImportMappingPage
        importId={imp.record.id}
        period={imp.period}
        columns={columns}
        categories={categories}
      />
    </Layout>,
  )
})

importsRoutes.post("/imports/:id/mapping", requireAuth, async (c) => {
  const user = c.get("user")
  const id = importId(c.req.param("id"))
  if (!id) return c.redirect("/convert")

  const body = await c.req.parseBody()
  // Only codes AltomateHR actually offers are saved; anything else (a
  // tampered form) falls back to "don't import".
  const valid = new Set((await loadMappableCategories()).map((cat) => cat.code))
  await saveColumnMappings(
    MAPPABLE_COLUMNS.map((col) => {
      const v = String(body[`map_${col.key}`] ?? "")
      return { columnKey: col.key, categoryCode: valid.has(v) ? v : null }
    }),
    user.email,
  )
  return c.redirect(`/imports/${id}/review`)
})

importsRoutes.get("/imports/:id/review", requireAuth, async (c) => {
  const user = c.get("user")
  const id = importId(c.req.param("id"))
  if (!id) return c.redirect("/convert")

  let plan
  let categories
  try {
    ;[plan, categories] = await Promise.all([buildPostingPlan(id), loadMappableCategories()])
  } catch (err) {
    const msg = err instanceof AltomateApiError ? err.message : "Couldn't reach AltomateHR."
    return c.redirect(`/imports/${id}/mapping?err=${encodeURIComponent(msg)}`)
  }
  if (!plan) return c.redirect("/convert")
  if (plan.imp.record.status === "POSTED") return c.redirect(`/imports/${id}`)

  return c.html(
    <Layout
      title="Review"
      user={{ name: user.name, email: user.email }}
      flash={flashFrom(c.req.query("ok"), c.req.query("err"))}
    >
      <ImportReviewPage plan={plan} categories={categories} />
    </Layout>,
  )
})

importsRoutes.post("/imports/:id/post", requireAuth, async (c) => {
  const user = c.get("user")
  const id = importId(c.req.param("id"))
  if (!id) return c.redirect("/convert")

  let outcome
  try {
    outcome = await postImport(id, user.email)
  } catch (err) {
    const msg = err instanceof AltomateApiError ? err.message : "Couldn't reach AltomateHR."
    return c.redirect(`/imports/${id}/review?err=${encodeURIComponent(msg)}`)
  }
  if (!outcome.ok) {
    return c.redirect(`/imports/${id}/review?err=${encodeURIComponent(outcome.error)}`)
  }
  const msg =
    outcome.failed > 0
      ? `Posted ${outcome.posted} compan${outcome.posted === 1 ? "y" : "ies"}; one failed — see below.`
      : `Posted ${outcome.posted} compan${outcome.posted === 1 ? "y" : "ies"} as draft runs.`
  return c.redirect(`/imports/${id}?${outcome.failed > 0 ? "err" : "ok"}=${encodeURIComponent(msg)}`)
})

importsRoutes.get("/imports/:id", requireAuth, async (c) => {
  const user = c.get("user")
  const id = importId(c.req.param("id"))
  const imp = id ? await loadImport(id) : null
  if (!imp) return c.redirect("/convert")

  const [runs, companies] = await Promise.all([listRunsForImport(imp.record.id), listCompanies()])
  const nameOf = new Map(
    companies.filter((co) => co.code).map((co) => [co.code!.toUpperCase(), co.name] as const),
  )
  const rows = imp.parsed.companies.map((g) => ({
    code: g.company,
    name: nameOf.get(g.company.toUpperCase()) ?? g.company,
    run: runs.find((r) => r.company_code === g.company),
  }))

  return c.html(
    <Layout
      title="Posted"
      user={{ name: user.name, email: user.email }}
      flash={flashFrom(c.req.query("ok"), c.req.query("err"))}
    >
      <ImportResultPage
        importId={imp.record.id}
        period={imp.period}
        status={imp.record.status}
        companies={rows}
      />
    </Layout>,
  )
})
