import { decryptSecret } from "../lib/crypto"
import {
  matchEmployee,
  matchProject,
  type EmployeeMatch,
} from "../domain/matching"
import type {
  CompanyGroup,
  EmployeeLine,
  ParsedTimesheet,
} from "../domain/timesheet"
import type { CompanyRecord } from "../repositories/company.repository"
import {
  AltomateApiError,
  listEmployees,
  listProjects,
  type AltomateEmployee,
  type AltomateProject,
} from "./altomate.service"

export type ValidatedEmployee = EmployeeLine & { match: EmployeeMatch }
export type ValidatedOutlet = {
  outlet: string
  matched: boolean
  projectName: string | null
}

export type CompanyValidation = {
  /** Timesheet company code (e.g. "ABM"). */
  code: string
  /** AltomateHR org name once resolved, else null. */
  companyName: string | null
  /** Resolved to a connected company that has a token. */
  connected: boolean
  /** Fetch/decrypt error (scope/auth/down), else null. */
  error: string | null
  employees: ValidatedEmployee[]
  outlets: ValidatedOutlet[]
  unmatchedEmployees: number
  unmatchedOutlets: number
  /** This company passes: connected, no error, everything matched. */
  ok: boolean
}

export type ValidationReport = {
  companies: CompanyValidation[]
  /** All-or-nothing gate: true iff EVERY company passes. */
  ok: boolean
  /** Human-readable blockers for the preview banner. */
  problems: string[]
}

function distinctOutlets(group: CompanyGroup): string[] {
  return [...new Set(group.employees.flatMap((e) => e.outlets))]
}

function noMatch(): EmployeeMatch {
  return { matched: false, altomateId: null, altomateName: null, method: null }
}

/** Build a fully-unmatched result for a company we couldn't validate. */
function blockedCompany(
  group: CompanyGroup,
  companyName: string | null,
  connected: boolean,
  error: string,
): CompanyValidation {
  const outlets = distinctOutlets(group)
  return {
    code: group.company,
    companyName,
    connected,
    error,
    employees: group.employees.map((e) => ({ ...e, match: noMatch() })),
    outlets: outlets.map((o) => ({ outlet: o, matched: false, projectName: null })),
    unmatchedEmployees: group.employees.length,
    unmatchedOutlets: outlets.length,
    ok: false,
  }
}

async function validateCompany(
  group: CompanyGroup,
  company: CompanyRecord | undefined,
): Promise<CompanyValidation> {
  if (!company) {
    return blockedCompany(
      group,
      null,
      false,
      `Company "${group.company}" isn't set up in AltomateHR (no connected company has this timesheet code).`,
    )
  }
  if (!company.wp_token_enc) {
    return blockedCompany(
      group,
      company.name,
      false,
      `"${company.name}" has no API token connected — connect it on the Companies page.`,
    )
  }

  let employees: AltomateEmployee[]
  let projects: AltomateProject[]
  try {
    const token = decryptSecret(company.wp_token_enc)
    const fetched = await Promise.all([listEmployees(token), listProjects(token)])
    employees = fetched[0]
    projects = fetched[1]
  } catch (err) {
    const error =
      err instanceof AltomateApiError
        ? err.message
        : "Couldn't load employees/projects from AltomateHR."
    return blockedCompany(group, company.name, true, error)
  }

  const validatedEmployees: ValidatedEmployee[] = group.employees.map((e) => ({
    ...e,
    match: matchEmployee(e, employees),
  }))
  const validatedOutlets: ValidatedOutlet[] = distinctOutlets(group).map((o) => {
    const m = matchProject(o, projects)
    return { outlet: o, matched: m.matched, projectName: m.projectName }
  })
  const unmatchedEmployees = validatedEmployees.filter(
    (e) => !e.match.matched,
  ).length
  const unmatchedOutlets = validatedOutlets.filter((o) => !o.matched).length

  return {
    code: group.company,
    companyName: company.name,
    connected: true,
    error: null,
    employees: validatedEmployees,
    outlets: validatedOutlets,
    unmatchedEmployees,
    unmatchedOutlets,
    ok: unmatchedEmployees === 0 && unmatchedOutlets === 0,
  }
}

/**
 * Validate a parsed timesheet against AltomateHR — every company must be
 * connected, and every employee + outlet must resolve. `report.ok` is the
 * hard gate: false blocks the ENTIRE run (never a partial post).
 */
export async function validateTimesheet(
  parsed: ParsedTimesheet,
  companies: CompanyRecord[],
): Promise<ValidationReport> {
  const byCode = new Map<string, CompanyRecord>()
  for (const c of companies) {
    if (c.code) byCode.set(c.code.toUpperCase(), c)
  }

  const results = await Promise.all(
    parsed.companies.map((group) =>
      validateCompany(group, byCode.get(group.company.toUpperCase())),
    ),
  )

  const ok = results.length > 0 && results.every((r) => r.ok)

  const problems: string[] = []
  for (const r of results) {
    if (r.error) {
      problems.push(r.error)
      continue
    }
    if (r.unmatchedEmployees > 0) {
      problems.push(
        `${r.companyName ?? r.code}: ${r.unmatchedEmployees} employee${
          r.unmatchedEmployees === 1 ? "" : "s"
        } not found in AltomateHR.`,
      )
    }
    if (r.unmatchedOutlets > 0) {
      problems.push(
        `${r.companyName ?? r.code}: ${r.unmatchedOutlets} outlet${
          r.unmatchedOutlets === 1 ? "" : "s"
        } not matched to an AltomateHR project.`,
      )
    }
  }

  return { companies: results, ok, problems }
}
