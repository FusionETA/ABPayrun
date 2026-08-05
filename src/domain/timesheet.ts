/**
 * Ayu Borneo monthly timesheet — parse + normalize.
 *
 * The workbook has ONE sheet, one row per employee-per-outlet. Companies
 * are mixed and split by the `Company` column. An employee can appear on
 * several rows:
 *   - basic split across working outlets (e.g. Fally: 420 @ PM + 1380 @ MA2),
 *   - plus an `HQ` outlet row that's a deduction-only line (basic 0, a
 *     negative `Deduction`, e.g. AH FU: -500 @ HQ).
 * Because of that, EVERY numeric field is summed per employee to get their
 * one true monthly figure. This module is pure (no I/O) so it's easy to
 * test; the SheetJS read lives in the service.
 */

/** One employee's month, aggregated across all their outlet rows. */
export type EmployeeLine = {
  company: string
  /** Original `Staff` cell, e.g. "AL426) Ivy". */
  staffRaw: string
  /** Name with any code prefix stripped, e.g. "Ivy". */
  name: string
  /** Leading staff code if present, e.g. "AL426"; else null. */
  code: string | null
  /** `Group` from the employee's first row (e.g. "FD"). */
  group: string
  /** Every outlet the employee appeared under, e.g. ["PM","MA2"]. */
  outlets: string[]
  basic: number
  /** Unpaid leave (`U/L`). */
  unpaidLeave: number
  travelling: number
  meal: number
  parking: number
  /** OT hours (`Hours`). */
  otHours: number
  /** OT amount (`OT`). */
  otAmount: number
  commission: number
  bonus: number
  /** Signed as in the sheet — negative means a deduction. */
  deduction: number
  totalGross: number
  /** How many timesheet rows merged into this line. */
  sourceRows: number
}

export type CompanyTotals = {
  count: number
  basic: number
  allowances: number
  ot: number
  commission: number
  bonus: number
  deduction: number
  gross: number
}

export type CompanyGroup = {
  company: string
  employees: EmployeeLine[]
  totals: CompanyTotals
}

export type ParsedTimesheet = {
  companies: CompanyGroup[]
  totalEmployees: number
  totalRows: number
  skippedBlankRows: number
  warnings: string[]
}

/** Expected headers → the aliases we accept (matched exact, lowercased). */
const HEADER_FIELDS = {
  staff: ["staff", "name"],
  company: ["company"],
  group: ["group"],
  outlet: ["outlet"],
  basic: ["basic"],
  unpaidLeave: ["u/l", "ul", "unpaid", "unpaid leave"],
  travelling: ["travelling", "traveling", "travel"],
  meal: ["meal"],
  parking: ["parking"],
  otHours: ["hours", "ot hours"],
  otAmount: ["ot", "ot amount"],
  commission: ["comm", "commission"],
  bonus: ["bonus"],
  deduction: ["deduction", "deduct"],
  totalGross: ["total gross", "gross", "total"],
} as const

type FieldKey = keyof typeof HEADER_FIELDS

const STAFF_CODE_RE = /^\s*([A-Za-z]{1,6}\d+)\)\s*(.*)$/

function normHeader(v: unknown): string {
  return String(v ?? "").trim().toLowerCase()
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const n = Number.parseFloat(String(v ?? "").replace(/[, ]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Split "AL426) Ivy" → { code: "AL426", name: "Ivy" }. No code → name only. */
export function parseStaff(raw: string): { code: string | null; name: string } {
  const m = STAFF_CODE_RE.exec(raw)
  if (m && m[2] && m[2].trim()) {
    return { code: m[1]!.toUpperCase(), name: m[2].trim() }
  }
  return { code: null, name: raw.trim() }
}

function buildHeaderIndex(headerRow: unknown[]): Record<FieldKey, number> {
  const normed = headerRow.map(normHeader)
  const idx = {} as Record<FieldKey, number>
  for (const field of Object.keys(HEADER_FIELDS) as FieldKey[]) {
    const aliases = HEADER_FIELDS[field] as readonly string[]
    idx[field] = normed.findIndex((h) => aliases.includes(h))
  }
  return idx
}

function roundLine(line: EmployeeLine): EmployeeLine {
  return {
    ...line,
    basic: round2(line.basic),
    unpaidLeave: round2(line.unpaidLeave),
    travelling: round2(line.travelling),
    meal: round2(line.meal),
    parking: round2(line.parking),
    otHours: round2(line.otHours),
    otAmount: round2(line.otAmount),
    commission: round2(line.commission),
    bonus: round2(line.bonus),
    deduction: round2(line.deduction),
    totalGross: round2(line.totalGross),
  }
}

function companyTotals(employees: EmployeeLine[]): CompanyTotals {
  const t: CompanyTotals = {
    count: employees.length,
    basic: 0,
    allowances: 0,
    ot: 0,
    commission: 0,
    bonus: 0,
    deduction: 0,
    gross: 0,
  }
  for (const e of employees) {
    t.basic += e.basic
    t.allowances += e.travelling + e.meal + e.parking
    t.ot += e.otAmount
    t.commission += e.commission
    t.bonus += e.bonus
    t.deduction += e.deduction
    t.gross += e.totalGross
  }
  t.basic = round2(t.basic)
  t.allowances = round2(t.allowances)
  t.ot = round2(t.ot)
  t.commission = round2(t.commission)
  t.bonus = round2(t.bonus)
  t.deduction = round2(t.deduction)
  t.gross = round2(t.gross)
  return t
}

/**
 * Normalize a raw 2D cell grid (header row + data rows) into per-company,
 * per-employee lines. Blank separator rows are skipped; an employee's
 * outlet rows are summed. `knownCompanies` (optional) drives an
 * "unconfigured company" warning.
 */
export function normalizeTimesheet(
  rows: unknown[][],
  knownCompanies: string[] = [],
): ParsedTimesheet {
  const warnings: string[] = []
  if (!rows.length) {
    return {
      companies: [],
      totalEmployees: 0,
      totalRows: 0,
      skippedBlankRows: 0,
      warnings: ["The sheet is empty."],
    }
  }

  const idx = buildHeaderIndex(rows[0]!)
  if (idx.staff < 0 || idx.company < 0) {
    return {
      companies: [],
      totalEmployees: 0,
      totalRows: 0,
      skippedBlankRows: 0,
      warnings: [
        "Couldn't find the Staff and Company columns — is this the right timesheet?",
      ],
    }
  }

  const cell = (row: unknown[], f: FieldKey): unknown =>
    idx[f] >= 0 ? row[idx[f]] : ""

  const byCompany = new Map<string, Map<string, EmployeeLine>>()
  let dataRows = 0
  let skipped = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const staffRaw = String(cell(row, "staff") ?? "").trim()
    const company = String(cell(row, "company") ?? "").trim().toUpperCase()

    if (!staffRaw && !company) {
      skipped++
      continue
    }
    if (!staffRaw || !company) {
      warnings.push(
        `Row ${r + 1}: missing ${!staffRaw ? "staff name" : "company"} — skipped.`,
      )
      skipped++
      continue
    }
    dataRows++

    const { code, name } = parseStaff(staffRaw)
    const key = code ?? name.toLowerCase()
    const outlet = String(cell(row, "outlet") ?? "").trim()
    const group = String(cell(row, "group") ?? "").trim()

    let compMap = byCompany.get(company)
    if (!compMap) {
      compMap = new Map()
      byCompany.set(company, compMap)
    }
    let line = compMap.get(key)
    if (!line) {
      line = {
        company,
        staffRaw,
        name,
        code,
        group,
        outlets: [],
        basic: 0,
        unpaidLeave: 0,
        travelling: 0,
        meal: 0,
        parking: 0,
        otHours: 0,
        otAmount: 0,
        commission: 0,
        bonus: 0,
        deduction: 0,
        totalGross: 0,
        sourceRows: 0,
      }
      compMap.set(key, line)
    }
    if (outlet && !line.outlets.includes(outlet)) line.outlets.push(outlet)
    line.basic += num(cell(row, "basic"))
    line.unpaidLeave += num(cell(row, "unpaidLeave"))
    line.travelling += num(cell(row, "travelling"))
    line.meal += num(cell(row, "meal"))
    line.parking += num(cell(row, "parking"))
    line.otHours += num(cell(row, "otHours"))
    line.otAmount += num(cell(row, "otAmount"))
    line.commission += num(cell(row, "commission"))
    line.bonus += num(cell(row, "bonus"))
    line.deduction += num(cell(row, "deduction"))
    line.totalGross += num(cell(row, "totalGross"))
    line.sourceRows++
  }

  const known = new Set(knownCompanies.map((c) => c.toUpperCase()))
  const companies: CompanyGroup[] = []
  for (const [company, compMap] of byCompany) {
    const employees = [...compMap.values()]
      .map(roundLine)
      .sort((a, b) => a.name.localeCompare(b.name))
    if (known.size && !known.has(company)) {
      warnings.push(`Company "${company}" isn't a configured ABPay company.`)
    }
    companies.push({ company, employees, totals: companyTotals(employees) })
  }
  companies.sort((a, b) => a.company.localeCompare(b.company))

  return {
    companies,
    totalEmployees: companies.reduce((s, c) => s + c.employees.length, 0),
    totalRows: dataRows,
    skippedBlankRows: skipped,
    warnings,
  }
}
