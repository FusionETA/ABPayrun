import { decryptSecret, encryptSecret } from "../lib/crypto"
import * as companyRepo from "../repositories/company.repository"
import { whoami, type AltomateOrg } from "./altomate.service"

/**
 * Reconcile ABPay's company list to exactly the owner's AltomateHR
 * companies (called at login and on Refresh): upsert each org, then drop any
 * stale rows no longer in the owner's list. Guarded on a non-empty list so a
 * transient empty response never wipes connected companies + tokens.
 */
export async function syncOwnerCompanies(orgs: AltomateOrg[]): Promise<void> {
  for (const o of orgs) {
    await companyRepo.upsertCompany({ altomateOrgId: o.id, name: o.name })
  }
  if (orgs.length > 0) {
    const ids = orgs.map((o) => o.id)
    await companyRepo.deleteCompaniesNotIn(ids)
    await removeDeletedConnectedCompanies(ids)
  }
}

/**
 * A connected company missing from the owner's list is NOT removed on that
 * alone — a partial AltomateHR response once wiped every company and its
 * unrecoverable token. Instead its own token is asked: AltomateHR rejects the
 * key of a company that no longer exists (401/403), and only then is the row
 * removed. A key that still works means the list was just incomplete, and an
 * AltomateHR that can't be reached decides nothing — both keep the company
 * until the next Refresh.
 */
async function removeDeletedConnectedCompanies(listedOrgIds: string[]): Promise<void> {
  for (const company of await companyRepo.listConnectedCompaniesNotIn(listedOrgIds)) {
    let token: string
    try {
      token = decryptSecret(company.wp_token_enc!)
    } catch {
      continue // can't read the token, so can't check — keep it
    }

    let info
    try {
      info = await whoami(token)
    } catch (err) {
      console.warn(`[abpay] couldn't check "${company.name}" with AltomateHR; kept it.`, err)
      continue
    }

    if (info === null) {
      await companyRepo.deleteCompany(company.altomate_org_id)
      console.warn(`[abpay] removed "${company.name}": no longer in AltomateHR and its token is rejected.`)
    }
  }
}

export type ConnectResult = { ok: true } | { ok: false; error: string }

/**
 * Validate a pasted wp_live_* token and, if it belongs to the given
 * company, store it (encrypted). Rejects tokens for a different company.
 */
export async function connectToken(
  altomateOrgId: string,
  rawToken: string,
): Promise<ConnectResult> {
  const token = rawToken.trim()
  if (!token.startsWith("wp_live_")) {
    return { ok: false, error: "That doesn't look like a wp_live_ token." }
  }

  let info
  try {
    info = await whoami(token)
  } catch {
    return { ok: false, error: "Couldn't reach AltomateHR to validate the token." }
  }
  if (!info) {
    return { ok: false, error: "Token is invalid or revoked." }
  }
  if (info.organizationId !== altomateOrgId) {
    const other = await companyRepo.getCompanyByOrgId(info.organizationId)
    return {
      ok: false,
      error: `This token belongs to ${other?.name ?? "a different company"}, not this one.`,
    }
  }

  await companyRepo.setCompanyToken({
    altomateOrgId,
    tokenEnc: encryptSecret(token),
    scopes: info.scopes,
  })
  return { ok: true }
}

/** Decrypted token for a connected company (for payroll operations). */
export async function tokenForOrg(altomateOrgId: string): Promise<string | null> {
  const company = await companyRepo.getCompanyByOrgId(altomateOrgId)
  if (!company?.wp_token_enc) return null
  return decryptSecret(company.wp_token_enc)
}
