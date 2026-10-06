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
  // A FormData body sets its own multipart Content-Type (with the boundary).
  const json = !(init.body instanceof FormData)
  return fetch(`${config.altomate.baseUrl}${path}`, {
    ...init,
    headers: {
      ...(json ? { "Content-Type": "application/json" } : {}),
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
    // conflict = 409 (e.g. the month's run already exists); invalid = 400/404.
    public readonly code: "auth" | "scope" | "down" | "conflict" | "invalid",
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
  costToEmployer: number | null
  generatedAt: string | null
  submittedAt: string | null
  createdAt: string
  /**
   * AltomateHR pays the figures as sent, without prorating part-month staff.
   * Null from an AltomateHR that doesn't have the flag yet.
   */
  skipProration: boolean | null
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
      totalCostToEmployer?: number | null
      generatedAt?: string | null
      submittedAt?: string | null
      createdAt: string
      skipProration?: boolean
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
    costToEmployer: r.totalCostToEmployer ?? null,
    generatedAt: r.generatedAt ?? null,
    submittedAt: r.submittedAt ?? null,
    createdAt: r.createdAt,
    skipProration: r.skipProration ?? null,
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

// ---------------------------------------------------------------------------
// Posting payroll (needs payroll:read + payroll:write)
// ---------------------------------------------------------------------------

/**
 * AltomateHR's error text from any of its error shapes: `{ error: "…" }`
 * (conflicts), `{ error: { message } }` (auth/scope/module), `{ message }`,
 * or ASP.NET's validation problem `{ errors: { Field: ["…"] } }`.
 */
function describeError(body: unknown): string {
  if (!body || typeof body !== "object") return ""
  const b = body as {
    error?: string | { message?: string }
    message?: string
    errors?: Record<string, string[]> | { row: number; message: string }[]
    title?: string
  }
  if (typeof b.error === "string") return b.error
  if (b.error?.message) return b.error.message
  // An import's rejection: a summary plus row-level errors.
  if (Array.isArray(b.errors)) {
    const first = b.errors[0]
    return [b.message, first ? `Row ${first.row}: ${first.message}` : ""].filter(Boolean).join(" ")
  }
  if (b.message) return b.message
  if (b.errors) {
    const first = Object.values(b.errors).flat()[0]
    if (first) return first
  }
  return b.title ?? ""
}

/**
 * Send a request to AltomateHR and return its JSON body, turning every
 * failure into an `AltomateApiError` carrying AltomateHR's own message — a
 * posting error has to say what went wrong, not just the status code.
 */
async function altomateSend<T>(
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response
  try {
    res = await altomateFetch(token, path, {
      method,
      body:
        body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    })
  } catch {
    throw new AltomateApiError("down", "Couldn't reach AltomateHR.")
  }
  if (res.ok) {
    const text = await res.text()
    return (text ? JSON.parse(text) : null) as T
  }
  const parsed = await res.json().catch(() => null)
  const message = describeError(parsed) || `AltomateHR ${method} ${path} returned ${res.status}.`
  if (res.status === 401) {
    throw new AltomateApiError("auth", "Token was rejected — reconnect this company.")
  }
  // A 403 is a missing scope OR a plan without the payroll module; the
  // message says which.
  if (res.status === 403) throw new AltomateApiError("scope", message)
  if (res.status === 409) throw new AltomateApiError("conflict", message)
  if (res.status === 400 || res.status === 404) throw new AltomateApiError("invalid", message)
  throw new AltomateApiError("down", message)
}

/** One person on an org's payroll (GET /payroll/employees). */
export type AltomatePayrollEmployee = {
  /** The id payroll adjustments are keyed by — NOT the user id. */
  employeeProfileId: string
  userId: string
  name: string
  email: string
  employeeNumber: string | null
  salaryType: "MONTHLY" | "HOURLY"
  monthlySalary: number | null
  joinDate: string | null
  leaveDate: string | null
  isArchived: boolean
  notPayableReason: string | null
  /** False for a member with no payroll profile yet (its profile id is a placeholder). */
  hasPayrollProfile: boolean
}

export async function listPayrollEmployees(token: string): Promise<AltomatePayrollEmployee[]> {
  const rows = await altomateSend<AltomatePayrollEmployee[]>(token, "GET", "/payroll/employees")
  return rows.map((r) => ({
    employeeProfileId: r.employeeProfileId,
    userId: r.userId,
    name: r.name,
    email: r.email,
    employeeNumber: r.employeeNumber ?? null,
    salaryType: r.salaryType,
    monthlySalary: r.monthlySalary ?? null,
    joinDate: r.joinDate ?? null,
    leaveDate: r.leaveDate ?? null,
    isArchived: r.isArchived,
    notPayableReason: r.notPayableReason ?? null,
    hasPayrollProfile: r.hasPayrollProfile ?? true,
  }))
}

/** An AltomateHR pay item a timesheet column can be posted as. */
export type AltomateAdjustmentCategory = {
  code: string
  label: string
  kind: "ALLOWANCE" | "DEDUCTION" | "REIMBURSEMENT"
  /** ALLOWANCE | REMUNERATION | BENEFIT_IN_KIND | DEDUCTION */
  group: string
  cashNeutral: boolean
  feedsLp1Relief: boolean
  nonCash: boolean
}

export async function listAdjustmentCategories(
  token: string,
): Promise<AltomateAdjustmentCategory[]> {
  const rows = await altomateSend<AltomateAdjustmentCategory[]>(
    token,
    "GET",
    "/payroll/adjustment-categories",
  )
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    kind: r.kind,
    group: r.group,
    cashNeutral: !!r.cashNeutral,
    feedsLp1Relief: !!r.feedsLp1Relief,
    nonCash: !!r.nonCash,
  }))
}

/** The run fields ABPay reads back after creating / generating one. */
export type AltomateRunDetail = {
  id: string
  status: AltomatePayrollRunStatus
  periodYear: number
  periodMonth: number
  employeeCount: number
  totalGross: number
  totalNet: number
  totalCostToEmployer: number
  /** Missing from an AltomateHR that doesn't have the flag yet. */
  skipProration?: boolean
  /** True when the run changed after payroll was run and must be run again. */
  isStale?: boolean
}

/**
 * Create the month's DRAFT run. `excludedEmployeeProfileIds` keeps people
 * who aren't on the timesheet out of it. `skipProration` is always on:
 * ABPay's figures are final (part-month staff are already prorated on the
 * timesheet), so AltomateHR mustn't prorate them again. An AltomateHR that
 * doesn't have the flag yet ignores it — `setRunSkipProration` then tells.
 * A run that already exists for the month is a 409 →
 * `AltomateApiError("conflict")`.
 */
export async function createPayrollRun(
  token: string,
  input: { periodYear: number; periodMonth: number; excludedEmployeeProfileIds: string[] },
): Promise<AltomateRunDetail> {
  return altomateSend<AltomateRunDetail>(token, "POST", "/payroll/runs", {
    ...input,
    skipProration: true,
  })
}

/**
 * Turn on `skipProration` for an existing DRAFT run (PATCH). "unsupported"
 * when AltomateHR doesn't have the flag yet (the PATCH route answers 404 or
 * 405). A run that isn't a draft any more is a 409 →
 * `AltomateApiError("conflict")` with AltomateHR's message.
 */
export async function setRunSkipProration(
  token: string,
  runId: string,
): Promise<"set" | "unsupported"> {
  let res: Response
  try {
    res = await altomateFetch(token, `/payroll/runs/${encodeURIComponent(runId)}`, {
      method: "PATCH",
      body: JSON.stringify({ skipProration: true }),
    })
  } catch {
    throw new AltomateApiError("down", "Couldn't reach AltomateHR.")
  }
  if (res.ok) return "set"
  if (res.status === 404 || res.status === 405) return "unsupported"
  const message =
    describeError(await res.json().catch(() => null)) ||
    `AltomateHR PATCH /payroll/runs/${runId} returned ${res.status}.`
  if (res.status === 401) {
    throw new AltomateApiError("auth", "Token was rejected — reconnect this company.")
  }
  if (res.status === 403) throw new AltomateApiError("scope", message)
  if (res.status === 409) throw new AltomateApiError("conflict", message)
  if (res.status === 400) throw new AltomateApiError("invalid", message)
  throw new AltomateApiError("down", message)
}

/**
 * Delete a run that isn't submitted yet — how a re-import replaces the draft
 * an earlier upload made. A run AltomateHR won't delete fails with its reason.
 */
export async function deletePayrollRun(token: string, runId: string): Promise<void> {
  await altomateSend(token, "DELETE", `/payroll/runs/${encodeURIComponent(runId)}`)
}

export async function getPayrollRun(token: string, runId: string): Promise<AltomateRunDetail> {
  const detail = await altomateSend<{ run: AltomateRunDetail }>(
    token,
    "GET",
    `/payroll/runs/${encodeURIComponent(runId)}`,
  )
  return detail.run
}

/** One manual pay line on a person's run adjustment. */
export type AltomateManualLine = {
  category: string
  label: string
  /** Always positive; the category decides allowance vs deduction. */
  amount: number
  treatAsRecurring: boolean
}

/** Replace one person's adjustment on a DRAFT run (PUT replaces the row). */
export async function saveRunAdjustment(
  token: string,
  runId: string,
  employeeProfileId: string,
  input: { manualLineItems: AltomateManualLine[]; notes: string },
): Promise<void> {
  await altomateSend(
    token,
    "PUT",
    `/payroll/runs/${encodeURIComponent(runId)}/adjustments/${encodeURIComponent(employeeProfileId)}`,
    {
      otNormalHours: 0,
      otRestHours: 0,
      otPublicHours: 0,
      manualLineItems: input.manualLineItems,
      fixedAllowanceOverrides: {},
      notes: input.notes,
    },
  )
}

export type AltomateGenerateResult = {
  payslipCount: number
  skippedEmployees: { employeeProfileId: string; name: string; reason: string }[]
  run: AltomateRunDetail
}

/** "Run payroll" on a DRAFT: builds every payslip (EPF, SOCSO, EIS, PCB). */
export async function generatePayrollRun(
  token: string,
  runId: string,
): Promise<AltomateGenerateResult> {
  const r = await altomateSend<{
    payslipCount: number
    skippedEmployees: AltomateGenerateResult["skippedEmployees"]
    detail: { run: AltomateRunDetail }
  }>(token, "POST", `/payroll/runs/${encodeURIComponent(runId)}/generate`)
  return { payslipCount: r.payslipCount, skippedEmployees: r.skippedEmployees, run: r.detail.run }
}

export type SalaryChangeReason = "RAISE" | "PROMOTION" | "DEMOTION" | "RESTRUCTURE" | "OTHER"

/**
 * Set new basic salaries through AltomateHR's salary-change import (all or
 * nothing, each change recorded in the person's salary history). The new
 * salary applies straight away; `effectiveDate` (YYYY-MM-DD, today or
 * earlier) is the date the history records it from.
 */
export async function importSalaryChanges(
  token: string,
  rows: {
    email: string
    newSalary: number
    effectiveDate: string
    reason: SalaryChangeReason
    notes: string
  }[],
): Promise<{ changed: number }> {
  const csvField = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [
    "Email,New Salary,Effective Date,Reason,Notes",
    ...rows.map((r) =>
      [
        csvField(r.email),
        r.newSalary.toFixed(2),
        r.effectiveDate,
        r.reason,
        csvField(r.notes),
      ].join(","),
    ),
  ]
  const form = new FormData()
  form.append(
    "file",
    new Blob([lines.join("\r\n")], { type: "text/csv" }),
    "abpay-salary-changes.csv",
  )
  const r = await altomateSend<{ changed: number }>(
    token,
    "POST",
    "/payroll/salary-changes/import",
    form,
  )
  return { changed: r?.changed ?? 0 }
}
