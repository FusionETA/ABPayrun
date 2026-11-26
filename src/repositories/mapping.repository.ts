import type { RowDataPacket } from "mysql2"

import { pool } from "../db"

/** Saved column → AltomateHR category choices. `null` = don't import. */
export async function listColumnMappings(): Promise<Map<string, string | null>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT column_key, category_code FROM column_mapping",
  )
  return new Map(rows.map((r) => [r.column_key as string, (r.category_code as string) ?? null]))
}

/** Columns whose pay is taxed as normal monthly pay (not a one-off) in PCB. */
export async function listColumnsTaxedAsNormal(): Promise<Set<string>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT column_key FROM column_mapping WHERE taxed_as_normal = 1",
  )
  return new Set(rows.map((r) => r.column_key as string))
}

export async function saveColumnMappings(
  mappings: { columnKey: string; categoryCode: string | null; taxedAsNormal: boolean }[],
  updatedBy: string,
): Promise<void> {
  for (const m of mappings) {
    await pool.query(
      `INSERT INTO column_mapping (column_key, category_code, taxed_as_normal, updated_by)
       VALUES (:columnKey, :categoryCode, :taxedAsNormal, :updatedBy)
       ON DUPLICATE KEY UPDATE category_code   = VALUES(category_code),
                               taxed_as_normal = VALUES(taxed_as_normal),
                               updated_by      = VALUES(updated_by)`,
      {
        columnKey: m.columnKey,
        categoryCode: m.categoryCode,
        taxedAsNormal: m.taxedAsNormal ? 1 : 0,
        updatedBy,
      },
    )
  }
}
