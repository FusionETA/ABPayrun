import { periodLabel, type Period } from "../lib/period"
import type { AltomateAdjustmentCategory } from "../services/altomate.service"

export type MappingColumnRow = {
  key: string
  label: string
  /** Sum of the column's absolute amounts across the whole timesheet. */
  total: number
  /** How many employees have a non-zero amount in it. */
  employees: number
  /** Selected category code, or null for "don't import". */
  selected: string | null
  defaultCategory: string
}

function money(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const GROUPS: { group: string; label: string }[] = [
  { group: "ALLOWANCE", label: "Allowances" },
  { group: "REMUNERATION", label: "Remuneration" },
  { group: "DEDUCTION", label: "Deductions" },
]

const CELL = "px-3 py-3"

/**
 * Step 2: which AltomateHR pay item each timesheet column posts as. The
 * choice decides EPF, SOCSO, EIS and PCB treatment, so it's shown with the
 * money in each column and saved for next month.
 */
export function ImportMappingPage({
  importId,
  period,
  columns,
  categories,
}: {
  importId: number
  period: Period
  columns: MappingColumnRow[]
  categories: AltomateAdjustmentCategory[]
}) {
  return (
    <div>
      <a href="/convert" class="text-sm font-semibold text-brand hover:underline">
        ← Convert
      </a>
      <div class="mt-4 mb-6">
        <h1 class="text-2xl font-extrabold tracking-tight text-ink">
          Map columns — {periodLabel(period)}
        </h1>
        <p class="mt-1.5 text-sm text-muted">
          Choose what each timesheet column is posted as in AltomateHR. The pay item decides
          whether EPF, SOCSO, EIS and PCB apply. Your choices are remembered for next month.
        </p>
      </div>

      <form method="post" action={`/imports/${importId}/mapping`}>
        <div class="glass overflow-hidden rounded-3xl p-2">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="whitespace-nowrap text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th class={CELL}>Timesheet column</th>
                  <th class={`${CELL} text-right`}>Staff</th>
                  <th class={`${CELL} text-right`}>Total in file</th>
                  <th class={CELL}>Posted in AltomateHR as</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-t border-slate-200/70">
                  <td class={`${CELL} font-semibold text-ink`}>Basic</td>
                  <td class={`${CELL} text-right text-muted`}>—</td>
                  <td class={`${CELL} text-right text-muted`}>—</td>
                  <td class={`${CELL} text-muted`}>
                    Sets the employee&apos;s basic salary (recorded in their salary history when it
                    changes)
                  </td>
                </tr>
                {columns.map((col) => (
                  <tr class="border-t border-slate-200/70">
                    <td class={`${CELL} font-semibold text-ink`}>{col.label}</td>
                    <td class={`${CELL} text-right tabular-nums text-ink`}>{col.employees}</td>
                    <td class={`${CELL} text-right tabular-nums text-ink`}>{money(col.total)}</td>
                    <td class={CELL}>
                      <select
                        name={`map_${col.key}`}
                        aria-label={`AltomateHR pay item for ${col.label}`}
                        class="w-full max-w-md rounded-xl border border-white/70 bg-white/60 px-3 py-1.5 text-sm text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                      >
                        <option value="" selected={col.selected == null}>
                          Don&apos;t import
                        </option>
                        {GROUPS.map((g) => (
                          <optgroup label={g.label}>
                            {categories
                              .filter((c) => c.group === g.group)
                              .map((c) => (
                                <option value={c.code} selected={col.selected === c.code}>
                                  {c.label}
                                  {c.code === col.defaultCategory ? " (suggested)" : ""}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                <tr class="border-t border-slate-200/70">
                  <td class={`${CELL} font-semibold text-ink`}>Total Gross</td>
                  <td class={`${CELL} text-right text-muted`}>—</td>
                  <td class={`${CELL} text-right text-muted`}>—</td>
                  <td class={`${CELL} text-muted`}>
                    Not posted — shown on the review for comparison
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <button
            type="submit"
            class="press inline-flex items-center gap-2 rounded-2xl bg-brand hover:bg-[#3f1670] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30"
          >
            Save &amp; review →
          </button>
        </div>
      </form>
    </div>
  )
}
