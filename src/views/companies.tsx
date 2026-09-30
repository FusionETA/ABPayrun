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

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span class="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100/70 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <CheckIcon /> Connected
    </span>
  ) : (
    <span class="inline-flex items-center whitespace-nowrap rounded-full bg-amber-100/70 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
      Needs token
    </span>
  )
}

/** Employees, projects and sync time as three cells, so the numbers line up
 * down the table; a sync error spans all three. */
function RosterCells({ roster }: { roster: CompanyRoster | null }) {
  const cell = "px-4 py-2.5 text-right tabular-nums"
  if (!roster) {
    return (
      <>
        <td class={`${cell} text-muted`}>—</td>
        <td class={`${cell} text-muted`}>—</td>
        <td class={`${cell} text-muted`}>—</td>
      </>
    )
  }
  if (roster.error) {
    return (
      <td colspan={3} class="px-4 py-2.5 text-xs font-medium text-red-700">
        {roster.error}
      </td>
    )
  }
  return (
    <>
      <td class={`${cell} font-semibold text-ink`}>{roster.employees.length}</td>
      <td class={`${cell} font-semibold text-ink`}>{roster.projects.length}</td>
      <td class={`${cell} text-muted`}>{roster.syncedAt ? roster.syncedAt.slice(11, 16) : "—"}</td>
    </>
  )
}

/** One company per row, so a long list stays scannable. */
function CompanyRow({ company: c, roster }: CompanyWithRoster) {
  const connected = !!c.wp_token_enc
  return (
    <tr class="border-t border-white/50 align-middle">
      <td class="min-w-[14rem] px-4 py-2.5">
        <div class="font-semibold text-ink">{c.name}</div>
        {/* The full org id is long; its first block is enough to tell rows apart. */}
        <div class="text-xs text-muted" title={c.altomate_org_id}>
          Org {c.altomate_org_id.split("-")[0]}
          {c.wp_scopes ? ` · ${c.wp_scopes.length} scopes` : ""}
        </div>
      </td>
      <td class="px-4 py-2.5">
        <StatusBadge connected={connected} />
      </td>
      <td class="px-4 py-2.5">
        <form
          method="post"
          action={`/companies/${c.altomate_org_id}/code`}
          class="flex items-center gap-1.5"
        >
          <input
            name="code"
            value={c.code ?? ""}
            placeholder="ABM"
            maxlength={20}
            aria-label={`Timesheet code for ${c.name}`}
            class="w-20 rounded-xl border border-white/70 bg-white/60 px-2.5 py-1.5 text-sm uppercase text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
          />
          <button
            type="submit"
            class="press rounded-xl border border-white/70 bg-white/50 px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-white"
          >
            Save
          </button>
        </form>
      </td>
      <td class="px-4 py-2.5">
        <form
          method="post"
          action={`/companies/${c.altomate_org_id}/token`}
          class="flex items-center gap-1.5"
        >
          <input
            name="token"
            type="password"
            autocomplete="off"
            aria-label={`API token for ${c.name}`}
            placeholder={connected ? "•••••••• replace token" : "Paste wp_live_ token"}
            class="w-48 min-w-0 rounded-xl border border-white/70 bg-white/60 px-3 py-1.5 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
          />
          <button
            type="submit"
            class="press rounded-xl bg-brand hover:bg-[#3f1670] px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-brand/30"
          >
            {connected ? "Replace" : "Connect"}
          </button>
        </form>
      </td>
      <RosterCells roster={connected ? roster : null} />
      <td class="px-4 py-2.5 text-right">
        {connected ? (
          <a
            href={`/companies/${c.altomate_org_id}`}
            class="whitespace-nowrap text-sm font-semibold text-brand hover:underline"
          >
            Details →
          </a>
        ) : null}
      </td>
    </tr>
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
        <div class="glass overflow-hidden rounded-3xl">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-white/40 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th class="px-4 py-2.5">Company</th>
                  <th class="px-4 py-2.5">Status</th>
                  <th class="px-4 py-2.5">Timesheet code</th>
                  <th class="px-4 py-2.5">API token</th>
                  <th class="px-4 py-2.5 text-right">Employees</th>
                  <th class="px-4 py-2.5 text-right">Projects</th>
                  <th class="px-4 py-2.5 text-right">Synced</th>
                  <th class="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <CompanyRow company={c.company} roster={c.roster} />
                ))}
              </tbody>
            </table>
          </div>
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
