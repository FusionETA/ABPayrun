import { periodLabel, type Period } from "../lib/period"

/**
 * Transfers between Ayu Borneo companies in the payroll month, and the order
 * the companies' runs must go in because of them.
 *
 * Why an order at all: when someone moves from company A to company B, B's
 * PCB for the month counts what A already paid this year. AltomateHR carries
 * that across only from A's APPROVED runs — so if B's run is made before A's
 * month is approved, B's PCB misses A's month, and once B is approved it
 * can't be fixed. So B waits until A's month is approved.
 *
 * Pure: no AltomateHR calls. The caller passes each company's roster and runs.
 */

/** The roster fields this needs (a subset of AltomatePayrollEmployee). */
export type RosterPerson = {
  userId: string
  name: string
  joinDate: string | null
  leaveDate: string | null
}

export type CompanyRoster = {
  code: string
  name: string
  people: RosterPerson[]
  /** Status of this company's run for the month, or null if it has none. */
  monthRunStatus: string | null
}

export type Transfer = {
  userId: string
  name: string
  fromCode: string
  fromName: string
  toCode: string
  toName: string
  /** Last day at the old company (yyyy-mm-dd). */
  leaveDate: string
  /** First day at the new company (yyyy-mm-dd). */
  joinDate: string
}

export type Waiting = {
  /** The company that must be approved first. */
  fromCode: string
  fromName: string
  /** Who moved, for the message. */
  people: { name: string; joinDate: string }[]
}

const day = (d: string | null): string | null => (d ? d.slice(0, 10) : null)

function inPeriod(d: string, period: Period): boolean {
  const [y, m] = d.split("-").map(Number)
  return y === period.year && m === period.month
}

/**
 * People who LEFT one company during the month and JOINED another the same
 * person (same AltomateHR login) on or after that. Someone who works at both
 * (a duplicate) has no leave date, so isn't a transfer.
 */
export function findTransfers(period: Period, companies: CompanyRoster[]): Transfer[] {
  const transfers: Transfer[] = []
  for (const from of companies) {
    for (const leaver of from.people) {
      const leave = day(leaver.leaveDate)
      if (!leave || !inPeriod(leave, period)) continue
      for (const to of companies) {
        if (to.code === from.code) continue
        const joiner = to.people.find((p) => p.userId === leaver.userId)
        const join = day(joiner?.joinDate ?? null)
        if (!joiner || !join || join < leave || !inPeriod(join, period)) continue
        transfers.push({
          userId: leaver.userId,
          name: joiner.name || leaver.name,
          fromCode: from.code,
          fromName: from.name,
          toCode: to.code,
          toName: to.name,
          leaveDate: leave,
          joinDate: join,
        })
      }
    }
  }
  return transfers
}

/**
 * For each company: the companies it must wait for, because someone moved
 * from them this month and their month isn't approved yet. Approved means
 * AltomateHR's SUBMITTED status.
 */
export function waitingFor(transfers: Transfer[], companies: CompanyRoster[]): Map<string, Waiting[]> {
  const statusOf = new Map(companies.map((c) => [c.code, c.monthRunStatus] as const))
  const out = new Map<string, Waiting[]>()
  for (const t of transfers) {
    if (statusOf.get(t.fromCode) === "SUBMITTED") continue
    const list = out.get(t.toCode) ?? []
    let w = list.find((x) => x.fromCode === t.fromCode)
    if (!w) {
      w = { fromCode: t.fromCode, fromName: t.fromName, people: [] }
      list.push(w)
    }
    w.people.push({ name: t.name, joinDate: t.joinDate })
    out.set(t.toCode, list)
  }
  return out
}

/**
 * The order to go in: step 1 = companies nobody moved into from an
 * unapproved company, step 2 = those that only wait on step 1, and so on.
 * Null when transfers go round in a circle (A → B and B → A in one month),
 * which needs doing by hand.
 */
export function postingSteps(codes: string[], transfers: Transfer[]): string[][] | null {
  const deps = new Map(codes.map((c) => [c, new Set<string>()] as const))
  for (const t of transfers) {
    if (deps.has(t.toCode) && deps.has(t.fromCode)) deps.get(t.toCode)!.add(t.fromCode)
  }
  const steps: string[][] = []
  const done = new Set<string>()
  while (done.size < codes.length) {
    const next = codes.filter((c) => !done.has(c) && [...deps.get(c)!].every((d) => done.has(d)))
    if (next.length === 0) return null
    steps.push(next)
    next.forEach((c) => done.add(c))
  }
  return steps
}

/** "Waits for AB Management's October 2026 to be approved — Siti moved from it on 10 Oct." */
export function waitingMessage(w: Waiting, period: Period): string {
  const who = w.people
    .map((p) => `${p.name} (joined ${p.joinDate.slice(8, 10)}/${p.joinDate.slice(5, 7)})`)
    .join(", ")
  return `Waits for ${w.fromName}'s ${periodLabel(period)} to be approved in AltomateHR — ${who} moved from ${w.fromName} this month.`
}
