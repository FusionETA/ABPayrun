import { html } from "hono/html"
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

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
      <path
        fill-rule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
        clip-rule="evenodd"
      />
    </svg>
  )
}

/**
 * A styled dropdown for the payroll month. The value still lives in a real
 * (visually hidden) `<select required>`, so the form posts and validates as
 * before; the button + menu just drive it. Months are grouped by year,
 * newest first.
 */
function MonthSelect({ choices }: { choices: Period[] }) {
  const newestFirst = [...choices].reverse()
  const years = [...new Set(newestFirst.map((p) => p.year))]
  return (
    <div class="block" data-month-select>
      <span id="period-label" class="text-xs font-semibold uppercase tracking-wide text-muted">
        Payroll month
      </span>
      <select
        name="period"
        form="upload-form"
        required
        tabindex={-1}
        aria-hidden="true"
        class="sr-only"
      >
        <option value="" selected>
          Choose month…
        </option>
        {newestFirst.map((p) => (
          <option value={periodKey(p)}>{periodLabel(p)}</option>
        ))}
      </select>
      <div class="relative mt-1.5 w-60">
        <button
          type="button"
          data-ms-button
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-labelledby="period-label"
          class="flex w-full items-center justify-between gap-2 rounded-xl border border-brand/15 bg-white px-3.5 py-2.5 text-left text-base font-semibold shadow-sm outline-none transition hover:border-brand/40 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15 aria-expanded:border-brand aria-expanded:ring-4 aria-expanded:ring-brand/15 data-[invalid]:border-red-400 data-[invalid]:ring-4 data-[invalid]:ring-red-200"
        >
          <span data-ms-text class="text-muted">
            Choose month…
          </span>
          <span class="text-brand/70 transition [[aria-expanded=true]>&]:rotate-180">
            <ChevronIcon />
          </span>
        </button>
        <ul
          role="listbox"
          data-ms-menu
          aria-labelledby="period-label"
          tabindex={-1}
          class="absolute left-0 right-0 top-full z-30 mt-2 hidden max-h-72 overflow-y-auto rounded-2xl border border-brand/10 bg-white p-1.5 shadow-[0_18px_50px_-12px_rgba(76,26,134,.35)] outline-none"
        >
          {years.map((year) => (
            <li role="presentation">
              <p class="sticky top-0 bg-white px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                {year}
              </p>
              <ul role="presentation">
                {newestFirst
                  .filter((p) => p.year === year)
                  .map((p) => (
                    <li
                      role="option"
                      aria-selected="false"
                      tabindex={-1}
                      data-value={periodKey(p)}
                      class="group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium text-ink outline-none transition hover:bg-brand/5 focus:bg-brand/5 aria-selected:bg-brand/10 aria-selected:font-bold aria-selected:text-brand"
                    >
                      {periodLabel(p)}
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        class="hidden h-4 w-4 group-aria-selected:block"
                        aria-hidden="true"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      {html`<script>
        (function(){
          var root = document.querySelector('[data-month-select]');
          if(!root) return;
          var select = root.querySelector('select');
          var btn = root.querySelector('[data-ms-button]');
          var text = root.querySelector('[data-ms-text]');
          var menu = root.querySelector('[data-ms-menu]');
          var opts = Array.prototype.slice.call(root.querySelectorAll('[role=option]'));

          function isOpen(){ return !menu.classList.contains('hidden'); }
          function open(){
            menu.classList.remove('hidden');
            btn.setAttribute('aria-expanded','true');
            var cur = opts.find(function(o){ return o.dataset.value === select.value; }) || opts[0];
            if(cur){ cur.focus(); cur.scrollIntoView({block:'nearest'}); }
          }
          function close(refocus){
            menu.classList.add('hidden');
            btn.setAttribute('aria-expanded','false');
            if(refocus) btn.focus();
          }
          function choose(o){
            select.value = o.dataset.value;
            opts.forEach(function(x){ x.setAttribute('aria-selected', x === o ? 'true' : 'false'); });
            text.textContent = o.textContent.trim();
            text.className = 'text-brand font-bold';
            btn.removeAttribute('data-invalid');
            close(true);
          }

          btn.addEventListener('click', function(){ isOpen() ? close(false) : open(); });
          btn.addEventListener('keydown', function(e){
            if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); open(); }
          });
          opts.forEach(function(o, i){
            o.addEventListener('click', function(){ choose(o); });
            o.addEventListener('keydown', function(e){
              if(e.key === 'ArrowDown'){ e.preventDefault(); (opts[i+1] || o).focus(); }
              else if(e.key === 'ArrowUp'){ e.preventDefault(); (opts[i-1] || o).focus(); }
              else if(e.key === 'Home'){ e.preventDefault(); opts[0].focus(); }
              else if(e.key === 'End'){ e.preventDefault(); opts[opts.length-1].focus(); }
              else if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); choose(o); }
              else if(e.key === 'Escape' || e.key === 'Tab'){ close(e.key === 'Escape'); }
            });
          });
          document.addEventListener('click', function(e){ if(isOpen() && !root.contains(e.target)) close(false); });
          // Upload without a month: show it on the dropdown instead of the
          // browser bubble on the hidden select.
          select.addEventListener('invalid', function(e){
            e.preventDefault();
            btn.setAttribute('data-invalid','');
            open();
          });
        })();
      </script>`}
    </div>
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
  // z-10: the open menu has to sit above the upload card below.
  return (
    <div class="glass relative z-10 mt-5 rounded-3xl p-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <MonthSelect choices={choices} />
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
        upload it again to make changes: posting replaces the draft runs ABPay made for {label}. A
        run awaiting approval has to be sent back to draft in AltomateHR first. Companies already
        approved for {label} are left as they are.{" "}
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
