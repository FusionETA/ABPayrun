import type { RowDataPacket } from "mysql2"

import { pool } from "../db"

export type PostedRun = {
  id: number
  import_id: number
  company_code: string
  altomate_run_id: string | null
  status: string
  error: string | null
  posted_at: string | null
}

export async function listRunsForImport(importId: number): Promise<PostedRun[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM posted_run WHERE import_id = :importId ORDER BY company_code",
    { importId },
  )
  return rows as PostedRun[]
}

/** Record (or update) the outcome of posting one company's run. */
export async function recordRun(input: {
  importId: number
  companyCode: string
  altomateRunId?: string | null
  status: string
  error?: string | null
  postedAt?: string | null
}): Promise<void> {
  await pool.query(
    `INSERT INTO posted_run (import_id, company_code, altomate_run_id, status, error, posted_at)
     VALUES (:importId, :companyCode, :altomateRunId, :status, :error, :postedAt)
     ON DUPLICATE KEY UPDATE
       altomate_run_id = VALUES(altomate_run_id),
       status          = VALUES(status),
       error           = VALUES(error),
       posted_at       = VALUES(posted_at)`,
    {
      importId: input.importId,
      companyCode: input.companyCode,
      altomateRunId: input.altomateRunId ?? null,
      status: input.status,
      error: input.error ?? null,
      postedAt: input.postedAt ?? null,
    },
  )
}
