import type { RowDataPacket } from "mysql2"

import { pool } from "../db"

export type CacheRow = {
  payload: unknown
  /** "YYYY-MM-DD HH:MM:SS". */
  syncedAt: string
  /** Age in seconds, computed by the DB (avoids client-side timezone math). */
  ageSec: number
}

export async function getCacheEntry(
  altomateOrgId: string,
  kind: string,
): Promise<CacheRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT payload,
            synced_at AS syncedAt,
            TIMESTAMPDIFF(SECOND, synced_at, NOW()) AS ageSec
       FROM altomate_cache
      WHERE altomate_org_id = :altomateOrgId AND kind = :kind`,
    { altomateOrgId, kind },
  )
  const row = rows[0]
  if (!row) return null
  return {
    payload: row.payload,
    syncedAt: String(row.syncedAt),
    ageSec: Number(row.ageSec),
  }
}

export async function setCacheEntry(
  altomateOrgId: string,
  kind: string,
  payload: unknown,
): Promise<void> {
  await pool.query(
    `INSERT INTO altomate_cache (altomate_org_id, kind, payload, synced_at)
     VALUES (:altomateOrgId, :kind, :payload, NOW())
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), synced_at = NOW()`,
    { altomateOrgId, kind, payload: JSON.stringify(payload) },
  )
}
