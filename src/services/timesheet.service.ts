import * as XLSX from "xlsx"

import { normalizeTimesheet, type ParsedTimesheet } from "../domain/timesheet"

/**
 * Parse an uploaded timesheet workbook (first sheet) into normalized,
 * per-company employee lines. Reads the raw cell grid with SheetJS and
 * hands it to the pure normalizer in `domain/timesheet`. `knownCodes` are
 * the timesheet codes set on the Companies page; a Company value outside
 * them gets a warning.
 */
export function parseTimesheet(buf: Buffer, knownCodes: string[]): ParsedTimesheet {
  const wb = XLSX.read(buf, { type: "buffer" })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return normalizeTimesheet([], knownCodes)
  const ws = wb.Sheets[sheetName]
  if (!ws) return normalizeTimesheet([], knownCodes)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  })
  return normalizeTimesheet(rows, knownCodes)
}
