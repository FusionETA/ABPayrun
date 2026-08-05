import { config } from "../config"

/** One organization the owner can manage in AltomateHR. */
export type AltomateOrg = { id: string; name: string }

/** Identity returned by AltomateHR's POST /api/v1/auth/verify. */
export type AltomateUser = {
  id: string
  name: string
  email: string
  role: string
  organizationId: string | null
  organizationName: string | null
  organizations: AltomateOrg[]
}

/** Result of GET /api/v1/whoami — token introspection. */
export type WhoamiResult = {
  organizationId: string
  tokenName: string
  scopes: string[]
}

/**
 * Low-level call to an AltomateHR /api/v1 endpoint with a bearer token.
 * Every ABPay → AltomateHR request funnels through here.
 */
export async function altomateFetch(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${config.altomate.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
}

/**
 * Verify a user's AltomateHR credentials via the bootstrap auth token.
 *   - 200 → identity (incl. the owner's companies)
 *   - 401/403 → null
 *   - else → throw (so the caller can say "AltomateHR is down")
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AltomateUser | null> {
  const res = await altomateFetch(config.altomate.authToken, "/api/v1/auth/verify", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })

  if (res.status === 200) {
    const json = (await res.json()) as {
      data: {
        id: string
        name: string
        email: string
        role: string
        organizationId?: string | null
        organizationName?: string | null
        organizations?: AltomateOrg[]
      }
    }
    const d = json.data
    return {
      id: d.id,
      name: d.name,
      email: d.email,
      role: d.role,
      organizationId: d.organizationId ?? null,
      organizationName: d.organizationName ?? null,
      // Tolerate an older AltomateHR that doesn't return the list yet.
      organizations: d.organizations ?? [],
    }
  }
  if (res.status === 401 || res.status === 403) {
    // Distinguish an APP-credential problem (bad master key / per-org token
    // / malformed header — NOBODY can log in) from a USER problem (wrong
    // password, or not an admin). AltomateHR uses a fixed set of messages
    // for the former; match those precisely so a user-authorization 403
    // (which mentions "token belongs to") isn't misread as a bad token.
    const body = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null
    const message = body?.error?.message ?? ""
    if (
      /invalid or revoked|requires a master api key|malformed authorization|empty token/i.test(
        message,
      )
    ) {
      throw new Error(
        `AltomateHR rejected ABPay's access credential (${message.trim()})`,
      )
    }
    return null
  }

  const text = await res.text().catch(() => "")
  throw new Error(
    `AltomateHR /auth/verify unexpected ${res.status}: ${text.slice(0, 200)}`,
  )
}

/**
 * Fetch the owner's AltomateHR organizations on demand (for the Refresh
 * button) via POST /api/v1/auth/organizations — the same list login
 * returns, but WITHOUT the password. Authenticated with the app bootstrap
 * token. Throws on any non-200 so the caller can surface the failure.
 */
export async function fetchOwnerOrganizations(userId: string): Promise<AltomateOrg[]> {
  const res = await altomateFetch(
    config.altomate.authToken,
    "/api/v1/auth/organizations",
    { method: "POST", body: JSON.stringify({ userId }) },
  )
  if (res.status === 200) {
    const json = (await res.json()) as { data: { organizations?: AltomateOrg[] } }
    return json.data.organizations ?? []
  }
  const text = await res.text().catch(() => "")
  throw new Error(
    `AltomateHR /auth/organizations unexpected ${res.status}: ${text.slice(0, 200)}`,
  )
}

/**
 * Introspect a wp_live_* token via GET /api/v1/whoami — used to validate a
 * pasted token before storing it (checks validity + which org it's for).
 *   - 200 → { organizationId, scopes, ... }
 *   - 401/403 → null (invalid/revoked)
 *   - else → throw
 */
export async function whoami(token: string): Promise<WhoamiResult | null> {
  const res = await altomateFetch(token, "/api/v1/whoami")

  if (res.status === 200) {
    const json = (await res.json()) as { data: WhoamiResult }
    return json.data
  }
  if (res.status === 401 || res.status === 403) {
    return null
  }

  const text = await res.text().catch(() => "")
  throw new Error(`AltomateHR /whoami unexpected ${res.status}: ${text.slice(0, 200)}`)
}

/**
 * Categorised AltomateHR API failure so callers can distinguish
 * "reconnect the token" (auth) from "token can't read payroll" (scope)
 * from "AltomateHR unreachable" (down) without string-matching.
 */
export class AltomateApiError extends Error {
  constructor(
    public readonly code: "auth" | "scope" | "down",
    message: string,
  ) {
    super(message)
    this.name = "AltomateApiError"
  }
}

export type AltomatePayrollRunStatus = "DRAFT" | "PENDING_APPROVAL" | "SUBMITTED"

/** One payroll run, trimmed to what ABPay renders. */
export type AltomatePayrollRun = {
  id: string
  periodYear: number
  periodMonth: number
  status: AltomatePayrollRunStatus
  gross: number | null
  net: number | null
  employeeCount: number | null
  submittedAt: string | null
  createdAt: string
}

/**
 * List an org's payroll runs via GET /api/v1/payroll-runs. Needs the
 * token's `payroll:read` scope. Ordering is left to the caller. Throws
 * `AltomateApiError` on 401 (auth) / 403 (scope) / anything else (down).
 */
export async function listPayrollRuns(token: string): Promise<AltomatePayrollRun[]> {
  let res: Response
  try {
    res = await altomateFetch(token, "/api/v1/payroll-runs?limit=200")
  } catch {
    throw new AltomateApiError("down", "Couldn't reach AltomateHR.")
  }

  if (res.status === 200) {
    const json = (await res.json()) as {
      data: Array<{
        id: string
        periodYear: number
        periodMonth: number
        status: AltomatePayrollRunStatus
        totals?: {
          gross?: number | null
          net?: number | null
          employeeCount?: number | null
        }
        submittedAt?: string | null
        createdAt: string
      }>
    }
    return json.data.map((r) => ({
      id: r.id,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      status: r.status,
      gross: r.totals?.gross ?? null,
      net: r.totals?.net ?? null,
      employeeCount: r.totals?.employeeCount ?? null,
      submittedAt: r.submittedAt ?? null,
      createdAt: r.createdAt,
    }))
  }
  if (res.status === 401) {
    throw new AltomateApiError("auth", "Token was rejected — reconnect this company.")
  }
  if (res.status === 403) {
    throw new AltomateApiError(
      "scope",
      "Token can't read payroll runs (missing payroll:read scope).",
    )
  }
  const text = await res.text().catch(() => "")
  throw new AltomateApiError("down", `AltomateHR /payroll-runs ${res.status}: ${text.slice(0, 160)}`)
}

/**
 * GET an AltomateHR endpoint that returns `{ data }`, mapping the standard
 * error statuses to a categorised `AltomateApiError`. `missingScope` is the
 * message shown on a 403.
 */
async function altomateGetData<T>(
  token: string,
  path: string,
  missingScope: string,
): Promise<T> {
  let res: Response
  try {
    res = await altomateFetch(token, path)
  } catch {
    throw new AltomateApiError("down", "Couldn't reach AltomateHR.")
  }
  if (res.status === 200) {
    const json = (await res.json()) as { data: T }
    return json.data
  }
  if (res.status === 401) {
    throw new AltomateApiError("auth", "Token was rejected — reconnect this company.")
  }
  if (res.status === 403) {
    throw new AltomateApiError("scope", missingScope)
  }
  const text = await res.text().catch(() => "")
  throw new AltomateApiError("down", `AltomateHR ${path} ${res.status}: ${text.slice(0, 160)}`)
}

/** One AltomateHR employee, trimmed to what matching needs. */
export type AltomateEmployee = {
  id: string
  name: string
  employeeId: string
  projects: Array<{ id: string; name: string }>
}

/**
 * List an org's employees (needs the token's `employees:read` scope).
 * Requests the max page size (200) — Ayu Borneo companies are well under
 * that; `hasMore` on the response would flag if a company ever exceeds it.
 */
export async function listEmployees(token: string): Promise<AltomateEmployee[]> {
  const data = await altomateGetData<
    Array<{
      id: string
      name: string
      employeeId: string
      projects?: Array<{ id: string; name: string }>
    }>
  >(token, "/api/v1/employees?limit=200", "Token can't read employees (missing employees:read scope).")
  return data.map((e) => ({
    id: e.id,
    name: e.name,
    employeeId: e.employeeId,
    projects: e.projects ?? [],
  }))
}

/** One AltomateHR project, trimmed to what matching needs. */
export type AltomateProject = { id: string; name: string; status: string | null }

/** List an org's projects (needs the token's `projects:read` scope). */
export async function listProjects(token: string): Promise<AltomateProject[]> {
  const data = await altomateGetData<
    Array<{ id: string; name: string; status?: string | null }>
  >(token, "/api/v1/projects", "Token can't read projects (missing projects:read scope).")
  return data.map((p) => ({ id: p.id, name: p.name, status: p.status ?? null }))
}
