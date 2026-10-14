/**
 * Pure matching helpers: timesheet rows → AltomateHR employees, and
 * timesheet outlets → AltomateHR projects. Kept pure so the all-or-nothing
 * validation can be reasoned about + tested without the network.
 */

/**
 * Normalize a name/label for comparison: drop emojis + punctuation,
 * collapse whitespace, lowercase. "AL426) Ivy" → (code already stripped
 * upstream) "ivy"; "❤Ferah" → "ferah"; "Boy Owen 2" → "boy owen 2".
 */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export type EmployeeMatch = {
  matched: boolean
  /** AltomateHR employee (user) id when matched. */
  altomateId: string | null
  altomateName: string | null
  /** How it matched, for the preview. */
  method: "code" | "name" | null
  /** Why it didn't match, when there's more to say than "not found". */
  reason?: string
}

export type MatchableEmployee = {
  id: string
  name: string
  employeeId: string
}

/**
 * Match one timesheet line to an AltomateHR employee:
 *   1. by staff code == `employeeId` (exact, case-insensitive), then
 *   2. by normalized name (exact).
 * No fuzzy/partial matching — an ambiguous match should surface as
 * "unmatched" so the all-or-nothing gate blocks it rather than guessing.
 */
export function matchEmployee(
  line: { name: string; code: string | null },
  employees: MatchableEmployee[],
): EmployeeMatch {
  const miss: EmployeeMatch = {
    matched: false,
    altomateId: null,
    altomateName: null,
    method: null,
  }

  if (line.code) {
    const code = line.code.toUpperCase()
    const byCode = employees.find(
      (e) => e.employeeId && e.employeeId.toUpperCase() === code,
    )
    if (byCode) {
      // The code is someone's, but the name on the row is exactly someone
      // ELSE's — e.g. a duplicate written with the other company's number
      // ("AB111) Yasmin" where AB111 is Bella here and Yasmin is AB111-T).
      // Matching by code would pay the wrong person, so neither is guessed.
      // Only that case: the other person's code is this one with a suffix.
      // An unrelated namesake (say, a former employee called just "Siti")
      // says nothing about whether the code is wrong.
      const target = normalizeName(line.name)
      if (target && normalizeName(byCode.name) !== target) {
        const others = employees.filter(
          (e) =>
            e.id !== byCode.id &&
            normalizeName(e.name) === target &&
            !!e.employeeId &&
            e.employeeId.toUpperCase().startsWith(`${code}-`),
        )
        if (others.length > 0) {
          const other = others[0]!
          return {
            ...miss,
            reason: `${code} is ${byCode.name} in AltomateHR, but ${other.name} is ${
              other.employeeId || "without a staff number"
            } — fix the staff code on the timesheet.`,
          }
        }
      }
      return {
        matched: true,
        altomateId: byCode.id,
        altomateName: byCode.name,
        method: "code",
      }
    }
  }

  const target = normalizeName(line.name)
  if (target) {
    const matches = employees.filter((e) => normalizeName(e.name) === target)
    // Exactly one name match → accept. Zero or >1 (ambiguous) → unmatched.
    if (matches.length === 1) {
      const m = matches[0]!
      return { matched: true, altomateId: m.id, altomateName: m.name, method: "name" }
    }
  }

  return miss
}

export type MatchableProject = { id: string; name: string }

export type ProjectMatch = {
  matched: boolean
  projectId: string | null
  projectName: string | null
}

/** Match a timesheet outlet to an AltomateHR project by normalized name. */
export function matchProject(
  outlet: string,
  projects: MatchableProject[],
): ProjectMatch {
  const target = normalizeName(outlet)
  if (target) {
    const p = projects.find((pr) => normalizeName(pr.name) === target)
    if (p) return { matched: true, projectId: p.id, projectName: p.name }
  }
  return { matched: false, projectId: null, projectName: null }
}
