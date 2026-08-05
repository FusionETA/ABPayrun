import { paginate } from "../lib/paginate"
import type { CompanyRecord } from "../repositories/company.repository"
import type { CompanyRoster } from "../services/roster.service"

export type CompanyTab = "employees" | "projects"

const PAGE_SIZE = 20

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

function Tab({
  href,
  active,
  label,
  count,
}: {
  href: string
  active: boolean
  label: string
  count: number
}) {
  return (
    <a
      href={href}
      class={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-brand text-white"
          : "text-muted hover:bg-white/50 hover:text-ink"
      }`}
    >
      {label}
      <span
        class={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
          active ? "bg-white/25 text-white" : "bg-brand/10 text-brand"
        }`}
      >
        {count}
      </span>
    </a>
  )
}

function PageLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      class="press rounded-xl border border-white/70 bg-white/50 px-3 py-1.5 font-medium text-ink hover:bg-white"
    >
      {label}
    </a>
  )
}

function PageDisabled({ label }: { label: string }) {
  return (
    <span class="cursor-not-allowed rounded-xl border border-white/40 px-3 py-1.5 text-muted/50">
      {label}
    </span>
  )
}

export function CompanyDetailPage({
  company: c,
  roster,
  tab,
  q,
  page,
}: {
  company: CompanyRecord
  roster: CompanyRoster | null
  tab: CompanyTab
  q: string
  page: number
}) {
  const connected = !!c.wp_token_enc
  const base = `/companies/${c.altomate_org_id}`
  const ql = q.trim().toLowerCase()

  // Filter the active tab's list by the search term, then paginate.
  const empFiltered =
    roster && ql
      ? roster.employees.filter(
          (e) =>
            e.name.toLowerCase().includes(ql) ||
            e.employeeId.toLowerCase().includes(ql),
        )
      : (roster?.employees ?? [])
  const projFiltered =
    roster && ql
      ? roster.projects.filter((p) => p.name.toLowerCase().includes(ql))
      : (roster?.projects ?? [])
  const pagedEmp = paginate(empFiltered, page, PAGE_SIZE)
  const pagedProj = paginate(projFiltered, page, PAGE_SIZE)
  const paged = tab === "employees" ? pagedEmp : pagedProj

  return (
    <div>
      <a href="/companies" class="text-sm font-semibold text-brand hover:underline">
        ← Companies
      </a>

      <div class="mt-4 mb-6">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-extrabold tracking-tight text-ink">{c.name}</h1>
          {connected ? (
            <span class="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <CheckIcon /> Connected
            </span>
          ) : (
            <span class="inline-flex items-center rounded-full bg-amber-100/70 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
              Needs token
            </span>
          )}
          {c.code ? (
            <span class="rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand">
              {c.code}
            </span>
          ) : null}
        </div>
        <p class="mt-1 text-xs text-muted">
          Org {c.altomate_org_id}
          {c.wp_scopes ? ` · ${c.wp_scopes.length} scopes` : ""}
        </p>
      </div>

      {!connected || !roster ? (
        <div class="glass rounded-3xl p-10 text-center text-sm text-muted">
          Not connected yet — paste this company&apos;s token on the{" "}
          <a href="/companies" class="font-semibold text-brand underline">
            Companies
          </a>{" "}
          page to load its employees and projects.
        </div>
      ) : roster.error ? (
        <div class="rounded-3xl border border-red-200/70 bg-red-50/80 p-6 text-sm text-red-700">
          {roster.error}
        </div>
      ) : (
        <div class="glass overflow-hidden rounded-3xl">
          {/* Tabs — reset search + page on switch */}
          <div class="flex gap-1 border-b border-white/60 p-3">
            <Tab
              href={`${base}?tab=employees`}
              active={tab === "employees"}
              label="Employees"
              count={roster.employees.length}
            />
            <Tab
              href={`${base}?tab=projects`}
              active={tab === "projects"}
              label="Projects"
              count={roster.projects.length}
            />
          </div>

          {/* Search (GET, keeps the current tab, resets to page 1) */}
          <form
            method="get"
            action={base}
            class="flex items-center gap-2 border-b border-white/60 px-3 py-3"
          >
            <input type="hidden" name="tab" value={tab} />
            <input
              name="q"
              value={q}
              placeholder={
                tab === "employees"
                  ? "Search name or employee ID…"
                  : "Search projects…"
              }
              class="min-w-0 flex-1 rounded-xl border border-white/70 bg-white/60 px-3.5 py-2 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
            />
            <button
              type="submit"
              class="press rounded-xl bg-brand hover:bg-[#3f1670] px-4 py-2 text-sm font-semibold text-white"
            >
              Search
            </button>
            {q ? (
              <a
                href={`${base}?tab=${tab}`}
                class="text-sm font-semibold text-brand hover:underline"
              >
                Clear
              </a>
            ) : null}
          </form>

          {/* Active tab table */}
          <div class="max-h-[26rem] overflow-y-auto">
            {tab === "employees" ? (
              pagedEmp.items.length ? (
                <table class="w-full text-sm">
                  <thead class="sticky top-0 bg-white/70 text-left text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur">
                    <tr>
                      <th class="px-5 py-2.5">Name</th>
                      <th class="px-5 py-2.5">Employee ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEmp.items.map((e) => (
                      <tr class="border-t border-white/50">
                        <td class="px-5 py-2.5 font-semibold text-ink">{e.name}</td>
                        <td class="px-5 py-2.5 text-muted">{e.employeeId || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p class="p-10 text-center text-sm text-muted">
                  {q
                    ? `No employees match "${q}".`
                    : "No employees found in AltomateHR for this company."}
                </p>
              )
            ) : pagedProj.items.length ? (
              <table class="w-full text-sm">
                <thead class="sticky top-0 bg-white/70 text-left text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur">
                  <tr>
                    <th class="px-5 py-2.5">Project</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProj.items.map((p) => (
                    <tr class="border-t border-white/50">
                      <td class="px-5 py-2.5 font-semibold text-ink">{p.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p class="p-10 text-center text-sm text-muted">
                {q
                  ? `No projects match "${q}".`
                  : "No projects found in AltomateHR for this company."}
              </p>
            )}
          </div>

          {/* Pagination */}
          {paged.total > 0 ? (
            <div class="flex flex-wrap items-center justify-between gap-2 border-t border-white/60 px-5 py-3 text-sm text-muted">
              <span>
                Showing {paged.from}-{paged.to} of {paged.total}
              </span>
              {paged.totalPages > 1 ? (
                <div class="flex items-center gap-2">
                  {paged.page > 1 ? (
                    <PageLink
                      href={`${base}?tab=${tab}&q=${encodeURIComponent(q)}&page=${paged.page - 1}`}
                      label="← Prev"
                    />
                  ) : (
                    <PageDisabled label="← Prev" />
                  )}
                  <span class="font-medium text-ink">
                    Page {paged.page} of {paged.totalPages}
                  </span>
                  {paged.page < paged.totalPages ? (
                    <PageLink
                      href={`${base}?tab=${tab}&q=${encodeURIComponent(q)}&page=${paged.page + 1}`}
                      label="Next →"
                    />
                  ) : (
                    <PageDisabled label="Next →" />
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {roster.syncedAt ? (
            <p class="border-t border-white/60 px-5 py-2.5 text-[11px] text-muted">
              Synced from AltomateHR at {roster.syncedAt.slice(0, 16)} · updates on
              Refresh
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
