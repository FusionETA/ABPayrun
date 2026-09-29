import { config } from "../config"

/** One organization the owner can manage in AltomateHR. */
export type AltomateOrg = { id: string; name: string }

/** Identity returned by AltomateHR's POST /auth/verify. */
export type AltomateUser = {
  id: string
  name: string
  email: string
  role: string
  organizationId: string | null
  organizationName: string | null
  organizations: AltomateOrg[]
}

/** Result of GET /whoami — token introspection. */
export type WhoamiResult = {
  organizationId: string
  tokenName: string | null
  scopes: string[]
}

/** AltomateHR's error text, from `{ message }` or `{ error: { message } }`. */
async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as
    | { message?: string; error?: { message?: string } }
    | null
  return body?.error?.message ?? body?.message ?? ""
}

/**
 * Low-level call to an AltomateHR API endpoint with a bearer token.
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
  const res = await altomateFetch(config.altomate.authToken, "/auth/verify", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })

  if (res.status === 200) {
    const d = (await res.json()) as {
      id: string
      name: string
      email: string
      role: string
      organizationId?: string | null
      organizationName?: string | null
      organizations?: Array<{ id: string; name: string }>
    }
    return {
      id: d.id,
      name: d.name,
      email: d.email,
      // v2 says "Owner" / "Admin"; ABPay has always shown them upper-case.
      role: d.role.toUpperCase(),
      organizationId: d.organizationId ?? null,
      organizationName: d.organizationName ?? null,
      organizations: (d.organizations ?? []).map((o) => ({ id: o.id, name: o.name })),
    }
  }
  if (res.status === 401 || res.status === 403) {
    // Distinguish an APP-credential problem (bad or revoked master key —
    // NOBODY can log in) from a USER problem (wrong password, not an admin).
    // AltomateHR says "Invalid or revoked …" only for the former.
    const message = await errorMessage(res)
    if (/invalid or revoked/i.test(message)) {
      throw new Error(`AltomateHR rejected ABPay's access credential (${message.trim()})`)
    }
    return null
  }
  if (res.status === 429) {
    throw new Error("Too many sign-in attempts — wait a minute and try again.")
  }

  const text = await res.text().catch(() => "")
  throw new Error(
    `AltomateHR /auth/verify unexpected ${res.status}: ${text.slice(0, 200)}`,
  )
}

/**
 * Fetch the owner's AltomateHR organizations on demand (for the Refresh
 * button) via POST /auth/organizations — the same list login returns, but
 * WITHOUT the password. Authenticated with the app bootstrap (master) key.
 * Throws on any non-200 so the caller can surface the failure.
 */
export async function fetchOwnerOrganizations(userId: string): Promise<AltomateOrg[]> {
  const res = await altomateFetch(
    config.altomate.authToken,
    "/auth/organizations",
    { method: "POST", body: JSON.stringify({ userId }) },
  )
  if (res.status === 200) {
    const json = (await res.json()) as { organizations?: Array<{ id: string; name: string }> }
    return (json.organizations ?? []).map((o) => ({ id: o.id, name: o.name }))
  }
  const text = await res.text().catch(() => "")
  throw new Error(
    `AltomateHR /auth/organizations unexpected ${res.status}: ${text.slice(0, 200)}`,
  )
}

/**
 * Introspect a wp_live_* token via GET /whoami — used to validate a
 * pasted token before storing it (checks validity + which org it's for).
 *   - 200 → { organizationId, scopes, ... }
 *   - 401/403 → null (invalid/revoked)
 *   - else → throw
 */
export async function whoami(token: string): Promise<WhoamiResult | null> {
  const res = await altomateFetch(token, "/whoami")

  if (res.status === 200) {
    const d = (await res.json()) as {
      organizationId: string
      tokenName?: string | null
      scopes?: string[]
    }
    return { organizationId: d.organizationId, tokenName: d.tokenName ?? null, scopes: d.scopes ?? [] }
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
 * List an org's payroll runs via GET /payroll/runs (the same list AltomateHR's
 * own Payroll screen shows). Needs the token's `payroll:read` scope and the
 * company's Payroll module. Ordering is left to the caller.
 */
export async function listPayrollRuns(token: string): Promise<AltomatePayrollRun[]> {
  const data = await altomateGet<
    Array<{
      id: string
      periodYear: number
      periodMonth: number
      status: AltomatePayrollRunStatus
      totalGross?: number | null
      totalNet?: number | null
      employeeCount?: number | null
      submittedAt?: string | null
      createdAt: string
    }>
  >(token, "/payroll/runs", "Token can't read payroll runs (missing payroll:read scope).")
  return data.map((r) => ({
    id: r.id,
    periodYear: r.periodYear,
    periodMonth: r.periodMonth,
    status: r.status,
    gross: r.totalGross ?? null,
    net: r.totalNet ?? null,
    employeeCount: r.employeeCount ?? null,
    submittedAt: r.submittedAt ?? null,
    createdAt: r.createdAt,
  }))
}

/**
 * GET an AltomateHR endpoint that returns a JSON body, mapping the standard
 * error statuses to a categorised `AltomateApiError`. `missingScope` is the
 * message shown on a 403.
 */
async function altomateGet<T>(
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
    return (await res.json()) as T
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
  /** AltomateHR user id. */
  id: string
  name: string
  /** The employee number — what the timesheet's staff code matches. */
  employeeId: string
}

/**
 * List an org's staff via GET /employees. Employees and supervisors only —
 * the people on payroll; admins and owners are not on the timesheet.
 */
export async function listEmployees(token: string): Promise<AltomateEmployee[]> {
  const data = await altomateGet<
    Array<{ id: string; name: string; employeeNumber?: string | null; role: string }>
  >(token, "/employees", "Token can't read employees (missing employees:read scope).")
  return data
    .filter((e) => e.role === "Employee" || e.role === "Supervisor")
    .map((e) => ({ id: e.id, name: e.name, employeeId: e.employeeNumber ?? "" }))
}

/** One AltomateHR project, trimmed to what matching needs. */
export type AltomateProject = { id: string; name: string; status: string | null }

/** List an org's active projects via GET /projects (needs `projects:read`). */
export async function listProjects(token: string): Promise<AltomateProject[]> {
  const data = await altomateGet<Array<{ id: string; name: string; isArchived?: boolean }>>(
    token,
    "/projects",
    "Token can't read projects (missing projects:read scope).",
  )
  return data
    .filter((p) => !p.isArchived)
    .map((p) => ({ id: p.id, name: p.name, status: "ACTIVE" }))
}
