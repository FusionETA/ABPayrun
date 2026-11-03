import { Hono } from "hono"

import type { AppEnv } from "../lib/hono-env"
import { requireAuth } from "../middleware/auth.middleware"
import {
  getCompanyByOrgId,
  listCompanies,
  setCompanyCode,
} from "../repositories/company.repository"
import { forgetAccess, loadAccess, type Access } from "../services/access.service"
import { AltomateApiError, fetchOwnerOrganizations } from "../services/altomate.service"
import { connectToken, syncOwnerCompanies } from "../services/company.service"
import { loadCompanyRoster, rosterFor } from "../services/roster.service"
import { CompaniesPage } from "../views/companies"
import { CompanyDetailPage, type CompanyTab } from "../views/company-detail"
import { Layout } from "../views/layout"

export const companiesRoutes = new Hono<AppEnv>()

/**
 * May change this company's ABPay settings (its API key and timesheet code):
 * they administer it and AltomateHR's Manage access lets them change its
 * settings. Asked afresh — it guards a write.
 */
const NO_SETTINGS =
  "Your access in AltomateHR doesn't let you change this company's settings."

async function canChangeSettings(access: Access, orgId: string): Promise<boolean> {
  if (!access.canSee(orgId)) return false
  try {
    return (await access.company(orgId, { fresh: true }))?.canChangeSettings === true
  } catch {
    return false
  }
}

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
    await syncOwnerCompanies(orgs, user.role)
    // Read their access afresh too: it may have changed in AltomateHR.
    forgetAccess(user.sub)
    const access = await loadAccess(user, { fresh: true })
    // Force-refresh the per-company roster caches (employees + projects) too.
    const companies = (await listCompanies()).filter((co) => access.canSee(co.altomate_org_id))
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
  const access = c.get("access")
  // Only the companies they own or administer, each narrowed to the
  // employees their Manage access allows.
  const companies = (await listCompanies()).filter((co) => access.canSee(co.altomate_org_id))
  let accessError = access.error
  const withRoster = await Promise.all(
    companies.map(async (company) => {
      const roster = await loadCompanyRoster(company)
      try {
        return { company, roster: rosterFor(roster, await access.company(company.altomate_org_id)) }
      } catch (e) {
        accessError = e instanceof AltomateApiError ? e.message : "Couldn't check your access."
        return { company, roster: rosterFor(roster, null) }
      }
    }),
  )
  const ok = c.req.query("ok")
  const err = c.req.query("err") ?? accessError ?? undefined
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
  const access = c.get("access")
  const company = access.canSee(orgId) ? await getCompanyByOrgId(orgId) : undefined
  if (!company) {
    return c.redirect("/companies?err=" + encodeURIComponent("Company not found."))
  }
  let companyAccess
  try {
    companyAccess = await access.company(orgId)
  } catch (e) {
    const msg = e instanceof AltomateApiError ? e.message : "Couldn't check your access."
    return c.redirect("/companies?err=" + encodeURIComponent(msg))
  }
  const roster = rosterFor(await loadCompanyRoster(company), companyAccess)
  const tab: CompanyTab =
    c.req.query("tab") === "projects" && !roster?.projectsHidden ? "projects" : "employees"
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
  if (!(await canChangeSettings(c.get("access"), orgId))) {
    return c.redirect("/companies?err=" + encodeURIComponent(NO_SETTINGS))
  }
  const form = await c.req.parseBody()
  const result = await connectToken(orgId, String(form.token ?? ""))
  const q = result.ok
    ? "ok=" + encodeURIComponent("Company connected.")
    : "err=" + encodeURIComponent(result.error)
  return c.redirect("/companies?" + q)
})

companiesRoutes.post("/companies/:orgId/code", requireAuth, async (c) => {
  const orgId = c.req.param("orgId")
  if (!(await canChangeSettings(c.get("access"), orgId))) {
    return c.redirect("/companies?err=" + encodeURIComponent(NO_SETTINGS))
  }
  const form = await c.req.parseBody()
  const code = String(form.code ?? "").trim().toUpperCase()
  await setCompanyCode({ altomateOrgId: orgId, code: code || null })
  // The Convert page's "Needs attention" saves here too and wants to come
  // back. Only a same-site path is honoured, never a full URL.
  const next = String(form.next ?? "")
  const back = next === "/convert" ? "/convert" : "/companies"
  return c.redirect(`${back}?ok=` + encodeURIComponent("Timesheet code saved."))
})
