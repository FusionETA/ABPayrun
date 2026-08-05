import { periodLabel, type Period } from "../lib/period"
import type { CompanyRunsView } from "../services/runs.service"

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/**
 * Convert flow entry point (upload a timesheet → split by company → post).
 * The period is computed server-side (the next month in sequence) and shown
 * locked — there is deliberately no month picker, so a run can only ever be
 * started for the allowed next month, and only when every company's latest
 * run is approved. When `month` is null the run is blocked and `reason`
 * explains why.
 */
export function ConvertPage({
  month,
  companies,
  reason,
  uploadError,
}: {
  month: Period | null
  companies: CompanyRunsView[]
  reason: string | null
  uploadError?: string | null
}) {
  return (
    <div>
      <a href="/" class="text-sm font-semibold text-brand hover:underline">
        ← Dashboard
      </a>

      {uploadError ? (
        <p class="mt-4 rounded-2xl border border-red-200/70 bg-red-50/80 px-4 py-3 text-sm font-medium text-red-700">
          {uploadError}
        </p>
      ) : null}

      {month == null ? (
        <div class="glass mt-4 rounded-3xl p-8 text-center">
          <h1 class="text-xl font-extrabold tracking-tight text-ink">
            Can&apos;t start a run yet
          </h1>
          <p class="mx-auto mt-2 max-w-md text-sm text-muted">
            {reason ?? "The next month isn't available."}
          </p>
        </div>
      ) : (
        <>
          <div class="mt-4">
            <h1 class="text-2xl font-extrabold tracking-tight text-ink">
              Convert timesheet
            </h1>
            <p class="mt-1.5 text-sm text-muted">
              Upload one timesheet — ABPay splits it by company and posts a run to
              each.
            </p>
          </div>

          <div class="glass mt-5 rounded-3xl p-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">
                  Period
                </p>
                <p class="mt-1 text-xl font-extrabold text-brand">
                  {periodLabel(month)}
                </p>
              </div>
              <span class="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                <LockIcon /> Locked to next month
              </span>
            </div>
            <p class="mt-3 border-t border-white/50 pt-3 text-xs text-muted">
              You can only run the month after each company&apos;s latest approved
              run, so the period is fixed. Finish this run before {periodLabel(month)}{" "}
              opens the following month.
            </p>
          </div>

          <div class="glass mt-4 rounded-3xl p-6">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">
              Companies in this run
            </p>
            <ul class="mt-3 space-y-2">
              {companies.map((v) => (
                <li class="flex items-center justify-between rounded-2xl border border-white/60 bg-white/40 px-4 py-2.5 text-sm">
                  <span class="font-semibold text-ink">{v.company.name}</span>
                  <span class="text-muted">
                    {v.company.code ? (
                      <span class="rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand">
                        {v.company.code}
                      </span>
                    ) : (
                      <span class="text-amber-600">no timesheet code set</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <form
            method="post"
            action="/convert"
            enctype="multipart/form-data"
            class="mt-4 rounded-3xl border-2 border-dashed border-brand/30 bg-white/40 p-10 text-center transition hover:border-brand/50"
          >
            <div class="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="h-7 w-7"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M17 8l-5-5-5 5" />
                <path d="M12 3v12" />
              </svg>
            </div>
            <h3 class="text-lg font-bold text-ink">Upload the timesheet</h3>
            <p class="mx-auto mt-1.5 max-w-md text-sm text-muted">
              One .xlsx with all companies mixed — ABPay splits it by company and
              validates every employee against AltomateHR before anything runs.
            </p>
            <div class="mt-6 flex flex-col items-center gap-4">
              <input
                type="file"
                name="timesheet"
                accept=".xlsx,.xls,.csv"
                required
                class="block max-w-xs text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand hover:file:bg-brand/15"
              />
              <button
                type="submit"
                class="press inline-flex items-center gap-2 rounded-2xl bg-brand hover:bg-[#3f1670] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30"
              >
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
                Upload &amp; preview
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
