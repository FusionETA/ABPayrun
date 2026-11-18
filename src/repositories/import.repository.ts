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

/**
 * A timesheet counts as saved once something of it reached AltomateHR: it is
 * being posted or was (fully or partly), or any company's run was created for
 * it — a FAILED posting can still have made one, and a corrected copy of a
 * posted timesheet goes back to DRAFT with its runs kept for replacing.
 *
 * One that only got as far as the preview (or whose posting failed before
 * any run existed) is scratch: the upload has to live somewhere between the
 * preview, mapping and post steps, but it isn't listed, offered as something
 * to correct, or counted for names — and it is deleted after a day.
 */
const SAVED = `(i.status IN ('POSTING', 'POSTED', 'PARTIAL')
  OR EXISTS (SELECT 1 FROM posted_run r WHERE r.import_id = i.id AND r.altomate_run_id IS NOT NULL))`

/** Every saved timesheet, newest month first. */
export async function listImports(): Promise<ImportRecord[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT i.* FROM import i WHERE ${SAVED} ORDER BY i.period_year DESC, i.period_month DESC, i.id DESC`,
  )
  return rows as ImportRecord[]
}

/**
 * Delete never-posted timesheets older than `hours` — uploads that stopped at
 * the preview. Their payload, rows and run records go with them (cascade).
 * The age keeps one someone is working through right now.
 */
export async function deleteUnpostedImports(hours: number): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE i FROM import i
     WHERE NOT ${SAVED} AND i.status IN ('DRAFT', 'FAILED')
       AND i.created_at < NOW() - INTERVAL :hours HOUR`,
    { hours },
  )
  return result.affectedRows
}

export async function getImport(id: number): Promise<ImportRecord | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM import WHERE id = :id",
    { id },
  )
  return rows[0] as ImportRecord | undefined
}

/** A month's saved timesheets, oldest first (see SAVED). */
export async function listImportsForPeriod(year: number, month: number): Promise<ImportRecord[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT i.* FROM import i WHERE i.period_year = :year AND i.period_month = :month AND ${SAVED} ORDER BY i.id`,
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
