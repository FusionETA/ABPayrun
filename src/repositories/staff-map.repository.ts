import type { RowDataPacket } from "mysql2"

import { pool } from "../db"

export type StaffMapping = {
  id: number
  company_code: string
  staff_raw: string
  altomate_employee_id: string
  altomate_employee_name: string | null
  created_at: string
}

/** The learned mapping for one (company, staff name), if any. */
export async function findMapping(
  companyCode: string,
  staffRaw: string,
): Promise<StaffMapping | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM staff_map WHERE company_code = :companyCode AND staff_raw = :staffRaw",
    { companyCode, staffRaw },
  )
  return rows[0] as StaffMapping | undefined
}

/** Remember (or update) a staff → AltomateHR employee mapping. */
export async function upsertMapping(input: {
  companyCode: string
  staffRaw: string
  altomateEmployeeId: string
  altomateEmployeeName?: string | null
}): Promise<void> {
  await pool.query(
    `INSERT INTO staff_map (company_code, staff_raw, altomate_employee_id, altomate_employee_name)
     VALUES (:companyCode, :staffRaw, :altomateEmployeeId, :altomateEmployeeName)
     ON DUPLICATE KEY UPDATE
       altomate_employee_id   = VALUES(altomate_employee_id),
       altomate_employee_name = VALUES(altomate_employee_name)`,
    {
      companyCode: input.companyCode,
      staffRaw: input.staffRaw,
      altomateEmployeeId: input.altomateEmployeeId,
      altomateEmployeeName: input.altomateEmployeeName ?? null,
    },
  )
}

export async function listMappingsForCompany(
  companyCode: string,
): Promise<StaffMapping[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM staff_map WHERE company_code = :companyCode ORDER BY staff_raw",
    { companyCode },
  )
  return rows as StaffMapping[]
}
