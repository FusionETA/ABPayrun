import { config } from "../config"
import type { ParsedTimesheet } from "../domain/timesheet"
import type { SessionPayload } from "../lib/jwt"
import type { CompanyRecord } from "../repositories/company.repository"
import {
  AltomateApiError,
  fetchAccess,
  fetchOwnerOrganizations,
  hasAccessFeature,
  type AltomateAccess,
  type AltomateOrg,
} from "./altomate.service"
import type { PostingPlan } from "./posting.service"
import { validateTimesheet, type ValidationReport } from "./validate.service"

/**
 * What the signed-in person may reach, from AltomateHR's Manage access.
 *
 * ABPay reads and posts with each company's own API key, which sees the
 * whole company — AltomateHR can't tell which admin is behind a request. So
 * ABPay is the only gate: it shows a person only the companies they own or
 * administer, only the employees their Manage access allows, and lets them
 * post payroll only where AltomateHR says they may run it — and, when they
 * are limited to some employees, only for those employees.
 *
 * Until AltomateHR announces `auth.access`, nothing is enforced and ABPay
 * behaves as before. Answers are kept for two minutes (AltomateHR allows 60
 * calls a minute from ABPay's address, shared by everyone); posting asks
 * afresh.
 */

const TTL_MS = 2 * 60_000
const FEATURE_TTL_MS = 5 * 60_000

/** One company as far as this person goes. */
export type CompanyAccess = {
  /** No employee restriction. */
  allEmployees: boolean
  /** The AltomateHR user ids they may see; null when `allEmployees`. */
  employeeUserIds: Set<string> | null
  canRunPayroll: boolean
  canChangeSettings: boolean
  /** The projects (outlets) module is on for them. */
  showProjects: boolean
}

const UNRESTRICTED: CompanyAccess = {
  allEmployees: true,
  employeeUserIds: null,
  canRunPayroll: true,
  canChangeSettings: true,
  showProjects: true,
}

export class Access {
  constructor(
    private readonly user: SessionPayload,
    /** False while AltomateHR can't say (an older AltomateHR, or dev login). */
    readonly enforced: boolean,
    private readonly orgs: Map<string, AltomateOrg>,
    /** Why access couldn't be read (the person then sees nothing). */
    readonly error: string | null = null,
  ) {}

  /** They own or administer this company. */
  canSee(orgId: string): boolean {
    return !this.enforced || this.orgs.has(orgId)
  }

  /**
   * They may create, generate and post this company's payroll. Someone
   * limited to some employees may too, but only for those employees — see
   * peopleOutsideAccess.
   */
  canRunPayroll(orgId: string): boolean {
    if (!this.enforced) return true
    return this.orgs.get(orgId)?.canRunPayroll === true
  }

  /**
   * They see only some of this company's employees. Its company-wide run
   * totals then hold other people's pay, so they aren't shown.
   */
  limitedIn(orgId: string): boolean {
    return this.enforced && this.orgs.get(orgId)?.allEmployees === false
  }

  /** Their access inside one company: employees, payroll, settings, outlets. */
  async company(orgId: string, opts: { fresh?: boolean } = {}): Promise<CompanyAccess | null> {
    if (!this.enforced) return UNRESTRICTED
    if (!this.orgs.has(orgId)) return null
    const a = await cachedAccess(this.user.sub, orgId, opts.fresh ?? false)
    if (!a) return null
    return {
      allEmployees: a.allEmployees,
      employeeUserIds: a.employeeUserIds ? new Set(a.employeeUserIds) : null,
      canRunPayroll: a.canRunPayroll,
      canChangeSettings: a.canChangeSettings,
      showProjects: "projects" in a.modules,
    }
  }
}

let feature: { live: boolean; at: number } | null = null

/** AltomateHR announces `auth.access` (checked every five minutes). */
async function accessFeatureLive(): Promise<boolean> {
  if (feature && Date.now() - feature.at < FEATURE_TTL_MS) return feature.live
  try {
    feature = { live: await hasAccessFeature(), at: Date.now() }
  } catch (err) {
    // Unreachable: keep the last answer, so a blip never switches it off.
    console.warn("[abpay] couldn't check AltomateHR for auth.access:", err)
    feature = { live: feature?.live ?? false, at: Date.now() }
  }
  return feature.live
}

const orgCache = new Map<string, { at: number; orgs: AltomateOrg[] }>()
const accessCache = new Map<string, { at: number; access: AltomateAccess | null }>()

async function cachedAccess(
  userId: string,
  orgId: string,
  fresh: boolean,
): Promise<AltomateAccess | null> {
  const key = `${userId}:${orgId}`
  const hit = accessCache.get(key)
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.access
  const access = await fetchAccess(userId, orgId)
  accessCache.set(key, { at: Date.now(), access })
  return access
}

/**
 * The signed-in person's access. `fresh` skips the two-minute copy (before
 * posting, and on Refresh). When AltomateHR can't be asked, they get no
 * companies and `error` says why — it never falls back to everything.
 */
export async function loadAccess(
  user: SessionPayload,
  opts: { fresh?: boolean } = {},
): Promise<Access> {
  // The dev-only preview login isn't an AltomateHR person.
  if (!config.isProd && user.sub === "dev-user") return new Access(user, false, new Map())
  if (!(await accessFeatureLive())) return new Access(user, false, new Map())

  const hit = orgCache.get(user.sub)
  let orgs = !opts.fresh && hit && Date.now() - hit.at < TTL_MS ? hit.orgs : null
  if (!orgs) {
    try {
      orgs = await fetchOwnerOrganizations(user.sub)
      orgCache.set(user.sub, { at: Date.now(), orgs })
    } catch (err) {
      console.error("[abpay] couldn't read access from AltomateHR:", err)
      return new Access(
        user,
        true,
        new Map(),
        "Couldn't check your access in AltomateHR — try Refresh in a minute.",
      )
    }
  }
  return new Access(user, true, new Map(orgs.map((o) => [o.id, o] as const)))
}

/** Forget a person's kept answers (after sign-in or Refresh). */
export function forgetAccess(userId: string): void {
  orgCache.delete(userId)
  for (const key of accessCache.keys()) {
    if (key.startsWith(`${userId}:`)) accessCache.delete(key)
  }
}

/** A company's employees narrowed to the ones this person may see. */
export function visibleEmployees<T extends { id: string }>(
  employees: T[],
  access: CompanyAccess | null,
): T[] {
  if (!access) return []
  if (!access.employeeUserIds) return employees
  return employees.filter((e) => access.employeeUserIds!.has(e.id))
}

/**
 * The companies on a timesheet this person may not run payroll for, by
 * name. A Company value no company uses isn't listed — validation already
 * stops that.
 */
export function companiesWithoutPayroll(
  access: Access,
  companies: { altomate_org_id: string; name: string; code: string | null }[],
  codes: string[],
): string[] {
  const byCode = new Map(
    companies.filter((c) => c.code).map((c) => [c.code!.toUpperCase(), c] as const),
  )
  const out: string[] = []
  for (const code of new Set(codes.map((c) => c.toUpperCase()))) {
    const company = byCode.get(code)
    if (company && !access.canRunPayroll(company.altomate_org_id)) out.push(company.name)
  }
  return out
}

/** Said when a timesheet includes companies the person can't run payroll for. */
export function noPayrollMessage(names: string[]): string {
  return `Your access in AltomateHR doesn't include running payroll for ${names.join(", ")}. Only someone with payroll access to every company on the timesheet can upload or post it.`
}

/**
 * The people on a timesheet this person's access doesn't cover, as
 * "Company: Name, Name". Someone limited to some employees may post payroll
 * only for them, so any one else on the file refuses the whole file (as an
 * unmatched row does). Rows that match nobody aren't listed: validation
 * already blocks those. `report` saves matching again when the caller has
 * just done it; `fresh` asks AltomateHR afresh (before posting).
 */
export async function peopleOutsideAccess(
  access: Access,
  parsed: ParsedTimesheet,
  companies: CompanyRecord[],
  opts: { fresh?: boolean; report?: ValidationReport } = {},
): Promise<string[]> {
  if (!access.enforced) return []
  const byCode = new Map(
    companies.filter((c) => c.code).map((c) => [c.code!.toUpperCase(), c] as const),
  )

  // Only the companies where they are limited need matching at all.
  const limited = new Map<string, Set<string>>()
  for (const group of parsed.companies) {
    const company = byCode.get(group.company.toUpperCase())
    if (!company || !access.limitedIn(company.altomate_org_id)) continue
    const a = await access.company(company.altomate_org_id, { fresh: opts.fresh })
    limited.set(group.company.toUpperCase(), a?.employeeUserIds ?? new Set())
  }
  if (limited.size === 0) return []

  const report =
    opts.report ??
    (await validateTimesheet(
      { ...parsed, companies: parsed.companies.filter((g) => limited.has(g.company.toUpperCase())) },
      companies,
    ))

  const out: string[] = []
  for (const v of report.companies) {
    const allowed = limited.get(v.code.toUpperCase())
    if (!allowed) continue
    // Couldn't read who's who: every row reads as unmatched, which would
    // pass. Refuse instead — this check must never fail open.
    if (v.error) {
      throw new AltomateApiError(
        "down",
        `Couldn't check who is on the timesheet for ${v.companyName ?? v.code} (${v.error}). Try again in a minute.`,
      )
    }
    const names = v.employees
      .filter((e) => e.match.matched && e.match.altomateId && !allowed.has(e.match.altomateId))
      .map((e) => e.name)
    if (names.length > 0) out.push(`${v.companyName ?? v.code}: ${[...new Set(names)].join(", ")}`)
  }
  return out
}

/** Said when a timesheet includes people the person's access doesn't cover. */
export function outsideAccessMessage(lines: string[]): string {
  return `Your access in AltomateHR doesn't cover everyone on this timesheet — ${lines.join("; ")}. You can post payroll only for the employees your access covers, so take them off the timesheet or ask someone with access to them.`
}

/**
 * The review page's plan as this person may see it. Where they're limited to
 * some employees, the names of anyone else are taken out: who's left out of
 * the run (counted instead), leavers and transfers. Posting still uses the
 * whole plan — the run must leave those people out — so this is a copy, for
 * showing only.
 */
export async function planAsSeenBy(plan: PostingPlan, access: Access): Promise<PostingPlan> {
  if (!access.enforced) return plan
  const out = structuredClone(plan)

  // Who this person may see, per company code: null = everyone.
  const seen = new Map<string, Set<string> | null>()
  const visibleIn = async (code: string, orgId: string | undefined) => {
    const key = code.toUpperCase()
    if (!seen.has(key)) {
      if (!orgId || !access.canSee(orgId)) seen.set(key, new Set())
      else if (!access.limitedIn(orgId)) seen.set(key, null)
      else seen.set(key, (await access.company(orgId))?.employeeUserIds ?? new Set())
    }
    return seen.get(key)!
  }
  const hiddenNames = new Set<string>()

  for (const c of out.companies) {
    const allowed = await visibleIn(c.code, c.company?.altomate_org_id)
    if (!allowed || !c.plan) continue
    const userOf = new Map((c.roster ?? []).map((p) => [p.employeeProfileId, p.userId] as const))
    for (const p of c.roster ?? []) if (!allowed.has(p.userId)) hiddenNames.add(p.name)
    const before = c.plan.excluded.length
    c.plan.excluded = c.plan.excluded.filter((e) => allowed.has(userOf.get(e.employeeProfileId) ?? ""))
    const hidden = before - c.plan.excluded.length
    if (hidden > 0) {
      c.plan.warnings.push(
        `${hidden} other ${hidden === 1 ? "person" : "people"} on ${c.companyName}'s payroll ${hidden === 1 ? "isn't" : "aren't"} on this timesheet and stay${hidden === 1 ? "s" : ""} out of this run.`,
      )
    }
  }

  const byCode = new Map(out.companies.map((c) => [c.code.toUpperCase(), c.company?.altomate_org_id] as const))
  const keep: typeof out.transfers = []
  for (const t of out.transfers) {
    const sees = async (code: string) => {
      const allowed = await visibleIn(code, byCode.get(code.toUpperCase()) ?? undefined)
      return allowed === null || allowed.has(t.userId)
    }
    if ((await sees(t.fromCode)) || (await sees(t.toCode))) keep.push(t)
    else hiddenNames.add(t.name)
  }
  out.transfers = keep

  // Leaver and transfer warnings name people: drop any naming someone hidden.
  const names = [...hiddenNames].filter((n) => n.trim().length > 0)
  if (names.length > 0) {
    for (const c of out.companies) {
      if (c.plan) c.plan.warnings = c.plan.warnings.filter((w) => !names.some((n) => w.includes(n)))
    }
  }
  return out
}
