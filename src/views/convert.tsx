import { addMonths, periodKey, periodLabel, samePeriod, type Period } from "../lib/period"
import type { CompanyRunsView } from "../services/runs.service"

function CalendarIcon() {
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
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

/**
 * Only the companies that stop an upload from working — ones without a
 * timesheet code, whose rows can't be matched. Each can be fixed right here.
 * When nothing is missing this isn't shown at all.
 */
function NeedsAttention({ missing }: { missing: CompanyRunsView[] }) {
  return (
    <div class="rounded-3xl border border-amber-200/70 bg-amber-50/80 p-6">
      <h2 class="flex items-center gap-2 text-base font-bold text-amber-800">
        <AlertIcon /> Needs attention
      </h2>
      <p class="mt-1 text-sm text-amber-700">
        {missing.length === 1 ? "This company has" : `These ${missing.length} companies have`} no
        timesheet code, so {missing.length === 1 ? "its" : "their"} rows in the timesheet can&apos;t
        be matched. Enter the code used in the timesheet&apos;s Company column.
      </p>
      <div class="mt-4 overflow-hidden rounded-2xl border border-amber-200/70 bg-white/60">
        <table class="w-full text-sm">
          <tbody>
            {missing.map((v, i) => (
              <tr class={i > 0 ? "border-t border-amber-100" : ""}>
                <td class="px-4 py-2.5 font-semibold text-ink">{v.company.name}</td>
                <td class="px-4 py-2.5 text-right">
                  <form
                    method="post"
                    action={`/companies/${v.company.altomate_org_id}/code`}
                    class="inline-flex items-center gap-1.5"
                  >
                    <input type="hidden" name="next" value="/convert" />
                    <input
                      name="code"
                      placeholder="ABM"
                      maxlength={20}
                      required
                      aria-label={`Timesheet code for ${v.company.name}`}
                      class="w-24 rounded-xl border border-white/70 bg-white px-2.5 py-1.5 text-sm uppercase text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
                    />
                    <button
                      type="submit"
                      class="press rounded-xl bg-brand hover:bg-[#3f1670] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UploadForm({ codes }: { codes: string[] }) {
  return (
    <form
      id="upload-form"
      method="post"
      action="/convert"
      enctype="multipart/form-data"
      class="rounded-3xl border-2 border-dashed border-brand/30 bg-white/40 p-10 text-center transition hover:border-brand/50"
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
      {codes.length ? (
        <p class="mx-auto mt-2 max-w-lg text-xs text-muted">
          Split by the Company column: {codes.join(" · ")}
        </p>
      ) : null}
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
  )
}

/**
 * The month picker. There's no default: the month has to be chosen on
 * purpose, so a timesheet can't land in the wrong month by not looking.
 * While a month waits on approval it's the only choice, to re-import it.
 */
function PeriodPicker({
  choices,
  earliest,
  reopen,
  companies,
}: {
  choices: Period[]
  earliest: Period | null
  reopen: Period | null
  companies: CompanyRunsView[]
}) {
  if (reopen) return <ReimportPicker month={reopen} companies={companies} />
  // The companies whose latest run sets the earliest month.
  const limiting = earliest
    ? companies.filter((v) => v.next && samePeriod(v.next, earliest))
    : []
  return (
    <div class="glass mt-5 rounded-3xl p-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <label class="block">
          <span class="text-xs font-semibold uppercase tracking-wide text-muted">
            Payroll month
          </span>
          <select
            name="period"
            form="upload-form"
            required
            class="mt-1.5 block w-56 rounded-xl border border-white/70 bg-white px-3 py-2 text-base font-bold text-brand outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
          >
            <option value="" selected>
              Choose month…
            </option>
            {[...choices].reverse().map((p) => (
              <option value={periodKey(p)}>{periodLabel(p)}</option>
            ))}
          </select>
        </label>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
          <CalendarIcon />{" "}
          {earliest ? `${periodLabel(earliest)} or later` : "No runs yet"}
        </span>
      </div>
      <p class="mt-3 border-t border-white/50 pt-3 text-xs text-muted">
        {earliest ? (
          <>
            {limiting.map((v) => v.company.name).join(", ")}{" "}
            {limiting.length === 1 ? "has" : "have"} a {periodLabel(addMonths(earliest, -1))}{" "}
            run already, so {periodLabel(earliest)} is the earliest month you can run.
          </>
        ) : (
          <>No company has a payroll run yet, so you can start from any month in the list.</>
        )}{" "}
        Pick the month the timesheet is for — every company on it gets a run for that month.
      </p>
    </div>
  )
}

/** The one month that can be uploaded while it waits on approval. */
function ReimportPicker({ month, companies }: { month: Period; companies: CompanyRunsView[] }) {
  const open = companies.filter((v) => !v.ready)
  const label = periodLabel(month)
  return (
    <div class="glass mt-5 rounded-3xl p-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-muted">Payroll month</p>
          <p class="mt-1 text-xl font-extrabold text-brand">{label}</p>
          <input type="hidden" name="period" form="upload-form" value={periodKey(month)} />
        </div>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          <CalendarIcon /> Re-import — not approved yet
        </span>
      </div>
      <p class="mt-3 border-t border-white/50 pt-3 text-xs text-muted">
        {label} isn&apos;t approved yet for {open.map((v) => v.company.name).join(", ")}, so you can
        upload it again to make changes: posting replaces the draft runs ABPay made for {label}.
        Companies already approved for {label} are left as they are.{" "}
        {periodLabel(addMonths(month, 1))} opens once every company&apos;s {label} run is approved
        in AltomateHR.
      </p>
    </div>
  )
}

/**
 * Convert flow entry point (upload a timesheet → split by company → post).
 * The month is picked from `choices`, which the server works out from each
 * company's runs (the month after the newest one, onwards — or just `reopen`
 * while that month waits on approval) and checks again on upload. When
 * `choices` is empty the run is blocked and `reason` explains why.
 */
export function ConvertPage({
  resume,
  choices,
  earliest,
  reopen,
  companies,
  reason,
  uploadError,
}: {
  /** A month started but not fully posted, to carry on with. */
  resume?: { id: number; label: string; status: string } | null
  choices: Period[]
  earliest: Period | null
  reopen: Period | null
  companies: CompanyRunsView[]
  reason: string | null
  uploadError?: string | null
}) {
  const missing = companies.filter((v) => !v.company.code)
  const codes = companies.flatMap((v) => (v.company.code ? [v.company.code] : [])).sort()
  return (
    <div class="[&>*:first-child]:mt-0">

      {resume ? (
        <div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm">
          <span class="text-ink">
            <span class="font-semibold">{resume.label}</span> was started but{" "}
            {resume.status === "PARTIAL" ? "only partly posted" : "not posted yet"}.
          </span>
          <a
            href={resume.status === "DRAFT" ? `/imports/${resume.id}/mapping` : `/imports/${resume.id}`}
            class="font-semibold text-brand hover:underline"
          >
            Continue →
          </a>
        </div>
      ) : null}

      {uploadError ? (
        <p class="mt-4 rounded-2xl border border-red-200/70 bg-red-50/80 px-4 py-3 text-sm font-medium text-red-700">
          {uploadError}
        </p>
      ) : null}

      {choices.length === 0 ? (
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

          <PeriodPicker
            choices={choices}
            earliest={earliest}
            reopen={reopen}
            companies={companies}
          />

          {/* Only what needs fixing is shown; a company with its code set
              has nothing to say here. */}
          <div class="mt-4 space-y-4">
            {missing.length > 0 ? <NeedsAttention missing={missing} /> : null}
            <UploadForm codes={codes} />
          </div>
        </>
      )}
    </div>
  )
}
