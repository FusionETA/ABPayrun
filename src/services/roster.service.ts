import { decryptSecret } from "../lib/crypto"
import type { CompanyRecord } from "../repositories/company.repository"
import {
  cachedEmployees,
  cachedProjects,
  type CacheOptions,
} from "./altomate-cache.service"
import { AltomateApiError } from "./altomate.service"

export type CompanyRoster = {
  employees: Array<{ id: string; name: string; employeeId: string }>
  projects: Array<{ id: string; name: string }>
  /** When the underlying data was last pulled from AltomateHR. */
  syncedAt: string
  /** Human error (bad scope / token) if the pull failed, else null. */
  error: string | null
}

/**
 * Load a connected company's employees + projects (TTL-cached). Returns
 * null when the company has no token connected. A scope/auth/down failure
 * comes back as `error` so the Companies page can show it per company
 * without failing the whole page.
 */
export async function loadCompanyRoster(
  company: CompanyRecord,
  opts?: CacheOptions,
): Promise<CompanyRoster | null> {
  if (!company.wp_token_enc) return null
  try {
    const token = decryptSecret(company.wp_token_enc)
    const [emp, proj] = await Promise.all([
      cachedEmployees(company.altomate_org_id, token, opts),
      cachedProjects(company.altomate_org_id, token, opts),
    ])
    return {
      employees: emp.data.map((e) => ({
        id: e.id,
        name: e.name,
        employeeId: e.employeeId,
      })),
      projects: proj.data.map((p) => ({ id: p.id, name: p.name })),
      syncedAt: emp.syncedAt || proj.syncedAt,
      error: null,
    }
  } catch (err) {
    const error =
      err instanceof AltomateApiError
        ? err.message
        : "Couldn't load employees/projects from AltomateHR."
    return { employees: [], projects: [], syncedAt: "", error }
  }
}
