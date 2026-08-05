import { decryptSecret } from "../lib/crypto"
import {
  currentPeriod,
  nextPeriod,
  periodKey,
  periodLabel,
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
  /** The next runnable month when `ready`; null when blocked. */
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
  /** Every loaded company is ready AND agrees on the same next period. */
  inSync: boolean
  /** The shared next period when in sync; null otherwise. */
  unifiedNext: Period | null
}

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
  let next: Period | null = currentPeriod()
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
      )} is ${state} — submit it in AltomateHR before the next month can run.`
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
 * AltomateHR, and compute the next period each is allowed to run. A
 * combined run is only offered when EVERY connected company's latest run
 * is submitted (approved) and they all land on the same next month.
 */
export async function getRunsOverview(): Promise<RunsOverview> {
  const companies = await listCompanies()
  const views = await Promise.all(companies.map(loadCompany))

  const loaded = views.filter((v) => v.connected && !v.error)

  // A company with NO runs shouldn't force everyone to the current month —
  // it follows the pack. Anchor = the single next month that the ready
  // companies WITH runs agree on (e.g. ABM + ABSA both → July); align the
  // no-run companies to it so a fresh company doesn't sit a month ahead and
  // break the sync. No run-having companies → keep the current-month
  // default (a genuine first-ever run).
  const readyWithRuns = loaded.filter(
    (v) => v.latest != null && v.ready && v.next != null,
  )
  const anchorFirst = readyWithRuns[0]
  const anchorKeys = new Set(readyWithRuns.map((v) => periodKey(v.next!)))
  if (anchorFirst?.next && anchorKeys.size === 1) {
    for (const v of loaded) {
      if (v.latest == null && v.ready) v.next = anchorFirst.next
    }
  }

  const blocked = loaded.filter((v) => !v.ready)

  // A single combined next month only exists when nothing is blocked AND
  // every ready company points at the same month.
  const nextKeys = new Set(loaded.map((v) => (v.next ? periodKey(v.next) : "—")))
  const firstLoaded = loaded[0]
  const inSync =
    loaded.length > 0 &&
    blocked.length === 0 &&
    nextKeys.size === 1 &&
    firstLoaded != null &&
    firstLoaded.next != null
  const unifiedNext = inSync && firstLoaded ? firstLoaded.next : null

  return { companies: views, loadedCount: loaded.length, blocked, inSync, unifiedNext }
}
