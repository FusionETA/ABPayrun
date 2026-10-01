import { decryptSecret } from "../lib/crypto"
import {
  addMonths,
  comparePeriods,
  currentPeriod,
  nextPeriod,
  periodKey,
  periodLabel,
  periodRange,
  type Period,
} from "../lib/period"
import {
  listCompanies,
  type CompanyRecord,
} from "../repositories/company.repository"
import {
  AltomateApiError,
  listPayrollRuns,
  type AltomatePayrollRun,
  type AltomatePayrollRunStatus,
} from "./altomate.service"

/** Per-company view for the runs overview page. */
export type CompanyRunsView = {
  company: CompanyRecord
  /** Has a stored token. */
  connected: boolean
  /** Runs from AltomateHR, newest period first. */
  runs: AltomatePayrollRun[]
  /** Most recent run's period, or null if there are none / it failed. */
  latest: Period | null
  /** Status of the most recent run (null if there are none). */
  latestStatus: AltomatePayrollRunStatus | null
  /**
   * True when the company can advance to a new month: its latest run is
   * SUBMITTED (approved), or it has no runs yet. False when the latest run
   * is still DRAFT / PENDING_APPROVAL — that month must be submitted first.
   */
  ready: boolean
  /**
   * The earliest month this company can run: the one after its latest run.
   * Null when blocked, or when it has no runs yet (then any month can run).
   */
  next: Period | null
  /** Why the company can't advance yet (latest run not submitted), else null. */
  blockedReason: string | null
  /** Human-readable failure reason for a fetch/decrypt error, or null. */
  error: string | null
}

export type RunsOverview = {
  companies: CompanyRunsView[]
  /** Companies that loaded successfully (connected + no error). */
  loadedCount: number
  /** Loaded companies whose latest run isn't submitted — these block the run. */
  blocked: CompanyRunsView[]
  /**
   * The earliest month an upload can be for: the latest `next` across the
   * companies, so no company gets a month at or before one it has already
   * run. Null when no company has a run yet.
   */
  earliest: Period | null
  /**
   * The month still waiting on approval, when there is one: it's the only
   * month that can be uploaded, again, to change it. Null when every
   * company's latest run is approved.
   */
  reopen: Period | null
  /**
   * The months the upload may be for, oldest first. Just `reopen` while a
   * month is waiting on approval; empty when nothing can run (no company
   * loaded, or runs waiting on approval in more than one month).
   */
  choices: Period[]
}

/**
 * How far back the month list reaches when no company has a run yet, so a
 * first upload can catch up on earlier months.
 */
const LOOKBACK_MONTHS = 12

function toPeriod(run: AltomatePayrollRun): Period {
  return { year: run.periodYear, month: run.periodMonth }
}

/** A view for a company we couldn't load (not connected / error). */
function inertView(
  company: CompanyRecord,
  connected: boolean,
  error: string | null,
): CompanyRunsView {
  return {
    company,
    connected,
    runs: [],
    latest: null,
    latestStatus: null,
    ready: false,
    next: null,
    blockedReason: null,
    error,
  }
}

async function loadCompany(company: CompanyRecord): Promise<CompanyRunsView> {
  if (!company.wp_token_enc) {
    return inertView(company, false, null)
  }

  let token: string
  try {
    token = decryptSecret(company.wp_token_enc)
  } catch {
    return inertView(
      company,
      true,
      "Stored token could not be read — reconnect this company.",
    )
  }

  let runs: AltomatePayrollRun[]
  try {
    runs = await listPayrollRuns(token)
  } catch (err) {
    const error =
      err instanceof AltomateApiError ? err.message : "Couldn't load payroll runs."
    return inertView(company, true, error)
  }

  // Newest period first.
  runs.sort((a, b) => periodKey(toPeriod(b)).localeCompare(periodKey(toPeriod(a))))
  const newest = runs[0]
  const latest = newest ? toPeriod(newest) : null

  // Advancement rule: a company can only start a NEW month once its latest
  // run is SUBMITTED (approved). A DRAFT / PENDING_APPROVAL latest run means
  // that month is still open — it must be submitted in AltomateHR first.
  let ready = true
  let next: Period | null = null
  let blockedReason: string | null = null

  if (newest) {
    if (newest.status === "SUBMITTED") {
      next = nextPeriod(toPeriod(newest))
    } else {
      ready = false
      next = null
      const state = newest.status === "DRAFT" ? "still a draft" : "awaiting approval"
      blockedReason = `${periodLabel(
        toPeriod(newest),
      )} is ${state} — submit it in AltomateHR before the next month can run, or re-import ${periodLabel(
        toPeriod(newest),
      )} to change it.`
    }
  }

  return {
    company,
    connected: true,
    runs,
    latest,
    latestStatus: newest?.status ?? null,
    ready,
    next,
    blockedReason,
    error: null,
  }
}

/**
 * Fan out across every connected company, read its payroll runs live from
 * AltomateHR, and work out which months an upload can be for:
 *   - every company's latest run approved → the month after the newest run
 *     any company has (a company with no runs doesn't limit it), up to next
 *     month;
 *   - a month not approved yet → only that month, uploaded again to change
 *     it. The next month opens once all of it is approved.
 */
export async function getRunsOverview(): Promise<RunsOverview> {
  const companies = await listCompanies()
  const views = await Promise.all(companies.map(loadCompany))

  const loaded = views.filter((v) => v.connected && !v.error)
  const blocked = loaded.filter((v) => !v.ready)

  return { companies: views, loadedCount: loaded.length, blocked, ...monthChoices(loaded) }
}

/**
 * Which months an upload can be for, from the companies that loaded (see
 * `getRunsOverview`). Pure, so the rules can be tested without AltomateHR.
 */
export function monthChoices(
  loaded: Pick<CompanyRunsView, "ready" | "latest" | "next">[],
  now: Period = currentPeriod(),
): Pick<RunsOverview, "earliest" | "reopen" | "choices"> {
  const blocked = loaded.filter((v) => !v.ready)

  let earliest: Period | null = null
  for (const v of loaded) {
    if (v.next && (!earliest || comparePeriods(v.next, earliest) > 0)) earliest = v.next
  }

  let reopen: Period | null = null
  let choices: Period[] = []
  if (blocked.length > 0) {
    // Re-importing is only possible when the open runs are all one month and
    // no company has already run past it.
    const open = blocked[0]!.latest!
    const oneMonth = blocked.every((v) => comparePeriods(v.latest!, open) === 0)
    const nothingLater = loaded.every((v) => !v.latest || comparePeriods(v.latest, open) <= 0)
    if (oneMonth && nothingLater) {
      reopen = open
      choices = [open]
    }
  } else if (loaded.length > 0) {
    const from = earliest ?? addMonths(now, -LOOKBACK_MONTHS)
    const to = addMonths(comparePeriods(from, now) > 0 ? from : now, 1)
    choices = periodRange(from, to)
  }

  return { earliest, reopen, choices }
}
