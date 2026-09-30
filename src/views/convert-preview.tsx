import { periodLabel, type Period } from "../lib/period"
import type { ParsedTimesheet } from "../domain/timesheet"
import type {
  CompanyValidation,
  ValidationReport,
} from "../services/validate.service"

/** Amounts as AltomateHR's tables show them: 2 decimals, no currency. */
function money(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

const CELL = "px-3 py-2.5"
const NUM = `${CELL} text-right tabular-nums text-muted`
const COLUMNS = 8

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function CompanyStatus({ c }: { c: CompanyValidation }) {
  return c.ok ? (
    <span class="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100/70 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <CheckIcon /> All matched
    </span>
  ) : (
    <span class="whitespace-nowrap rounded-full bg-red-100/70 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
      {c.error ? "Blocked" : `${c.unmatchedEmployees + c.unmatchedOutlets} to fix`}
    </span>
  )
}

/**
 * A company's header row, then its employees in the shared columns. A company
 * that matched fully starts collapsed, one with something to fix starts open,
 * so the rows that need attention are the ones on screen.
 */
function CompanyRows({ c }: { c: CompanyValidation }) {
  const group = `emp-${c.code}`
  const open = !c.ok
  const gross = c.employees.reduce((sum, e) => sum + e.totalGross, 0)

  return (
    <>
      <tr class="border-t border-slate-200/70 bg-white/50">
        <td colspan={COLUMNS - 1} class={CELL}>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={open ? "true" : "false"}
              class="flex items-center gap-2 text-left"
              onclick={`for (const r of document.querySelectorAll('[data-group="${group}"]')) r.classList.toggle('hidden'); this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') !== 'true'); this.querySelector('svg').classList.toggle('rotate-90')`}
            >
              <span class="text-muted">
                <ChevronIcon open={open} />
              </span>
              <span class="font-bold text-ink">{c.companyName ?? c.code}</span>
            </button>
            <span class="rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand">
              {c.code}
            </span>
            <CompanyStatus c={c} />
            <span class="text-xs text-muted">{c.employees.length} employees</span>
          </div>
          {c.error ? <div class="mt-1 text-xs font-medium text-red-700">{c.error}</div> : null}
          {c.outlets.length ? (
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Outlets → projects
              </span>
              {c.outlets.map((o) => (
                <MatchPill ok={o.matched}>
                  {o.outlet}
                  {o.matched && o.projectName ? ` → ${o.projectName}` : ""}
                </MatchPill>
              ))}
            </div>
          ) : null}
        </td>
        <td class={`${CELL} text-right align-top font-bold tabular-nums text-ink`}>{money(gross)}</td>
      </tr>
      {c.employees.map((e) => (
        <tr data-group={group} class={`border-t border-slate-100 ${open ? "" : "hidden"}`}>
          <td class={`${CELL} pl-9`}>
            <span class="font-semibold text-ink">{e.name}</span>
            {e.code ? <span class="ml-1.5 text-[11px] text-muted">{e.code}</span> : null}
            {e.outlets.length > 1 ? (
              <span class="ml-1.5 text-[11px] text-muted">[{e.outlets.join("+")}]</span>
            ) : null}
          </td>
          <td class={CELL}>
            {e.match.matched ? (
              <MatchPill ok>{e.match.method}</MatchPill>
            ) : (
              <MatchPill ok={false}>not found</MatchPill>
            )}
          </td>
          <td class={NUM}>{money(e.basic)}</td>
          <td class={NUM}>{money(e.travelling + e.meal + e.parking)}</td>
          <td class={NUM}>{money(e.otAmount)}</td>
          <td class={NUM}>{money(e.commission)}</td>
          <td class={NUM}>{money(e.deduction)}</td>
          <td class={`${CELL} text-right font-semibold tabular-nums text-ink`}>{money(e.totalGross)}</td>
        </tr>
      ))}
    </>
  )
}

export function ConvertPreview({
  month,
  parsed,
  report,
  importId,
}: {
  month: Period
  parsed: ParsedTimesheet
  report: ValidationReport
  importId: number
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
              Every company, employee, and outlet matched AltomateHR. Next, choose
              what each timesheet column posts as, then review exactly what will be
              sent. Nothing is posted until you confirm.
            </p>
          </div>
          <a
            href={`/imports/${importId}/mapping`}
            class="press inline-flex items-center gap-2 rounded-2xl bg-brand hover:bg-[#3f1670] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30"
          >
            Next: map columns →
          </a>
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

      <div class="glass overflow-hidden rounded-3xl p-2">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="whitespace-nowrap text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th class={CELL}>Employee</th>
                <th class={CELL}>Match</th>
                <th class={`${CELL} text-right`}>Basic</th>
                <th class={`${CELL} text-right`}>Allow.</th>
                <th class={`${CELL} text-right`}>OT</th>
                <th class={`${CELL} text-right`}>Comm.</th>
                <th class={`${CELL} text-right`}>Deduct.</th>
                <th class={`${CELL} text-right`}>Gross</th>
              </tr>
            </thead>
            <tbody>
              {report.companies.map((c) => (
                <CompanyRows c={c} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
