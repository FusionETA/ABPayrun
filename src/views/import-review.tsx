import {
  MAPPABLE_COLUMNS,
  salaryEffectiveDate,
  type EmployeePlan,
  type MappableKey,
} from "../domain/posting"
import { periodLabel } from "../lib/period"
import type { AltomateAdjustmentCategory } from "../services/altomate.service"
import type { CompanyPostingPlan, PostingPlan } from "../services/posting.service"

function money(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const CELL = "px-3 py-2.5"
const NUM = `${CELL} text-right tabular-nums`

function toggleScript(group: string): string {
  return `for (const r of document.querySelectorAll('[data-group="${group}"]')) r.classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-90')`
}

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

function amountFor(e: EmployeePlan, key: MappableKey) {
  return e.lines.find((l) => l.column === key)
}

function BasicCell({ e }: { e: EmployeePlan }) {
  if (e.newSalary == null) {
    return <span class="text-ink">{e.currentSalary != null ? money(e.currentSalary) : "—"}</span>
  }
  return (
    <span class="whitespace-nowrap" title="The profile salary is updated to the timesheet Basic">
      <span class="text-muted line-through">
        {e.currentSalary != null ? money(e.currentSalary) : "none"}
      </span>{" "}
      <span class="font-semibold text-brand">→ {money(e.newSalary)}</span>
    </span>
  )
}

function CompanyRows({
  c,
  columns,
}: {
  c: CompanyPostingPlan
  columns: { key: MappableKey; label: string; category: string }[]
}) {
  const span = columns.length + 3
  const group = `review-${c.code}`
  const plan = c.plan
  const done = c.posted?.status === "POSTED"
  const approved = c.action === "approved"
  const problems = approved ? [] : (plan?.problems ?? [])
  const open = !done && (problems.length > 0 || !!c.error)
  const changes = plan?.employees.filter((e) => e.newSalary != null).length ?? 0

  return (
    <>
      <tr class="border-t border-slate-200/70 bg-white/50">
        <td colspan={span} class={CELL}>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-2 text-left"
              onclick={toggleScript(group)}
            >
              <span class="text-muted">
                <ChevronIcon open={open} />
              </span>
              <span class="font-bold text-ink">{c.companyName}</span>
            </button>
            <span class="rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand">
              {c.code}
            </span>
            {approved ? (
              <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                Approved in AltomateHR — left as is
              </span>
            ) : done ? (
              <span class="rounded-full bg-emerald-100/70 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Already posted
              </span>
            ) : c.error || problems.length ? (
              <span class="rounded-full bg-red-100/70 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                {c.error ? "Blocked" : `${problems.length} to fix`}
              </span>
            ) : (
              <span class="rounded-full bg-emerald-100/70 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Ready
              </span>
            )}
            {c.action === "replace" && !done ? (
              <span
                class="rounded-full bg-amber-100/80 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200"
                title="The draft run from the earlier upload is deleted and made again from this timesheet"
              >
                Replaces the {c.existingRun?.status === "PENDING_APPROVAL" ? "pending" : "draft"} run
              </span>
            ) : null}
            {plan ? (
              <span class="text-xs text-muted">
                {plan.employees.length} employee{plan.employees.length === 1 ? "" : "s"} ·{" "}
                {changes} salary change
                {changes === 1 ? "" : "s"} · {plan.excluded.length} left out
              </span>
            ) : null}
          </div>
          {c.error ? <p class="mt-1 text-xs font-medium text-red-700">{c.error}</p> : null}
          {problems.length && !done ? (
            <ul class="mt-1.5 space-y-0.5">
              {problems.map((p) => (
                <li class="text-xs text-red-700">• {p}</li>
              ))}
            </ul>
          ) : null}
          {plan?.warnings.length ? (
            <ul class="mt-1.5 space-y-0.5">
              {plan.warnings.map((w) => (
                <li class="text-xs text-amber-700">• {w}</li>
              ))}
            </ul>
          ) : null}
          {plan?.excluded.length ? (
            <p class="mt-1.5 text-xs text-muted">
              Not on the timesheet, so left out of this run:{" "}
              {plan.excluded.map((e) => e.name).join(", ")}
            </p>
          ) : null}
        </td>
      </tr>
      {(plan?.employees ?? []).map((e) => (
        <tr data-group={group} class={`border-t border-slate-100 ${open ? "" : "hidden"}`}>
          <td class={`${CELL} pl-9`}>
            <span class="font-semibold text-ink">{e.name}</span>
            {e.code ? <span class="ml-1.5 text-[11px] text-muted">{e.code}</span> : null}
          </td>
          <td class={NUM}>
            <BasicCell e={e} />
          </td>
          {columns.map((col) => {
            const line = amountFor(e, col.key)
            if (!line) return <td class={`${NUM} text-muted`}>—</td>
            return (
              <td class={`${NUM} ${line.kind === "DEDUCTION" ? "text-red-700" : "text-ink"}`}>
                {line.kind === "DEDUCTION" ? "−" : ""}
                {money(line.amount)}
              </td>
            )
          })}
          <td class={`${NUM} text-muted`}>{money(e.sheetGross)}</td>
        </tr>
      ))}
    </>
  )
}

/**
 * Step 3: exactly what will be sent, per company and per person — salary
 * changes and every pay line under the pay item it posts as. Posting is
 * refused while anything here is red.
 */
export function ImportReviewPage({
  plan,
  categories,
}: {
  plan: PostingPlan
  categories: AltomateAdjustmentCategory[]
}) {
  const importId = plan.imp.record.id
  const label = periodLabel(plan.imp.period)
  const effectiveFrom = salaryEffectiveDate(plan.imp.period)
  const catLabel = new Map(categories.map((c) => [c.code, c.label]))

  // Only mapped columns that carry money somewhere get a column.
  const columns = MAPPABLE_COLUMNS.filter((col) => plan.mapping[col.key]).map((col) => ({
    key: col.key,
    label: col.label,
    category: plan.mapping[col.key]!,
  }))
  const used = columns.filter((col) =>
    plan.companies.some((c) => c.plan?.employees.some((e) => amountFor(e, col.key))),
  )

  const toPost = plan.companies.filter(
    (c) => c.posted?.status !== "POSTED" && c.action !== "approved",
  )
  const replacing = toPost.filter((c) => c.action === "replace").length
  const people = toPost.reduce((s, c) => s + (c.plan?.employees.length ?? 0), 0)
  const changes = toPost.reduce(
    (s, c) => s + (c.plan?.employees.filter((e) => e.newSalary != null).length ?? 0),
    0,
  )

  return (
    <div>
      <a href={`/imports/${importId}/mapping`} class="text-sm font-semibold text-brand hover:underline">
        ← Map columns
      </a>
      <div class="mt-4 mb-6">
        <h1 class="text-2xl font-extrabold tracking-tight text-ink">Review — {label}</h1>
        <p class="mt-1.5 text-sm text-muted">
          This is exactly what ABPay will send to AltomateHR. Basic shows the salary change where
          the timesheet differs from AltomateHR — the timesheet wins, and each change is recorded
          in the person&apos;s salary history from {effectiveFrom}. Each other column is posted as
          the pay item under its name. Total Gross is the timesheet&apos;s own figure, for
          comparison.
        </p>
      </div>

      {plan.ok ? (
        <div class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-emerald-200/70 bg-emerald-50/80 p-6">
          <div>
            <h2 class="text-base font-bold text-emerald-800">Ready to post</h2>
            <p class="mt-1 text-sm text-emerald-700">
              {toPost.length} compan{toPost.length === 1 ? "y" : "ies"} · {people} employee
              {people === 1 ? "" : "s"} ·{" "}
              {changes} salary change{changes === 1 ? "" : "s"}. Each company gets a{" "}
              <strong>draft</strong> {label} run with payroll already run — review and submit
              them in AltomateHR.
              {replacing > 0
                ? ` ${replacing} compan${replacing === 1 ? "y's" : "ies'"} earlier ${label} draft is deleted and made again from this timesheet.`
                : ""}
            </p>
          </div>
          <form method="post" action={`/imports/${importId}/post`}>
            <button
              type="submit"
              class="press inline-flex items-center gap-2 rounded-2xl bg-brand hover:bg-[#3f1670] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30"
            >
              Post to AltomateHR →
            </button>
          </form>
        </div>
      ) : (
        <div class="mb-6 rounded-3xl border border-red-200/70 bg-red-50/80 p-6">
          <h2 class="text-base font-bold text-red-800">Can&apos;t post yet</h2>
          <p class="mt-1 text-sm text-red-700">
            Fix these in AltomateHR or the timesheet, then reload this page. Nothing is posted
            until every company is ready.
          </p>
          <ul class="mt-3 space-y-1">
            {plan.problems.map((p) => (
              <li class="text-sm text-red-800">• {p}</li>
            ))}
          </ul>
        </div>
      )}

      <div class="glass overflow-hidden rounded-3xl p-2">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr class="align-bottom">
                <th class={CELL}>Employee</th>
                <th class={`${CELL} whitespace-nowrap text-right`}>Basic</th>
                {used.map((col) => (
                  <th class={`${CELL} text-right`}>
                    <div class="whitespace-nowrap">{col.label}</div>
                    <div class="mt-0.5 text-[10px] font-medium normal-case tracking-normal text-muted/80">
                      {catLabel.get(col.category) ?? col.category}
                    </div>
                  </th>
                ))}
                <th class={`${CELL} whitespace-nowrap text-right`}>Sheet gross</th>
              </tr>
            </thead>
            <tbody>
              {plan.companies.map((c) => (
                <CompanyRows c={c} columns={used} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p class="mt-4 text-xs text-muted">
        AltomateHR still adds anything already set on an employee&apos;s profile — fixed
        allowances, approved overtime, approved unpaid leave and loan repayments — so check those
        aren&apos;t also on the timesheet.
      </p>
    </div>
  )
}
