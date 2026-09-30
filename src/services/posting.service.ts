import {
  MAPPABLE_COLUMNS,
  planCompany,
  resolveMapping,
  type ColumnMapping,
  type CompanyPlan,
} from "../domain/posting"
import type { ParsedTimesheet } from "../domain/timesheet"
import { decryptSecret } from "../lib/crypto"
import { periodLabel, type Period } from "../lib/period"
import { listCompanies, type CompanyRecord } from "../repositories/company.repository"
import {
  claimImportForPosting,
  getImport,
  getImportPayload,
  updateImportStatus,
  type ImportRecord,
} from "../repositories/import.repository"
import { listColumnMappings } from "../repositories/mapping.repository"
import { listRunsForImport, recordRun, type PostedRun } from "../repositories/run.repository"
import {
  AltomateApiError,
  createPayrollRun,
  generatePayrollRun,
  getPayrollRun,
  importSalaryChanges,
  listAdjustmentCategories,
  listPayrollEmployees,
  saveRunAdjustment,
  type AltomateAdjustmentCategory,
} from "./altomate.service"
import { validateTimesheet } from "./validate.service"

export type LoadedImport = {
  record: ImportRecord
  period: Period
  parsed: ParsedTimesheet
}

export async function loadImport(id: number): Promise<LoadedImport | null> {
  const record = await getImport(id)
  if (!record) return null
  const json = await getImportPayload(id)
  if (!json) return null
  return {
    record,
    period: { year: record.period_year, month: record.period_month },
    parsed: JSON.parse(json) as ParsedTimesheet,
  }
}

function tokenOf(company: CompanyRecord): string | null {
  if (!company.wp_token_enc) return null
  try {
    return decryptSecret(company.wp_token_enc)
  } catch {
    return null
  }
}

function describe(err: unknown, fallback: string): string {
  return err instanceof AltomateApiError ? err.message : fallback
}

/**
 * The pay items a timesheet column can post as: allowances, remuneration and
 * ordinary deductions. Statutory (PCB, zakat, CP38), TP1 reliefs and benefits
 * in kind are left out — none of them is a timesheet figure. The catalogue is
 * the same in every company, so the first connected one is asked.
 */
export async function loadMappableCategories(): Promise<AltomateAdjustmentCategory[]> {
  for (const company of await listCompanies()) {
    const token = tokenOf(company)
    if (!token) continue
    const all = await listAdjustmentCategories(token)
    return all.filter(
      (c) =>
        (c.group === "ALLOWANCE" || c.group === "REMUNERATION" || c.group === "DEDUCTION") &&
        !c.feedsLp1Relief &&
        !c.cashNeutral &&
        !c.nonCash &&
        !/^deduct_(zakat|cp38|additional_pcb|departure_levy)/.test(c.code),
    )
  }
  throw new AltomateApiError("auth", "No connected company to read AltomateHR's pay items from.")
}

export async function currentMapping(): Promise<ColumnMapping> {
  return resolveMapping(await listColumnMappings())
}

export type CompanyPostingPlan = {
  code: string
  companyName: string
  company: CompanyRecord | null
  plan: CompanyPlan | null
  /** Couldn't build a plan at all (no token, AltomateHR down, missing scope). */
  error: string | null
  posted: PostedRun | null
}

export type PostingPlan = {
  imp: LoadedImport
  mapping: ColumnMapping
  companies: CompanyPostingPlan[]
  /** Every blocker, company-prefixed. Empty = ready to post. */
  problems: string[]
  ok: boolean
}

/**
 * Build the whole month's plan from LIVE AltomateHR data: match the
 * timesheet again (a roster may have changed since the upload), read each
 * company's payroll profiles, and lay out every salary change and pay line.
 * The review screen renders this; posting executes the same thing.
 */
export async function buildPostingPlan(importId: number): Promise<PostingPlan | null> {
  const imp = await loadImport(importId)
  if (!imp) return null

  const [companies, mapping, categories, posted] = await Promise.all([
    listCompanies(),
    currentMapping(),
    loadMappableCategories(),
    listRunsForImport(importId),
  ])
  const report = await validateTimesheet(imp.parsed, companies)
  const byCode = new Map(
    companies.filter((c) => c.code).map((c) => [c.code!.toUpperCase(), c] as const),
  )

  const results = await Promise.all(
    report.companies.map(async (v): Promise<CompanyPostingPlan> => {
      const company = byCode.get(v.code.toUpperCase()) ?? null
      const already = posted.find((p) => p.company_code === v.code) ?? null
      const base = {
        code: v.code,
        companyName: v.companyName ?? v.code,
        company,
        posted: already,
      }
      if (v.error || !company) {
        return { ...base, plan: null, error: v.error ?? `No company uses the code ${v.code}.` }
      }
      const token = tokenOf(company)
      if (!token) return { ...base, plan: null, error: "No API token connected." }

      let payrollEmployees
      try {
        payrollEmployees = await listPayrollEmployees(token)
      } catch (err) {
        return {
          ...base,
          plan: null,
          error: describe(err, "Couldn't load payroll profiles from AltomateHR."),
        }
      }

      const plan = planCompany({
        period: imp.period,
        lines: v.employees.map((e) => ({ ...e, matchedUserId: e.match.altomateId })),
        payrollEmployees,
        mapping,
        categories,
      })
      // Outlets must match too — the same all-or-nothing gate as the preview.
      for (const o of v.outlets) {
        if (!o.matched) plan.problems.push(`Outlet ${o.outlet} isn't matched to an AltomateHR project.`)
      }
      return { ...base, plan, error: null }
    }),
  )

  const problems: string[] = []
  for (const r of results) {
    if (r.posted?.status === "POSTED") continue // done; nothing more is sent
    if (r.error) problems.push(`${r.companyName}: ${r.error}`)
    for (const p of r.plan?.problems ?? []) problems.push(`${r.companyName}: ${p}`)
  }

  return { imp, mapping, companies: results, problems, ok: problems.length === 0 }
}

/** What ABPay keeps about a company's posted run (posted_run.summary_json). */
export type PostedRunSummary = {
  payslipCount: number
  employees: number
  salaryChanges: number
  excluded: number
  skipped: { name: string; reason: string }[]
  totalGross: number
  totalNet: number
  totalCostToEmployer: number
}

export type PostOutcome =
  | { ok: true; posted: number; failed: number }
  | { ok: false; error: string }

/**
 * Post the month to AltomateHR, company by company:
 *   1. new basic salaries (salary-change import, recorded in history),
 *   2. create the month's DRAFT run, leaving out anyone not on the timesheet,
 *   3. save each person's pay lines as their run adjustment,
 *   4. run payroll (EPF, SOCSO, EIS, PCB are computed by AltomateHR).
 * Runs stay DRAFT: the admin reviews and submits them in AltomateHR.
 *
 * It stops at the first company that fails, so a problem is fixed once
 * rather than repeated eleven times; posting again resumes — companies
 * already POSTED are skipped and a recorded draft run is reused.
 */
export async function postImport(importId: number, postedBy: string): Promise<PostOutcome> {
  const plan = await buildPostingPlan(importId)
  if (!plan) return { ok: false, error: "That import no longer exists — upload the timesheet again." }
  if (!plan.ok) return { ok: false, error: "The review still has problems to fix." }
  if (!(await claimImportForPosting(importId))) {
    return { ok: false, error: "This month is already being posted, or has been posted." }
  }

  const label = periodLabel(plan.imp.period)
  const note = `Imported by ABPay from ${plan.imp.record.filename ?? "the timesheet"} (${label}), posted by ${postedBy}.`
  let posted = 0
  let failed = 0

  try {
    for (const c of plan.companies) {
      if (c.posted?.status === "POSTED") {
        posted++
        continue
      }
      const company = c.company!
      const token = tokenOf(company)!
      const companyPlan = c.plan!
      let runId: string | null = c.posted?.altomate_run_id ?? null

      try {
        // 1. Salaries first, so the run is generated on the new figures.
        const changes = companyPlan.employees.filter((e) => e.newSalary != null)
        if (changes.length > 0) {
          await importSalaryChanges(
            token,
            changes.map((e) => ({
              email: e.email,
              newSalary: e.newSalary!,
              notes: `ABPay timesheet ${label}`,
            })),
          )
        }

        // 2. The month's run — reuse the draft an earlier attempt made.
        if (runId) {
          const existing = await getPayrollRun(token, runId).catch(() => null)
          if (!existing || existing.status !== "DRAFT") runId = null
        }
        if (!runId) {
          try {
            const run = await createPayrollRun(token, {
              periodYear: plan.imp.period.year,
              periodMonth: plan.imp.period.month,
              excludedEmployeeProfileIds: companyPlan.excluded.map((e) => e.employeeProfileId),
            })
            runId = run.id
          } catch (err) {
            if (err instanceof AltomateApiError && err.code === "conflict") {
              throw new AltomateApiError(
                "conflict",
                `AltomateHR already has a ${label} run that ABPay didn't create, so ABPay won't change it. Delete that draft in AltomateHR, then post again.`,
              )
            }
            throw err
          }
          // Remember it straight away: a crash after this must not create a second run.
          await recordRun({ importId, companyCode: c.code, altomateRunId: runId, status: "POSTING" })
        }

        // 3. Each person's pay lines (PUT replaces, so a retry is idempotent).
        for (const e of companyPlan.employees) {
          await saveRunAdjustment(token, runId, e.employeeProfileId, {
            manualLineItems: e.lines.map((l) => ({
              category: l.category,
              label: `${l.columnLabel} (timesheet)`,
              amount: l.amount,
              treatAsRecurring: false,
            })),
            notes: note,
          })
        }

        // 4. Run payroll.
        const result = await generatePayrollRun(token, runId)
        const summary: PostedRunSummary = {
          payslipCount: result.payslipCount,
          employees: companyPlan.employees.length,
          salaryChanges: changes.length,
          excluded: companyPlan.excluded.length,
          skipped: result.skippedEmployees.map((s) => ({ name: s.name, reason: s.reason })),
          totalGross: result.run.totalGross,
          totalNet: result.run.totalNet,
          totalCostToEmployer: result.run.totalCostToEmployer,
        }
        await recordRun({
          importId,
          companyCode: c.code,
          altomateRunId: runId,
          status: "POSTED",
          postedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          summary,
        })
        posted++
      } catch (err) {
        failed++
        console.error(`[abpay] posting ${c.companyName} failed:`, err)
        await recordRun({
          importId,
          companyCode: c.code,
          altomateRunId: runId,
          status: "FAILED",
          error: describe(err, "Something went wrong posting this company."),
        })
        break
      }
    }
  } finally {
    const total = plan.companies.length
    await updateImportStatus(
      importId,
      posted === total ? "POSTED" : posted > 0 ? "PARTIAL" : "FAILED",
    )
  }

  return { ok: true, posted, failed }
}

export { MAPPABLE_COLUMNS }
