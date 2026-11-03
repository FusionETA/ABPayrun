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
  method: "code" | "name" | "nickname" | null
  /** Why it didn't match, when there's more to say than "not found". */
  reason?: string
}

export type MatchableEmployee = {
  id: string
  name: string
  employeeId: string
  /** What colleagues call them ("Ivy"); matched like the name. */
  nickname?: string | null
}

// "(AL531) Boy Owen 2": a staff code written at the front of a nickname,
// the way the timesheet writes "AL531) Boy Owen 2". The bracket before it is
// optional; the one after it is what marks it as a code.
const NICKNAME_CODE_RE = /^\s*\(?\s*([A-Za-z]{1,6}\d+(?:-[A-Za-z0-9]{1,4})?)\s*\)\s*(.*)$/

/**
 * Split a nickname into the staff code at its front and the name after it.
 * "(AL531) Boy Owen 2" → { code: "AL531", name: "Boy Owen 2" };
 * "Ivy" → { code: null, name: "Ivy" }.
 */
export function nicknameParts(nickname: string | null | undefined): {
  code: string | null
  name: string
} {
  const m = NICKNAME_CODE_RE.exec(nickname ?? "")
  if (m) return { code: m[1]!.toUpperCase(), name: m[2]!.trim() }
  return { code: null, name: (nickname ?? "").trim() }
}

/**
 * The staff codes a person answers to: their employee number, and a code at
 * the front of their nickname (AltomateHR files payroll by a number like
 * 00015, while the timesheet knows them as AL531).
 */
function staffCodes(e: MatchableEmployee): string[] {
  const codes: string[] = []
  if (e.employeeId) codes.push(e.employeeId.toUpperCase())
  const fromNickname = nicknameParts(e.nickname).code
  if (fromNickname && !codes.includes(fromNickname)) codes.push(fromNickname)
  return codes
}

/** Their nickname without a staff code in front, normalized. */
function nicknameName(e: MatchableEmployee): string {
  return normalizeName(nicknameParts(e.nickname).name)
}

/** One person holding the code — by employee number first, then nickname. */
function findByCode(
  code: string,
  employees: MatchableEmployee[],
): MatchableEmployee | undefined {
  const byNumber = employees.find(
    (e) => e.employeeId && e.employeeId.toUpperCase() === code,
  )
  if (byNumber) return byNumber
  // A code written in two people's nicknames is a typo in AltomateHR:
  // neither is guessed.
  const byNickname = employees.filter((e) => nicknameParts(e.nickname).code === code)
  return byNickname.length === 1 ? byNickname[0] : undefined
}

/**
 * Match one timesheet line to an AltomateHR employee:
 *   1. by staff code == `employeeId`, or the code at the front of their
 *      nickname (exact, case-insensitive), then
 *   2. by normalized name or nickname (exact).
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
    const byCode = findByCode(code, employees)
    if (byCode) {
      // The code is someone's, but the name on the row is exactly someone
      // ELSE's — e.g. a duplicate written with the other company's number
      // ("AB111) Yasmin" where AB111 is Bella here and Yasmin is AB111-T).
      // Matching by code would pay the wrong person, so neither is guessed.
      // Only that case: the other person's code is this one with a suffix.
      // An unrelated namesake (say, a former employee called just "Siti")
      // says nothing about whether the code is wrong.
      const target = normalizeName(line.name)
      // The row's name being their nickname counts as their name too.
      if (
        target &&
        normalizeName(byCode.name) !== target &&
        nicknameName(byCode) !== target
      ) {
        const others = employees.filter(
          (e) =>
            e.id !== byCode.id &&
            (normalizeName(e.name) === target || nicknameName(e) === target) &&
            staffCodes(e).some((c) => c.startsWith(`${code}-`)),
        )
        if (others.length > 0) {
          const other = others[0]!
          const otherCode = staffCodes(other).find((c) => c.startsWith(`${code}-`))
          return {
            ...miss,
            reason: `${code} is ${byCode.name} in AltomateHR, but ${other.name} is ${otherCode} — fix the staff code on the timesheet.`,
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
    // The row's name against each person's full name OR nickname — a
    // timesheet often writes "Ivy" for Ivy Tan Mei Ling. Exactly one person
    // → accept. Zero, or more than one (two people called Ivy, or a nickname
    // that is someone else's full name) → unmatched, so posting is blocked
    // rather than paying the wrong person.
    const byName = (e: MatchableEmployee) => normalizeName(e.name) === target
    // A nickname's staff code isn't part of what they're called:
    // "(AL531) Boy Owen 2" answers to "Boy Owen 2".
    const byNickname = (e: MatchableEmployee) => nicknameName(e) === target
    const matches = employees.filter((e) => byName(e) || byNickname(e))
    if (matches.length === 1) {
      const m = matches[0]!
      return {
        matched: true,
        altomateId: m.id,
        altomateName: m.name,
        method: byName(m) ? "name" : "nickname",
      }
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
