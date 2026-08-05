import { periodLabel } from "../lib/period"
import type { AltomatePayrollRunStatus } from "../services/altomate.service"
import type { CompanyRunsView, RunsOverview } from "../services/runs.service"

function money(n: number | null): string {
  if (n == null) return "—"
  return `RM ${n.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
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

/** Top banner: the single next month to run, or why it can't be started. */
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
          next month can start. Still open:
        </p>
        <ul class="mt-3 space-y-1.5">
          {overview.blocked.map((v) => (
            <li class="text-sm text-amber-800">
              <span class="font-semibold">{v.company.name}</span> — {v.blockedReason}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (overview.inSync && overview.unifiedNext) {
    return (
      <div class="glass rounded-3xl p-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">
              Next payroll run
            </p>
            <h2 class="mt-1 text-2xl font-extrabold tracking-tight text-brand">
              {periodLabel(overview.unifiedNext)}
            </h2>
            <p class="mt-1 text-sm text-muted">
              All {overview.loadedCount} connected companies are approved and up to
              date. Upload one timesheet and ABPay splits it per company.
            </p>
          </div>
          <a
            href="/convert"
            class="press inline-flex items-center gap-2 rounded-2xl bg-brand hover:bg-[#3f1670] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30"
          >
            Upload {periodLabel(overview.unifiedNext)} timesheet <ArrowIcon />
          </a>
        </div>
      </div>
    )
  }

  // Everyone's approved, but they're on different next months.
  return (
    <div class="rounded-3xl border border-amber-200/70 bg-amber-50/80 p-6">
      <h2 class="text-base font-bold text-amber-800">Companies are out of sync</h2>
      <p class="mt-1 text-sm text-amber-700">
        Your connected companies aren&apos;t all on the same next month, so a single
        combined upload is paused. Bring the trailing companies up to the same
        period (run their missing months first) — each one&apos;s next month is shown
        below.
      </p>
    </div>
  )
}

function CompanySection({ view }: { view: CompanyRunsView }) {
  const { company, connected, runs, error } = view

  return (
    <div class="glass rounded-3xl p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="truncate text-base font-bold text-ink">{company.name}</h3>
            {company.code ? (
              <span class="rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand">
                {company.code}
              </span>
            ) : null}
          </div>
          <p class="mt-0.5 text-xs text-muted">Org {company.altomate_org_id}</p>
        </div>

        {connected && !error && view.ready && view.next ? (
          <div class="text-right">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Next to run
            </p>
            <p class="text-sm font-bold text-brand">{periodLabel(view.next)}</p>
          </div>
        ) : connected && !error && !view.ready ? (
          <div class="text-right">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
              Waiting
            </p>
            <p class="text-sm font-bold text-amber-700">
              Submit {view.latest ? periodLabel(view.latest) : "latest run"}
            </p>
          </div>
        ) : null}
      </div>

      {!connected ? (
        <p class="mt-4 rounded-2xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-sm text-amber-700">
          Not connected yet — add this company&apos;s token on the{" "}
          <a href="/companies" class="font-semibold underline">
            Companies
          </a>{" "}
          page to load its runs.
        </p>
      ) : error ? (
        <p class="mt-4 rounded-2xl border border-red-200/60 bg-red-50/70 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : (
        <>
          {!view.ready && view.blockedReason ? (
            <p class="mt-4 rounded-2xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-sm text-amber-700">
              {view.blockedReason}
            </p>
          ) : null}

          {runs.length === 0 ? (
            <p class="mt-4 rounded-2xl border border-white/60 bg-white/40 px-4 py-3 text-sm text-muted">
              No payroll runs yet in AltomateHR.{" "}
              {view.next ? periodLabel(view.next) : "The current month"} will be the
              first.
            </p>
          ) : (
            <div class="mt-4 overflow-hidden rounded-2xl border border-white/60">
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="bg-white/40 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <tr>
                      <th class="px-4 py-2.5">Period</th>
                      <th class="px-4 py-2.5">Status</th>
                      <th class="px-4 py-2.5 text-right">Gross</th>
                      <th class="px-4 py-2.5 text-right">Net</th>
                      <th class="px-4 py-2.5 text-right">Employees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr class="border-t border-white/50">
                        <td class="px-4 py-2.5 font-semibold text-ink">
                          {periodLabel({
                            year: run.periodYear,
                            month: run.periodMonth,
                          })}
                        </td>
                        <td class="px-4 py-2.5">
                          <RunStatusBadge status={run.status} />
                        </td>
                        <td class="px-4 py-2.5 text-right text-muted">
                          {money(run.gross)}
                        </td>
                        <td class="px-4 py-2.5 text-right text-muted">
                          {money(run.net)}
                        </td>
                        <td class="px-4 py-2.5 text-right text-muted">
                          {run.employeeCount ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function RunsPage({ overview }: { overview: RunsOverview }) {
  return (
    <div>
      <div class="mb-6">
        <h1 class="text-2xl font-extrabold tracking-tight text-ink">Payroll runs</h1>
        <p class="mt-1.5 text-sm text-muted">
          Read live from AltomateHR. Each month runs in sequence — the next month
          only opens once every company&apos;s latest run is approved (submitted).
        </p>
      </div>

      <div class="mb-6">
        <NextRunBanner overview={overview} />
      </div>

      <div class="space-y-4">
        {overview.companies.map((view) => (
          <CompanySection view={view} />
        ))}
      </div>
    </div>
  )
}
