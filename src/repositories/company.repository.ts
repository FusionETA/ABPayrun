import type { RowDataPacket } from "mysql2"

import { pool } from "../db"

export type CompanyRecord = {
  id: number
  altomate_org_id: string
  name: string
  code: string | null
  wp_token_enc: string | null
  wp_scopes: string[] | null
  connected_at: string | null
  created_at: string
}

export async function listCompanies(): Promise<CompanyRecord[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM company ORDER BY name",
  )
  return rows as CompanyRecord[]
}

export async function getCompanyByOrgId(
  orgId: string,
): Promise<CompanyRecord | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM company WHERE altomate_org_id = :orgId",
    { orgId },
  )
  return rows[0] as CompanyRecord | undefined
}

/** Insert a company (or refresh its name); never clobbers token/code. */
export async function upsertCompany(input: {
  altomateOrgId: string
  name: string
}): Promise<void> {
  await pool.query(
    `INSERT INTO company (altomate_org_id, name)
     VALUES (:altomateOrgId, :name)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    input,
  )
}

export async function setCompanyToken(input: {
  altomateOrgId: string
  tokenEnc: string
  scopes: string[]
}): Promise<void> {
  await pool.query(
    `UPDATE company
       SET wp_token_enc = :tokenEnc, wp_scopes = :scopes, connected_at = NOW()
     WHERE altomate_org_id = :altomateOrgId`,
    {
      altomateOrgId: input.altomateOrgId,
      tokenEnc: input.tokenEnc,
      scopes: JSON.stringify(input.scopes),
    },
  )
}

export async function setCompanyCode(input: {
  altomateOrgId: string
  code: string | null
}): Promise<void> {
  await pool.query(
    "UPDATE company SET code = :code WHERE altomate_org_id = :altomateOrgId",
    input,
  )
}

/**
 * Prune UNCONNECTED companies whose org id is NOT in the given list —
 * reconciles away stale rows (e.g. leftover demo companies) WITHOUT ever
 * touching a company that has a connected token.
 *
 * A token is user-pasted and unrecoverable, so a sync must never delete it
 * just because a transient/partial AltomateHR response didn't list the org
 * (which is how the whole roster got wiped once). Connected companies are
 * only ever removed by the user replacing/clearing the token themselves.
 * No-op on an empty list.
 */
export async function deleteCompaniesNotIn(orgIds: string[]): Promise<void> {
  if (orgIds.length === 0) return
  const names = orgIds.map((_, i) => `:o${i}`)
  const params: Record<string, string> = {}
  orgIds.forEach((id, i) => {
    params[`o${i}`] = id
  })
  const [result] = await pool.query(
    `DELETE FROM company
       WHERE wp_token_enc IS NULL AND altomate_org_id NOT IN (${names.join(",")})`,
    params,
  )
  const affected = (result as { affectedRows?: number }).affectedRows ?? 0
  if (affected > 0) {
    console.warn(`[abpay] reconcile pruned ${affected} unconnected company row(s).`)
  }
}
