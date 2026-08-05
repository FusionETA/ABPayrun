import { periodLabel, type Period } from "../lib/period"
import type { ParsedTimesheet } from "../domain/timesheet"
import type {
  CompanyValidation,
  ValidationReport,
} from "../services/validate.service"

function money(n: number): string {
  return `RM ${n.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-3 w-3"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function MatchPill({
  ok,
  children,
}: {
  ok: boolean
  children: unknown
}) {
  return (
    <span
      class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        ok
          ? "bg-emerald-100/70 text-emerald-700 ring-emerald-200"
          : "bg-red-100/70 text-red-700 ring-red-200"
      }`}
    >
      {ok ? <CheckIcon /> : "✕"} {children}
    </span>
  )
}

function CompanySection({ c }: { c: CompanyValidation }) {
  return (
    <div class="glass rounded-3xl p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-bold text-ink">
            {c.companyName ?? c.code}
          </h3>
          <span class="rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand">
            {c.code}
          </span>
        </div>
        {c.ok ? (
          <span class="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <CheckIcon /> All matched
          </span>
        ) : (
          <span class="rounded-full bg-red-100/70 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
            {c.error
              ? "Blocked"
              : `${c.unmatchedEmployees + c.unmatchedOutlets} to fix`}
          </span>
        )}
      </div>

      {c.error ? (
        <p class="mt-3 rounded-2xl border border-red-200/60 bg-red-50/70 px-4 py-3 text-sm text-red-700">
          {c.error}
        </p>
      ) : null}

      {/* Outlets → projects */}
      {c.outlets.length ? (
        <div class="mt-4">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Outlets → projects
          </p>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            {c.outlets.map((o) => (
              <MatchPill ok={o.matched}>
                {o.outlet}
                {o.matched && o.projectName ? ` → ${o.projectName}` : ""}
              </MatchPill>
            ))}
          </div>
        </div>
      ) : null}

      {/* Employees */}
      <div class="mt-4 overflow-hidden rounded-2xl border border-white/60">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-white/40 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th class="px-4 py-2.5">Employee</th>
                <th class="px-4 py-2.5">Match</th>
                <th class="px-4 py-2.5 text-right">Basic</th>
                <th class="px-4 py-2.5 text-right">Allow.</th>
                <th class="px-4 py-2.5 text-right">OT</th>
                <th class="px-4 py-2.5 text-right">Comm.</th>
                <th class="px-4 py-2.5 text-right">Deduct.</th>
                <th class="px-4 py-2.5 text-right">Gross</th>
              </tr>
            </thead>
            <tbody>
              {c.employees.map((e) => (
                <tr class="border-t border-white/50">
                  <td class="px-4 py-2.5">
                    <span class="font-semibold text-ink">{e.name}</span>
                    {e.code ? (
                      <span class="ml-1.5 text-[11px] text-muted">{e.code}</span>
                    ) : null}
                    {e.outlets.length > 1 ? (
                      <span class="ml-1.5 text-[11px] text-muted">
                        [{e.outlets.join("+")}]
                      </span>
                    ) : null}
                  </td>
                  <td class="px-4 py-2.5">
                    {e.match.matched ? (
                      <MatchPill ok>{e.match.method}</MatchPill>
                    ) : (
                      <MatchPill ok={false}>not found</MatchPill>
                    )}
                  </td>
                  <td class="px-4 py-2.5 text-right text-muted">{money(e.basic)}</td>
                  <td class="px-4 py-2.5 text-right text-muted">
                    {money(e.travelling + e.meal + e.parking)}
                  </td>
                  <td class="px-4 py-2.5 text-right text-muted">{money(e.otAmount)}</td>
                  <td class="px-4 py-2.5 text-right text-muted">
                    {money(e.commission)}
                  </td>
                  <td class="px-4 py-2.5 text-right text-muted">
                    {money(e.deduction)}
                  </td>
                  <td class="px-4 py-2.5 text-right font-semibold text-ink">
                    {money(e.totalGross)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function ConvertPreview({
  month,
  parsed,
  report,
}: {
  month: Period
  parsed: ParsedTimesheet
  report: ValidationReport
}) {
  return (
    <div>
      <a href="/convert" class="text-sm font-semibold text-brand hover:underline">
        ← Convert
      </a>

      <div class="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight text-ink">
            Preview — {periodLabel(month)}
          </h1>
          <p class="mt-1.5 text-sm text-muted">
            {parsed.totalEmployees} employees across {parsed.companies.length}{" "}
            companies ({parsed.totalRows} rows, {parsed.skippedBlankRows} blank
            skipped).
          </p>
        </div>
      </div>

      {/* All-or-nothing gate banner */}
      {report.ok ? (
        <div class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-emerald-200/70 bg-emerald-50/80 p-6">
          <div>
            <h2 class="flex items-center gap-2 text-base font-bold text-emerald-800">
              <CheckIcon /> Ready to run
            </h2>
            <p class="mt-1 text-sm text-emerald-700">
              Every company, employee, and outlet matched AltomateHR. Nothing is
              posted until you run — and it runs all companies together or not at
              all.
            </p>
          </div>
          <span class="press inline-flex cursor-not-allowed items-center gap-2 rounded-2xl bg-brand/40 px-5 py-2.5 text-sm font-semibold text-white">
            Run payroll → (posting lands next)
          </span>
        </div>
      ) : (
        <div class="mb-6 rounded-3xl border border-red-200/70 bg-red-50/80 p-6">
          <h2 class="text-base font-bold text-red-800">
            Can&apos;t run — fix everything first
          </h2>
          <p class="mt-1 text-sm text-red-700">
            The whole run is blocked until every company, employee, and outlet is
            found in AltomateHR. Nothing will be posted partially.
          </p>
          <ul class="mt-3 space-y-1">
            {report.problems.map((p) => (
              <li class="text-sm text-red-800">• {p}</li>
            ))}
          </ul>
        </div>
      )}

      <div class="space-y-4">
        {report.companies.map((c) => (
          <CompanySection c={c} />
        ))}
      </div>
    </div>
  )
}
