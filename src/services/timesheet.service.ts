import * as XLSX from "xlsx"

import { knownCompanyCodes } from "../config"
import { normalizeTimesheet, type ParsedTimesheet } from "../domain/timesheet"

/**
 * Parse an uploaded timesheet workbook (first sheet) into normalized,
 * per-company employee lines. Reads the raw cell grid with SheetJS and
 * hands it to the pure normalizer in `domain/timesheet`.
 */
export function parseTimesheet(buf: Buffer): ParsedTimesheet {
  const wb = XLSX.read(buf, { type: "buffer" })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return normalizeTimesheet([], knownCompanyCodes)
  const ws = wb.Sheets[sheetName]
  if (!ws) return normalizeTimesheet([], knownCompanyCodes)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  })
  return normalizeTimesheet(rows, knownCompanyCodes)
}
