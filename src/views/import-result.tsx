import { periodLabel, type Period } from "../lib/period"
import type { PostedRun } from "../repositories/run.repository"
import type { PostedRunSummary } from "../services/posting.service"

function money(n: number | undefined): string {
  if (n == null) return "—"
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const CELL = "px-3 py-3"
const NUM = `${CELL} text-right tabular-nums`

const STATUS: Record<string, { label: string; cls: string }> = {
  POSTED: { label: "Draft run created", cls: "bg-emerald-100/70 text-emerald-700 ring-emerald-200" },
  FAILED: { label: "Failed", cls: "bg-red-100/70 text-red-700 ring-red-200" },
  POSTING: { label: "Interrupted", cls: "bg-amber-100/70 text-amber-700 ring-amber-200" },
  PENDING: { label: "Not posted", cls: "bg-slate-100/70 text-slate-600 ring-slate-200" },
  APPROVED: {
    label: "Already approved — left as is",
    cls: "bg-slate-100/70 text-slate-600 ring-slate-200",
  },
}

function summaryOf(run: PostedRun | undefined): PostedRunSummary | null {
  if (!run?.summary_json) return null
  return (
    typeof run.summary_json === "string" ? JSON.parse(run.summary_json) : run.summary_json
  ) as PostedRunSummary
}

/** Step 4: what happened in each company, with a retry for what didn't post. */
export function ImportResultPage({
  importId,
  period,
  status,
  companies,
}: {
  importId: number
  period: Period
  status: string
  /** Every company on the timesheet, with its posting record if there is one. */
  companies: { code: string; name: string; run: PostedRun | undefined }[]
}) {
  const label = periodLabel(period)
  const incomplete = companies.some(
    (c) => c.run?.status !== "POSTED" && c.run?.status !== "APPROVED",
  )

  return (
    <div>
      <div class="mb-6">
        <h1 class="text-2xl font-extrabold tracking-tight text-ink">Posted — {label}</h1>
        <p class="mt-1.5 text-sm text-muted">
          Each company marked &quot;Draft run created&quot; has a <strong>draft</strong> {label}{" "}
          run in AltomateHR with payroll already run. Nothing is final until it&apos;s submitted
          there.
        </p>
      </div>

      {incomplete ? (
        <div class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-amber-200/70 bg-amber-50/80 p-6">
          <div>
            <h2 class="text-base font-bold text-amber-800">
              {status === "POSTING" ? "Posting is still running" : "Not every company was posted"}
            </h2>
            <p class="mt-1 text-sm text-amber-700">
              Posting stops at the first company that fails. Fix the error below, then post again
              — companies already done are skipped, and a draft run ABPay already made is replaced.
            </p>
          </div>
          <a
            href={`/imports/${importId}/review`}
            class="press inline-flex items-center gap-2 rounded-2xl bg-brand hover:bg-[#3f1670] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30"
          >
            Review &amp; post again →
          </a>
        </div>
      ) : null}

      <div class="glass overflow-hidden rounded-3xl p-2">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="whitespace-nowrap text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th class={CELL}>Company</th>
                <th class={CELL}>Result</th>
                <th class={`${CELL} text-right`}>Payslips</th>
                <th class={`${CELL} text-right`}>Salary changes</th>
                <th class={`${CELL} text-right`}>Gross</th>
                <th class={`${CELL} text-right`}>Net pay</th>
                <th class={`${CELL} text-right`}>Cost to employer</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const s = summaryOf(c.run)
                const meta = STATUS[c.run?.status ?? "PENDING"] ?? STATUS.PENDING!
                return (
                  <tr class="border-t border-slate-200/70 align-top">
                    <td class={CELL}>
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-ink">{c.name}</span>
                        <span class="rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand">
                          {c.code}
                        </span>
                      </div>
                      {c.run?.error ? (
                        <div class="mt-1 text-xs font-medium text-red-700">{c.run.error}</div>
                      ) : null}
                      {s?.finalFigures ? (
                        <div class="mt-1 text-xs text-emerald-700">
                          AltomateHR run set to use ABPay figures as final
                        </div>
                      ) : null}
                      {s?.warnings?.map((w) => (
                        <div class="mt-1 text-xs font-medium text-amber-700">{w}</div>
                      ))}
                      {s?.skipped.length ? (
                        <div class="mt-1 text-xs text-amber-700">
                          Skipped by AltomateHR:{" "}
                          {s.skipped.map((k) => `${k.name} (${k.reason})`).join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td class={CELL}>
                      <span
                        class={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td class={`${NUM} text-ink`}>{s ? s.payslipCount : "—"}</td>
                    <td class={`${NUM} text-ink`}>{s ? s.salaryChanges : "—"}</td>
                    <td class={`${NUM} text-ink`}>{money(s?.totalGross)}</td>
                    <td class={`${NUM} font-bold text-ink`}>{money(s?.totalNet)}</td>
                    <td class={`${NUM} text-ink`}>{money(s?.totalCostToEmployer)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
