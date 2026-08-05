import { Hono } from "hono"

import type { AppEnv } from "../lib/hono-env"
import { requireAuth } from "../middleware/auth.middleware"
import {
  getCompanyByOrgId,
  listCompanies,
  setCompanyCode,
} from "../repositories/company.repository"
import { fetchOwnerOrganizations } from "../services/altomate.service"
import { connectToken, syncOwnerCompanies } from "../services/company.service"
import { loadCompanyRoster } from "../services/roster.service"
import { CompaniesPage } from "../views/companies"
import { CompanyDetailPage, type CompanyTab } from "../views/company-detail"
import { Layout } from "../views/layout"

export const companiesRoutes = new Hono<AppEnv>()

/**
 * Global "Refresh" (nav bar): re-pull the owner's live company roster from
 * AltomateHR and reconcile it (add new companies, drop removed ones, update
 * names), then bounce back to wherever the user clicked from — the runs
 * there refetch live on render. Best-effort: on failure we still redirect,
 * with an error flash, so the page's live runs still reload.
 */
companiesRoutes.post("/refresh", requireAuth, async (c) => {
  const user = c.get("user")
  let key = "ok"
  let msg = "Refreshed from AltomateHR."
  try {
    const orgs = await fetchOwnerOrganizations(user.sub)
    await syncOwnerCompanies(orgs)
    // Force-refresh the per-company roster caches (employees + projects) too.
    const companies = await listCompanies()
    await Promise.all(
      companies.map((co) =>
        loadCompanyRoster(co, { force: true }).catch(() => null),
      ),
    )
  } catch (err) {
    console.error("[abpay] refresh failed:", err)
    key = "err"
    msg = "Couldn't refresh companies from AltomateHR — runs still reloaded."
  }

  // Return to the page the user refreshed from (local pathname only).
  let path = "/"
  const ref = c.req.header("referer")
  if (ref) {
    try {
      path = new URL(ref).pathname || "/"
    } catch {
      /* keep default */
    }
  }
  return c.redirect(`${path}?${key}=${encodeURIComponent(msg)}`)
})

companiesRoutes.get("/companies", requireAuth, async (c) => {
  const user = c.get("user")
  const companies = await listCompanies()
  // Load each company's cached roster (employees + projects) for display.
  const withRoster = await Promise.all(
    companies.map(async (company) => ({
      company,
      roster: await loadCompanyRoster(company),
    })),
  )
  const ok = c.req.query("ok")
  const err = c.req.query("err")
  const flash = ok
    ? ({ type: "ok", msg: ok } as const)
    : err
      ? ({ type: "err", msg: err } as const)
      : null
  return c.html(
    <Layout
      title="Companies"
      user={{ name: user.name, email: user.email }}
      flash={flash}
    >
      <CompaniesPage companies={withRoster} />
    </Layout>,
  )
})

/** Per-company detail page: tabbed employees + projects (from cache). */
companiesRoutes.get("/companies/:orgId", requireAuth, async (c) => {
  const user = c.get("user")
  const orgId = c.req.param("orgId")
  const company = await getCompanyByOrgId(orgId)
  if (!company) {
    return c.redirect("/companies?err=" + encodeURIComponent("Company not found."))
  }
  const roster = await loadCompanyRoster(company)
  const tab: CompanyTab = c.req.query("tab") === "projects" ? "projects" : "employees"
  const q = (c.req.query("q") ?? "").trim()
  const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1)
  return c.html(
    <Layout title={company.name} user={{ name: user.name, email: user.email }}>
      <CompanyDetailPage
        company={company}
        roster={roster}
        tab={tab}
        q={q}
        page={page}
      />
    </Layout>,
  )
})

companiesRoutes.post("/companies/:orgId/token", requireAuth, async (c) => {
  const orgId = c.req.param("orgId")
  const form = await c.req.parseBody()
  const result = await connectToken(orgId, String(form.token ?? ""))
  const q = result.ok
    ? "ok=" + encodeURIComponent("Company connected.")
    : "err=" + encodeURIComponent(result.error)
  return c.redirect("/companies?" + q)
})

companiesRoutes.post("/companies/:orgId/code", requireAuth, async (c) => {
  const orgId = c.req.param("orgId")
  const form = await c.req.parseBody()
  const code = String(form.code ?? "").trim().toUpperCase()
  await setCompanyCode({ altomateOrgId: orgId, code: code || null })
  return c.redirect("/companies?ok=" + encodeURIComponent("Timesheet code saved."))
})
