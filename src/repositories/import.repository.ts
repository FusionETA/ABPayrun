import type { ResultSetHeader, RowDataPacket } from "mysql2"

import { pool } from "../db"

export type ImportRecord = {
  id: number
  period_year: number
  period_month: number
  filename: string | null
  status: string
  uploaded_by: string | null
  created_at: string
}

export async function listImports(): Promise<ImportRecord[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM import ORDER BY period_year DESC, period_month DESC, id DESC",
  )
  return rows as ImportRecord[]
}

export async function getImport(id: number): Promise<ImportRecord | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM import WHERE id = :id",
    { id },
  )
  return rows[0] as ImportRecord | undefined
}

export async function findImportByPeriod(
  year: number,
  month: number,
): Promise<ImportRecord | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM import WHERE period_year = :year AND period_month = :month",
    { year, month },
  )
  return rows[0] as ImportRecord | undefined
}

export async function createImport(input: {
  periodYear: number
  periodMonth: number
  filename?: string | null
  uploadedBy?: string | null
}): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO import (period_year, period_month, filename, uploaded_by)
     VALUES (:periodYear, :periodMonth, :filename, :uploadedBy)`,
    {
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      filename: input.filename ?? null,
      uploadedBy: input.uploadedBy ?? null,
    },
  )
  return result.insertId
}

export async function updateImportStatus(id: number, status: string): Promise<void> {
  await pool.query("UPDATE import SET status = :status WHERE id = :id", { status, id })
}

/** The most recent import, whatever its status (for "resume" links). */
export async function latestImport(): Promise<ImportRecord | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM import ORDER BY period_year DESC, period_month DESC, id DESC LIMIT 1",
  )
  return rows[0] as ImportRecord | undefined
}

/** Start the month's import again from a new upload: new file, back to DRAFT. */
export async function resetImport(
  id: number,
  input: { filename: string | null; uploadedBy: string | null },
): Promise<void> {
  await pool.query(
    `UPDATE import SET filename = :filename, uploaded_by = :uploadedBy, status = 'DRAFT'
     WHERE id = :id`,
    { id, filename: input.filename, uploadedBy: input.uploadedBy },
  )
}

/**
 * Move an import into POSTING only if it isn't already posting or posted —
 * so a double-click (or two tabs) can't post the same month twice.
 */
export async function claimImportForPosting(id: number): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE import SET status = 'POSTING'
     WHERE id = :id AND status IN ('DRAFT', 'PARTIAL', 'FAILED')`,
    { id },
  )
  return result.affectedRows === 1
}

export async function saveImportPayload(importId: number, parsedJson: string): Promise<void> {
  await pool.query(
    `INSERT INTO import_payload (import_id, parsed_json) VALUES (:importId, :parsedJson)
     ON DUPLICATE KEY UPDATE parsed_json = VALUES(parsed_json)`,
    { importId, parsedJson },
  )
}

export async function getImportPayload(importId: number): Promise<string | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT parsed_json FROM import_payload WHERE import_id = :importId",
    { importId },
  )
  return rows[0]?.parsed_json as string | undefined
}
