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
