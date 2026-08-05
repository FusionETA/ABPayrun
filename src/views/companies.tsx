import type { CompanyRecord } from "../repositories/company.repository"
import type { CompanyRoster } from "../services/roster.service"

/** A company row plus its (cached) AltomateHR roster, null if not connected. */
export type CompanyWithRoster = {
  company: CompanyRecord
  roster: CompanyRoster | null
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

function CompanyRosterSummary({
  company: c,
  roster,
}: {
  company: CompanyRecord
  roster: CompanyRoster
}) {
  return (
    <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/50 pt-4">
      {roster.error ? (
        <span class="text-sm font-medium text-red-700">{roster.error}</span>
      ) : (
        <span class="text-sm text-muted">
          <span class="font-semibold text-ink">{roster.employees.length}</span>{" "}
          employees ·{" "}
          <span class="font-semibold text-ink">{roster.projects.length}</span>{" "}
          projects
          {roster.syncedAt ? ` · synced ${roster.syncedAt.slice(11, 16)}` : ""}
        </span>
      )}
      <a
        href={`/companies/${c.altomate_org_id}`}
        class="text-sm font-semibold text-brand hover:underline"
      >
        View details →
      </a>
    </div>
  )
}

function CompanyCard({ company: c, roster }: CompanyWithRoster) {
  const connected = !!c.wp_token_enc
  return (
    <div class="glass lift rounded-3xl p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="truncate text-base font-bold text-ink">{c.name}</h3>
            {connected ? (
              <span class="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <CheckIcon /> Connected
              </span>
            ) : (
              <span class="inline-flex items-center rounded-full bg-amber-100/70 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                Needs token
              </span>
            )}
          </div>
          <p class="mt-0.5 text-xs text-muted">
            Org {c.altomate_org_id}
            {c.wp_scopes ? ` · ${c.wp_scopes.length} scopes` : ""}
          </p>
        </div>

        <form
          method="post"
          action={`/companies/${c.altomate_org_id}/code`}
          class="flex items-center gap-2"
        >
          <label class="text-xs font-semibold text-muted" for={`code-${c.id}`}>
            Timesheet code
          </label>
          <input
            id={`code-${c.id}`}
            name="code"
            value={c.code ?? ""}
            placeholder="ABM"
            maxlength={20}
            class="w-24 rounded-xl border border-white/70 bg-white/60 px-3 py-1.5 text-sm uppercase text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
          />
          <button
            type="submit"
            class="press rounded-xl border border-white/70 bg-white/50 px-3 py-1.5 text-sm font-medium text-ink hover:bg-white"
          >
            Save
          </button>
        </form>
      </div>

      {connected && roster ? (
        <CompanyRosterSummary company={c} roster={roster} />
      ) : null}

      <form
        method="post"
        action={`/companies/${c.altomate_org_id}/token`}
        class="mt-4 flex flex-wrap items-center gap-2 border-t border-white/50 pt-4"
      >
        <input
          name="token"
          type="password"
          autocomplete="off"
          placeholder={connected ? "•••••••• — paste a new token to replace" : "Paste this company's wp_live_ token"}
          class="min-w-0 flex-1 rounded-xl border border-white/70 bg-white/60 px-3.5 py-2 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
        />
        <button
          type="submit"
          class="press rounded-xl bg-brand hover:bg-[#3f1670] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/30"
        >
          {connected ? "Replace" : "Connect"}
        </button>
      </form>
    </div>
  )
}

export function CompaniesPage({
  companies,
}: {
  companies: CompanyWithRoster[]
}) {
  const connected = companies.filter((c) => c.company.wp_token_enc).length

  return (
    <div>
      <div class="mb-6">
        <h1 class="text-2xl font-extrabold tracking-tight text-ink">Companies</h1>
        <p class="mt-1.5 text-sm text-muted">
          Connect each AltomateHR company by pasting its API token, tag it with the
          code used in your timesheet, and check its employees + projects.
        </p>
      </div>

      {companies.length > 0 ? (
        <div class="mb-5 text-sm text-muted">
          <span class="font-semibold text-ink">{connected}</span> of{" "}
          <span class="font-semibold text-ink">{companies.length}</span> connected
        </div>
      ) : null}

      {companies.length === 0 ? (
        <div class="glass rounded-3xl p-12 text-center text-sm text-muted">
          No companies found for your account yet. They appear here after you sign in with
          your AltomateHR owner account.
        </div>
      ) : (
        <div class="space-y-4">
          {companies.map((c) => (
            <CompanyCard company={c.company} roster={c.roster} />
          ))}
        </div>
      )}

      {connected > 0 ? (
        <div class="mt-8 flex justify-end">
          <a
            href="/"
            class="press inline-flex items-center gap-2 rounded-2xl bg-brand hover:bg-[#3f1670] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30"
          >
            Continue to imports →
          </a>
        </div>
      ) : null}
    </div>
  )
}
