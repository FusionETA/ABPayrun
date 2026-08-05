import { config } from "../config"
import { getCacheEntry, setCacheEntry } from "../repositories/cache.repository"
import {
  listEmployees,
  listProjects,
  type AltomateEmployee,
  type AltomateProject,
} from "./altomate.service"

export type CachedResult<T> = {
  data: T
  /** "YYYY-MM-DD HH:MM:SS" when the data was last pulled from AltomateHR. */
  syncedAt: string
  /** True when served from the DB cache (no fresh pull this call). */
  fromCache: boolean
}

export type CacheOptions = {
  /** Override the config TTL (seconds). */
  ttlSec?: number
  /** Bypass the cache and pull fresh (Refresh button, pre-post validation). */
  force?: boolean
}

function parsePayload<T>(payload: unknown): T {
  return typeof payload === "string" ? (JSON.parse(payload) as T) : (payload as T)
}

/**
 * Pull-through TTL cache: serve the DB row when it's younger than the TTL,
 * otherwise pull fresh from AltomateHR and upsert. `force` (or ttl 0)
 * always pulls fresh. The fetcher's errors propagate (so a scope/auth
 * failure surfaces rather than silently serving stale data).
 */
async function cachedRead<T>(
  altomateOrgId: string,
  kind: string,
  fetcher: () => Promise<T>,
  opts?: CacheOptions,
): Promise<CachedResult<T>> {
  const ttl = opts?.ttlSec ?? config.altomate.cacheTtlSec
  if (!opts?.force && ttl > 0) {
    const entry = await getCacheEntry(altomateOrgId, kind)
    if (entry && entry.ageSec < ttl) {
      return {
        data: parsePayload<T>(entry.payload),
        syncedAt: entry.syncedAt,
        fromCache: true,
      }
    }
  }
  const data = await fetcher()
  await setCacheEntry(altomateOrgId, kind, data)
  const entry = await getCacheEntry(altomateOrgId, kind)
  return { data, syncedAt: entry?.syncedAt ?? "", fromCache: false }
}

/** Employees for an org — TTL-cached pull-through. */
export function cachedEmployees(
  altomateOrgId: string,
  token: string,
  opts?: CacheOptions,
): Promise<CachedResult<AltomateEmployee[]>> {
  return cachedRead(altomateOrgId, "employees", () => listEmployees(token), opts)
}

/** Projects for an org — TTL-cached pull-through. */
export function cachedProjects(
  altomateOrgId: string,
  token: string,
  opts?: CacheOptions,
): Promise<CachedResult<AltomateProject[]>> {
  return cachedRead(altomateOrgId, "projects", () => listProjects(token), opts)
}
