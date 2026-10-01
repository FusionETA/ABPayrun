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

/** Parse a "YYYY-MM" key back into a period; null when it isn't one. */
export function parsePeriodKey(key: string): Period | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  return month >= 1 && month <= 12 ? { year, month } : null
}

/** The calendar month after `p` (rolls December → next January). */
export function nextPeriod(p: Period): Period {
  return addMonths(p, 1)
}

/** `p` moved by `n` months (negative goes back). */
export function addMonths(p: Period, n: number): Period {
  const i = p.year * 12 + (p.month - 1) + n
  return { year: Math.floor(i / 12), month: (i % 12) + 1 }
}

/** Negative when `a` is before `b`, 0 when the same month, positive after. */
export function comparePeriods(a: Period, b: Period): number {
  return (a.year - b.year) * 12 + (a.month - b.month)
}

/** Every month from `from` to `to`, inclusive, oldest first. */
export function periodRange(from: Period, to: Period): Period[] {
  const out: Period[] = []
  for (let p = from; comparePeriods(p, to) <= 0; p = nextPeriod(p)) out.push(p)
  return out
}

/** The current month in the server's local timezone. */
export function currentPeriod(now: Date = new Date()): Period {
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** True when two periods are the same month. */
export function samePeriod(a: Period, b: Period): boolean {
  return a.year === b.year && a.month === b.month
}
