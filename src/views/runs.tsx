import { periodLabel } from "../lib/period"
import type { AltomatePayrollRun, AltomatePayrollRunStatus } from "../services/altomate.service"
import type { CompanyRunsView, RunsOverview } from "../services/runs.service"

/** Amounts as the AltomateHR run list shows them: 2 decimals, no currency. */
function money(n: number | null): string {
  if (n == null) return "—"
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function shortDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  })
}

const STATUS_META: Record<
  AltomatePayrollRunStatus,
  { label: string; cls: string }
> = {
  SUBMITTED: {
    label: "Submitted",
    cls: "bg-emerald-100/70 text-emerald-700 ring-emerald-200",
  },
  PENDING_APPROVAL: {
    label: "Awaiting approval",
    cls: "bg-amber-100/70 text-amber-700 ring-amber-200",
  },
  DRAFT: {
    label: "Draft",
    cls: "bg-slate-100/70 text-slate-600 ring-slate-200",
  },
}

function RunStatusBadge({ status }: { status: AltomatePayrollRunStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT
  return (
    <span
      class={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.cls}`}
    >
      {meta.label}
    </span>
  )
}

function ArrowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

/** Top banner: the months that can run next, or why none can. */
function NextRunBanner({ overview }: { overview: RunsOverview }) {
  if (overview.loadedCount === 0) {
    return (
      <div class="glass rounded-3xl p-6">
        <h2 class="text-base font-bold text-ink">No connected companies yet</h2>
        <p class="mt-1 text-sm text-muted">
          Connect a company (paste its AltomateHR token) to load its payroll runs
          and start the next month.
        </p>
        <a
          href="/companies"
          class="press mt-4 inline-flex items-center gap-2 rounded-2xl bg-brand hover:bg-[#3f1670] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/30"
        >
          Go to Companies <ArrowIcon />
        </a>
      </div>
    )
  }

  // Any company whose latest run isn't submitted blocks the whole next run.
  if (overview.blocked.length > 0) {
    return (
      <div class="rounded-3xl border border-amber-200/70 bg-amber-50/80 p-6">
        <h2 class="text-base font-bold text-amber-800">Waiting on approval</h2>
        <p class="mt-1 text-sm text-amber-700">
          Every company&apos;s latest run must be submitted in AltomateHR before the
          next month can start. Until then, the open month can be re-imported. Still open:
        </p>
        <ul class="mt-3 space-y-1.5">
          {overview.blocked.map((v) => (
            <li class="text-sm text-amber-800">
              <span class="font-semibold">{v.company.name}</span> — {v.blockedReason}
            </li>
          ))}
        </ul>
        {overview.reopen ? (
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <a
              href="/convert"
              class="press inline-flex items-center gap-2 rounded-2xl bg-brand hover:bg-[#3f1670] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/30"
            >
              Re-import {periodLabel(overview.reopen)} <ArrowIcon />
            </a>
            <span class="text-xs text-amber-700">
              Upload {periodLabel(overview.reopen)} again to change it — ABPay replaces its draft
              runs.
            </span>
          </div>
        ) : null}
      </div>
    )
  }

  const { earliest } = overview
  return (
    <div class="glass rounded-3xl p-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-muted">
            Next payroll run
          </p>
          <h2 class="mt-1 text-2xl font-extrabold tracking-tight text-brand">
            {earliest ? `${periodLabel(earliest)} or later` : "Any month"}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {earliest
              ? `All ${overview.loadedCount} connected companies are approved. Choose the month when you upload — ${periodLabel(earliest)} is the earliest new month${overview.addTo ? `, or add another timesheet to ${periodLabel(overview.addTo)}` : ""}.`
              : "No company has a payroll run yet, so you can start from any month. Choose it when you upload."}
          </p>
        </div>
        <a
          href="/convert"
          class="press inline-flex items-center gap-2 rounded-2xl bg-brand hover:bg-[#3f1670] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30"
        >
          Upload timesheet <ArrowIcon />
        </a>
      </div>
    </div>
  )
}

// "July 2026 – Kitchen": a month can hold several runs, one per timesheet.
function runPeriod(run: AltomatePayrollRun): string {
  return run.label
}

const CELL = "px-3 py-3"
const NUM = `${CELL} text-right tabular-nums`
const COLUMNS = 10

function ChevronIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4 transition-transform"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

/** Period, status and figures of one run: the same cells for the latest run
 * and for each earlier one, so they line up in one set of columns. */
function RunCells({ run }: { run: AltomatePayrollRun }) {
  return (
    <>
      <td class={`${CELL} whitespace-nowrap text-ink`}>{runPeriod(run)}</td>
      <td class={CELL}>
        <RunStatusBadge status={run.status} />
      </td>
      <td class={`${NUM} text-ink`}>{run.employeeCount ?? "—"}</td>
      <td class={`${NUM} text-ink`}>{money(run.gross)}</td>
      <td class={`${NUM} font-bold text-ink`}>{money(run.net)}</td>
      <td class={`${NUM} text-ink`}>{money(run.costToEmployer)}</td>
      <td class={`${CELL} whitespace-nowrap text-muted`}>{shortDate(run.generatedAt)}</td>
    </>
  )
}

/** The same seven cells as `RunCells` for a company with no run, so every
 * column keeps its place instead of one message spanning them all. */
function EmptyRunCells({ label }: { label: string }) {
  return (
    <>
      <td class={`${CELL} whitespace-nowrap text-muted`}>{label}</td>
      <td class={`${CELL} text-muted`}>—</td>
      <td class={`${NUM} text-muted`}>—</td>
      <td class={`${NUM} text-muted`}>—</td>
      <td class={`${NUM} text-muted`}>—</td>
      <td class={`${NUM} text-muted`}>—</td>
      <td class={`${CELL} text-muted`}>—</td>
    </>
  )
}

/** What the company must do next: its earliest month, or the run to submit first. */
function NextCell({ view }: { view: CompanyRunsView }) {
  if (!view.connected || view.error) return <span class="text-muted">—</span>
  if (view.ready) {
    return (
      <span class="whitespace-nowrap font-bold text-brand">
        {view.next ? `${periodLabel(view.next)} or later` : "Any month"}
      </span>
    )
  }
  return (
    <span class="whitespace-nowrap font-bold text-amber-700">
      Submit {view.latest ? periodLabel(view.latest) : "latest run"}
    </span>
  )
}

/**
 * One row per company with its latest run. Earlier runs are hidden rows in
 * the same columns, opened with the chevron.
 */
function CompanyRows({
  view,
  payroll,
  limited,
}: {
  view: CompanyRunsView
  payroll: boolean
  limited: boolean
}) {
  const { company, connected, runs, error } = view
  // Without payroll access in AltomateHR, none of the company's pay shows —
  // nor for someone who sees only some employees: run totals hold everyone's.
  const shown = payroll && !limited
  const latest = shown && connected && !error ? runs[0] : undefined
  const earlier = shown && connected && !error ? runs.slice(1) : []
  const group = `runs-${company.altomate_org_id}`

  return (
    <>
      <tr class="border-t border-slate-200/70 align-middle">
        <td class={`${CELL} min-w-[13rem]`}>
          <div class="flex items-center gap-2">
            <span class="font-semibold text-ink">{company.name}</span>
            {company.code ? (
              <span class="rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand">
                {company.code}
              </span>
            ) : null}
          </div>
          {!connected ? (
            <div class="text-xs font-medium text-amber-700">
              Not connected ·{" "}
              <a href="/companies" class="font-semibold underline">
                add token
              </a>
            </div>
          ) : error ? (
            <div class="text-xs font-medium text-red-700">{error}</div>
          ) : payroll && !view.ready && view.blockedReason ? (
            <div class="text-xs text-amber-700">{view.blockedReason}</div>
          ) : null}
        </td>
        {latest ? (
          <RunCells run={latest} />
        ) : (
          <EmptyRunCells
            label={
              !payroll
                ? "No payroll access"
                : limited
                  ? "Hidden: your access covers some employees"
                  : connected && !error
                    ? "No runs yet"
                    : "—"
            }
          />
        )}
        <td class={CELL}>
          {payroll ? <NextCell view={view} /> : <span class="text-muted">—</span>}
        </td>
        <td class={`${CELL} w-10 text-right`}>
          {earlier.length > 0 ? (
            <button
              type="button"
              title={`${earlier.length} earlier run${earlier.length === 1 ? "" : "s"}`}
              aria-expanded="false"
              class="rounded-full p-1 text-muted hover:bg-white hover:text-ink"
              onclick={`for (const r of document.querySelectorAll('[data-group="${group}"]')) r.classList.toggle('hidden'); this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') !== 'true'); this.querySelector('svg').classList.toggle('rotate-90')`}
            >
              <ChevronIcon />
            </button>
          ) : null}
        </td>
      </tr>
      {earlier.map((run) => (
        <tr data-group={group} class="hidden border-t border-slate-100 bg-white/30 text-[13px]">
          <td class={`${CELL} text-right text-xs text-muted`}>
            {latest && run.periodYear === latest.periodYear && run.periodMonth === latest.periodMonth
              ? "same month"
              : "earlier"}
          </td>
          <RunCells run={run} />
          <td colspan={COLUMNS - 8} />
        </tr>
      ))}
    </>
  )
}

/** Shown instead of the next-run banner to someone who can't run payroll. */
function NoPayrollBanner() {
  return (
    <div class="glass rounded-3xl p-6">
      <h2 class="text-base font-bold text-ink">No payroll access</h2>
      <p class="mt-1 text-sm text-muted">
        Your access in AltomateHR doesn&apos;t include running payroll for these companies, so
        their runs and pay aren&apos;t shown here. Ask the owner if you need it.
      </p>
    </div>
  )
}

/**
 * `noPayroll`: companies the viewer can see but may not run payroll for —
 * their runs aren't shown. `limited`: companies where they see only some
 * employees — they may post for those, but the company's run totals hold
 * everyone's pay, so its runs aren't shown either. `canUpload`: they may run
 * payroll somewhere.
 */
export function RunsPage({
  overview,
  noPayroll = new Set<string>(),
  limited = new Set<string>(),
  canUpload = true,
}: {
  overview: RunsOverview
  noPayroll?: Set<string>
  limited?: Set<string>
  canUpload?: boolean
}) {
  return (
    <div>
      <div class="mb-6">
        <h1 class="text-2xl font-extrabold tracking-tight text-ink">Payroll runs</h1>
        <p class="mt-1.5 text-sm text-muted">
          Read live from AltomateHR. A month can only run after a company&apos;s
          latest one, and only once every company&apos;s latest run is approved
          (submitted).
        </p>
      </div>

      <div class="mb-6">
        {canUpload || overview.loadedCount === 0 ? (
          <NextRunBanner overview={overview} />
        ) : (
          <NoPayrollBanner />
        )}
      </div>

      {overview.companies.length > 0 ? (
        <div class="glass overflow-hidden rounded-3xl p-2">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="whitespace-nowrap text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th class={CELL}>Company</th>
                  <th class={CELL}>Period</th>
                  <th class={CELL}>Status</th>
                  <th class={`${CELL} text-right`}>Staff</th>
                  <th class={`${CELL} text-right`}>Gross</th>
                  <th class={`${CELL} text-right`}>Net pay</th>
                  <th class={`${CELL} text-right`}>Cost to employer</th>
                  <th class={CELL}>Generated</th>
                  <th class={CELL}>Next to run</th>
                  <th class={CELL}></th>
                </tr>
              </thead>
              <tbody>
                {overview.companies.map((view) => (
                  <CompanyRows
                    view={view}
                    payroll={!noPayroll.has(view.company.altomate_org_id)}
                    limited={limited.has(view.company.altomate_org_id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
