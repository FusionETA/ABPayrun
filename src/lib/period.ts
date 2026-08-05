/**
 * Payroll period helpers. A "period" is a single calendar month, matching
 * AltomateHR's one-run-per-month model (`PayrollRun` is unique on
 * `(organizationId, periodYear, periodMonth)`). Pure + dependency-free so
 * both the server and any future client code can use them.
 */

/** A payroll period: a calendar month. `month` is 1..12. */
export type Period = { year: number; month: number }

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

/** Human label, e.g. `{ 2026, 6 } → "June 2026"`. */
export function periodLabel(p: Period): string {
  const name = MONTH_NAMES[p.month - 1]
  return name ? `${name} ${p.year}` : `${p.year}-${String(p.month).padStart(2, "0")}`
}

/** Sortable "YYYY-MM" key. */
export function periodKey(p: Period): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`
}

/** The calendar month after `p` (rolls December → next January). */
export function nextPeriod(p: Period): Period {
  return p.month === 12
    ? { year: p.year + 1, month: 1 }
    : { year: p.year, month: p.month + 1 }
}

/** The current month in the server's local timezone. */
export function currentPeriod(now: Date = new Date()): Period {
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** True when two periods are the same month. */
export function samePeriod(a: Period, b: Period): boolean {
  return a.year === b.year && a.month === b.month
}
