import "dotenv/config"
import { z } from "zod"

/**
 * Environment configuration. Validated once at startup — if anything is
 * missing/malformed the process exits loudly rather than failing at the
 * first request.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.string().default("development"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars."),
  SESSION_COOKIE: z.string().default("abpay_session"),
  // AES-256-GCM key (hex) for encrypting stored wp_live tokens at rest.
  TOKEN_ENC_KEY: z.string().min(32, "TOKEN_ENC_KEY must be a 64-char hex key."),

  // ── AltomateHR ──────────────────────────────────────────────────
  ALTOMATE_BASE_URL: z.string().url(),
  // App-level credential for the identity endpoints (/auth/verify,
  // /auth/organizations). Preferred: a platform MASTER key (wp_master_*),
  // which authenticates the app across ALL the owner's orgs and isn't tied
  // to any single org's token lifecycle. A per-org wp_live_ token also
  // works (backward-compat). NOT used for reading payroll data — that uses
  // the per-company wp_live_ tokens stored (encrypted) in the DB.
  ALTOMATE_AUTH_TOKEN: z.string().min(1),
  // Seconds a cached AltomateHR read (employees/projects) stays fresh
  // before the Companies page re-pulls. 0 = always pull live.
  ALTOMATE_CACHE_TTL: z.coerce.number().int().nonnegative().default(600),
  ALTOMATE_TOKEN_ABSA: z.string().optional(),
  ALTOMATE_TOKEN_ABM: z.string().optional(),
  ALTOMATE_TOKEN_ABSB: z.string().optional(),
  ALTOMATE_TOKEN_ABAP: z.string().optional(),
  ALTOMATE_TOKEN_ABPJ: z.string().optional(),

  // ── Database (MySQL) ────────────────────────────────────────────
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  // "REQUIRED" (default) → TLS on. "DISABLED" → plain (local dev only).
  DB_SSL: z.string().default("REQUIRED"),
  // Optional path to a CA cert PEM (DigitalOcean's) for full cert
  // verification. When unset we still use TLS but skip CA verification.
  DB_CA_CERT: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  console.error("❌ Invalid ABPay environment configuration:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}
const env = parsed.data

/**
 * Company code (as it appears in the timesheet's `Company` column) →
 * AltomateHR per-org API token. Add a row here + an env var when Ayu
 * Borneo onboards another company.
 */
export const companyTokens: Record<string, string | undefined> = {
  ABSA: env.ALTOMATE_TOKEN_ABSA,
  ABM: env.ALTOMATE_TOKEN_ABM,
  ABSB: env.ALTOMATE_TOKEN_ABSB,
  ABAP: env.ALTOMATE_TOKEN_ABAP,
  ABPJ: env.ALTOMATE_TOKEN_ABPJ,
}

/** The set of company codes ABPay is configured to handle. */
export const knownCompanyCodes = Object.keys(companyTokens)

export const config = {
  port: env.PORT,
  isProd: env.NODE_ENV === "production",
  jwtSecret: env.JWT_SECRET,
  sessionCookie: env.SESSION_COOKIE,
  tokenEncKey: env.TOKEN_ENC_KEY,
  altomate: {
    baseUrl: env.ALTOMATE_BASE_URL.replace(/\/+$/, ""),
    authToken: env.ALTOMATE_AUTH_TOKEN,
    cacheTtlSec: env.ALTOMATE_CACHE_TTL,
  },
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    sslEnabled: env.DB_SSL.trim().toUpperCase() !== "DISABLED",
    caCertPath: env.DB_CA_CERT,
  },
  companyTokens,
}

/** Look up the AltomateHR token for a timesheet company code. */
export function tokenForCompany(code: string): string | undefined {
  return companyTokens[code.trim().toUpperCase()]
}
