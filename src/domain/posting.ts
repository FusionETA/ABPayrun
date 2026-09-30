/**
 * Posting plan: turn a validated timesheet + the column mapping into exactly
 * what will be sent to AltomateHR for one company — each person's new basic
 * salary (if it changed) and their manual pay lines — plus everything that
 * must stop the post. Pure (no I/O): the same plan is shown on the review
 * screen and then executed, so what you approve is what is sent.
 */

import type { EmployeeLine } from "./timesheet"

/** A timesheet column that posts as an AltomateHR pay item. */
export type MappableColumn = {
  key: MappableKey
  label: string
  /** The category used until someone saves a mapping. */
  defaultCategory: string
}

export type MappableKey =
  | "travelling"
  | "meal"
  | "parking"
  | "otAmount"
  | "commission"
  | "bonus"
  | "unpaidLeave"
  | "deduction"

/**
 * Basic is not here: it sets the person's salary in AltomateHR. Total Gross
 * is not either: it's the sheet's own total, shown for reference only.
 */
export const MAPPABLE_COLUMNS: readonly MappableColumn[] = [
  { key: "travelling", label: "Travelling", defaultCategory: "allowance_travel_private" },
  { key: "meal", label: "Meal", defaultCategory: "allowance_meal" },
  { key: "parking", label: "Parking", defaultCategory: "allowance_parking" },
  { key: "otAmount", label: "OT", defaultCategory: "wages_overtime" },
  { key: "commission", label: "Comm", defaultCategory: "wages_commission" },
  { key: "bonus", label: "Bonus", defaultCategory: "wages_bonus_non_annual" },
  { key: "unpaidLeave", label: "U/L", defaultCategory: "deduct_unpaid_leave" },
  { key: "deduction", label: "Deduction", defaultCategory: "deduct_miscellaneous" },
]

/** Column key → category code, or null for "don't import". */
export type ColumnMapping = Record<MappableKey, string | null>

export function resolveMapping(saved: Map<string, string | null>): ColumnMapping {
  const out = {} as ColumnMapping
  for (const col of MAPPABLE_COLUMNS) {
    out[col.key] = saved.has(col.key) ? (saved.get(col.key) ?? null) : col.defaultCategory
  }
  return out
}

export type PlanCategory = {
  code: string
  label: string
  kind: "ALLOWANCE" | "DEDUCTION" | "REIMBURSEMENT"
}

export type PlanPayrollEmployee = {
  employeeProfileId: string
  userId: string
  name: string
  email: string
  salaryType: "MONTHLY" | "HOURLY"
  monthlySalary: number | null
  joinDate: string | null
  leaveDate: string | null
  isArchived: boolean
  notPayableReason: string | null
  hasPayrollProfile: boolean
}

export type PlanLine = {
  column: MappableKey
  columnLabel: string
  category: string
  categoryLabel: string
  kind: PlanCategory["kind"]
  /** Positive; `kind` says whether it adds or deducts. */
  amount: number
}

export type EmployeePlan = {
  name: string
  code: string | null
  employeeProfileId: string
  email: string
  currentSalary: number | null
  /** The timesheet Basic when it differs from AltomateHR; else null (no change). */
  newSalary: number | null
  lines: PlanLine[]
  /** The sheet's Total Gross, for reference. */
  sheetGross: number
}

export type CompanyPlan = {
  employees: EmployeePlan[]
  /** On AltomateHR's payroll but not on the timesheet: left out of the run. */
  excluded: { employeeProfileId: string; name: string }[]
  /** Anything here blocks the post. */
  problems: string[]
  /** Worth reading, but doesn't block. */
  warnings: string[]
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function money(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "2026-09-15..." falls inside the period? */
function inPeriod(iso: string | null, period: { year: number; month: number }): boolean {
  if (!iso) return false
  const [y, m] = iso.slice(0, 7).split("-").map(Number)
  return y === period.year && m === period.month
}

export function planCompany(input: {
  period: { year: number; month: number }
  /** Timesheet lines with the AltomateHR USER id each one matched (null = unmatched). */
  lines: (EmployeeLine & { matchedUserId: string | null })[]
  payrollEmployees: PlanPayrollEmployee[]
  mapping: ColumnMapping
  categories: PlanCategory[]
}): CompanyPlan {
  const { period, mapping } = input
  const problems: string[] = []
  const warnings: string[] = []
  const byUser = new Map(input.payrollEmployees.map((p) => [p.userId, p]))
  const categories = new Map(input.categories.map((c) => [c.code, c]))
  const seen = new Map<string, string>()
  const employees: EmployeePlan[] = []

  for (const col of MAPPABLE_COLUMNS) {
    const code = mapping[col.key]
    if (code && !categories.has(code)) {
      problems.push(`The ${col.label} column is mapped to "${code}", which AltomateHR doesn't have.`)
    }
  }

  // Columns with money in them but set to "don't import" — said once per column.
  for (const col of MAPPABLE_COLUMNS) {
    if (mapping[col.key]) continue
    const total = round2(input.lines.reduce((s, l) => s + Math.abs(l[col.key]), 0))
    if (total > 0) {
      warnings.push(`${col.label} isn't imported: ${money(total)} on the timesheet is left out.`)
    }
  }

  for (const line of input.lines) {
    const who = line.code ? `${line.name} (${line.code})` : line.name
    if (!line.matchedUserId) {
      problems.push(`${who} isn't matched to an AltomateHR employee.`)
      continue
    }
    const earlier = seen.get(line.matchedUserId)
    if (earlier) {
      problems.push(`${who} and ${earlier} match the same AltomateHR employee.`)
      continue
    }
    seen.set(line.matchedUserId, who)

    const profile = byUser.get(line.matchedUserId)
    if (!profile || !profile.hasPayrollProfile) {
      problems.push(`${who} has no payroll profile in AltomateHR — set one up first.`)
      continue
    }
    if (profile.isArchived) {
      problems.push(`${who} is archived in AltomateHR.`)
      continue
    }
    if (profile.notPayableReason) {
      problems.push(`${who} can't be paid in AltomateHR yet: ${profile.notPayableReason}`)
      continue
    }
    if (profile.salaryType === "HOURLY") {
      problems.push(
        `${who} is paid hourly in AltomateHR; ABPay sets a monthly Basic. Change them to monthly first.`,
      )
      continue
    }

    const basic = round2(line.basic)
    if (basic <= 0) {
      problems.push(
        `${who} has no Basic on the timesheet — AltomateHR would pay their profile salary. Add it, or remove them from the sheet.`,
      )
      continue
    }
    const current = profile.monthlySalary
    const newSalary = current != null && round2(current) === basic ? null : basic

    if (inPeriod(profile.joinDate, period) || inPeriod(profile.leaveDate, period)) {
      warnings.push(
        `${who} ${inPeriod(profile.joinDate, period) ? "joined" : "leaves"} this month: AltomateHR prorates the salary by date, so the Basic should be the full-month rate.`,
      )
    }

    const lines: PlanLine[] = []
    for (const col of MAPPABLE_COLUMNS) {
      const value = round2(line[col.key])
      const code = mapping[col.key]
      if (!code || value === 0) continue
      const cat = categories.get(code)
      if (!cat) continue // reported above
      if (cat.kind !== "DEDUCTION" && value < 0) {
        problems.push(
          `${who}: ${col.label} is ${money(value)}, but it's mapped to an allowance. Map it to a deduction or fix the sheet.`,
        )
        continue
      }
      // The sheet writes deductions as negatives; a positive one is ambiguous.
      if (col.key === "deduction" && value > 0) {
        problems.push(
          `${who}: Deduction is +${money(value)}. Deductions are negative on the timesheet — check the sign.`,
        )
        continue
      }
      lines.push({
        column: col.key,
        columnLabel: col.label,
        category: code,
        categoryLabel: cat.label,
        kind: cat.kind,
        amount: Math.abs(value),
      })
    }

    employees.push({
      name: line.name,
      code: line.code,
      employeeProfileId: profile.employeeProfileId,
      email: profile.email,
      currentSalary: current,
      newSalary,
      lines,
      sheetGross: round2(line.totalGross),
    })
  }

  const posted = new Set(employees.map((e) => e.employeeProfileId))
  const matchedUsers = new Set(seen.keys())
  const excluded = input.payrollEmployees
    .filter(
      (p) =>
        p.hasPayrollProfile &&
        !p.isArchived &&
        !posted.has(p.employeeProfileId) &&
        !matchedUsers.has(p.userId),
    )
    .map((p) => ({ employeeProfileId: p.employeeProfileId, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { employees, excluded, problems, warnings }
}
