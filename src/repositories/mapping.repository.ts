import type { RowDataPacket } from "mysql2"

import { pool } from "../db"

/** Saved column → AltomateHR category choices. `null` = don't import. */
export async function listColumnMappings(): Promise<Map<string, string | null>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT column_key, category_code FROM column_mapping",
  )
  return new Map(rows.map((r) => [r.column_key as string, (r.category_code as string) ?? null]))
}

export async function saveColumnMappings(
  mappings: { columnKey: string; categoryCode: string | null }[],
  updatedBy: string,
): Promise<void> {
  for (const m of mappings) {
    await pool.query(
      `INSERT INTO column_mapping (column_key, category_code, updated_by)
       VALUES (:columnKey, :categoryCode, :updatedBy)
       ON DUPLICATE KEY UPDATE category_code = VALUES(category_code),
                               updated_by    = VALUES(updated_by)`,
      { columnKey: m.columnKey, categoryCode: m.categoryCode, updatedBy },
    )
  }
}
