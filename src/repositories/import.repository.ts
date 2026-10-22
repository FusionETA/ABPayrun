import type { ResultSetHeader, RowDataPacket } from "mysql2"

import { pool } from "../db"

export type ImportRecord = {
  id: number
  period_year: number
  period_month: number
  /** The timesheet's name — also each company's AltomateHR run name. */
  name: string | null
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

/** A month's timesheets, oldest first. */
export async function listImportsForPeriod(year: number, month: number): Promise<ImportRecord[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM import WHERE period_year = :year AND period_month = :month ORDER BY id",
    { year, month },
  )
  return rows as ImportRecord[]
}

/**
 * The name a timesheet shows and posts under: its own name, or — for one
 * uploaded before timesheets had names — its file name without the extension.
 */
export function timesheetName(record: Pick<ImportRecord, "name" | "filename">): string {
  return record.name?.trim() || nameFromFile(record.filename) || "Timesheet"
}

/** "Payroll July (Kitchen).xlsx" → "Payroll July (Kitchen)", at most 60 characters. */
export function nameFromFile(filename: string | null | undefined): string {
  const base = (filename ?? "").replace(/\.[^.]+$/, "").replace(/\s+/g, " ").trim()
  return base.slice(0, 60).trim()
}

export async function createImport(input: {
  periodYear: number
  periodMonth: number
  name: string
  filename?: string | null
  uploadedBy?: string | null
}): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO import (period_year, period_month, name, filename, uploaded_by)
     VALUES (:periodYear, :periodMonth, :name, :filename, :uploadedBy)`,
    {
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      name: input.name,
      filename: input.filename ?? null,
      uploadedBy: input.uploadedBy ?? null,
    },
  )
  return result.insertId
}

export async function updateImportStatus(id: number, status: string): Promise<void> {
  await pool.query("UPDATE import SET status = :status WHERE id = :id", { status, id })
}

/** Start a timesheet again from a new upload: new file (and name), back to DRAFT. */
export async function resetImport(
  id: number,
  input: { name: string; filename: string | null; uploadedBy: string | null },
): Promise<void> {
  await pool.query(
    `UPDATE import SET name = :name, filename = :filename, uploaded_by = :uploadedBy, status = 'DRAFT'
     WHERE id = :id`,
    { id, name: input.name, filename: input.filename, uploadedBy: input.uploadedBy },
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
