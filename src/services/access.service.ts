import { config } from "../config"
import type { SessionPayload } from "../lib/jwt"
import {
  fetchAccess,
  fetchOwnerOrganizations,
  hasAccessFeature,
  type AltomateAccess,
  type AltomateOrg,
} from "./altomate.service"

/**
 * What the signed-in person may reach, from AltomateHR's Manage access.
 *
 * ABPay reads and posts with each company's own API key, which sees the
 * whole company — AltomateHR can't tell which admin is behind a request. So
 * ABPay is the only gate: it shows a person only the companies they own or
 * administer, only the employees their Manage access allows, and lets them
 * post payroll only where AltomateHR says they may run it.
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

  /** They may create, generate and post this company's payroll. */
  canRunPayroll(orgId: string): boolean {
    if (!this.enforced) return true
    const o = this.orgs.get(orgId)
    return o?.canRunPayroll === true && o.allEmployees === true
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
      canRunPayroll: a.canRunPayroll && a.allEmployees,
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
