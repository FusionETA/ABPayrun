import { readFileSync } from "node:fs"
import mysql from "mysql2/promise"

import { config } from "./config"

/**
 * MySQL connection pool (DigitalOcean managed database). We use a pool so
 * concurrent requests don't serialise on one connection.
 *
 *  - `namedPlaceholders` lets repos bind with `:name` + an object.
 *  - `dateStrings` returns DATETIME as "YYYY-MM-DD HH:MM:SS" strings
 *    instead of JS Date objects (simpler to render + type).
 *  - DECIMAL columns come back as strings (mysql2 default) to preserve
 *    precision — parse with the app's number helper when doing math.
 */
function buildSsl(): mysql.PoolOptions["ssl"] {
  if (!config.db.sslEnabled) return undefined
  if (config.db.caCertPath) {
    // Full verification against DigitalOcean's CA certificate.
    return { ca: readFileSync(config.db.caCertPath, "utf8"), rejectUnauthorized: true }
  }
  // TLS is still on (traffic encrypted), but the CA isn't verified. Set
  // DB_CA_CERT to the DigitalOcean CA PEM to harden against MITM.
  return { rejectUnauthorized: false }
}

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  ssl: buildSsl(),
  namedPlaceholders: true,
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  enableKeepAlive: true,
})

/**
 * Create the schema idempotently. Called once on startup. Tables are
 * created in FK order (import before its children).
 */
export async function migrate(): Promise<void> {
  // Best-effort: ensure the schema DB exists before the pool uses it. A
  // least-privilege user (scoped to just this DB) won't have the
  // CREATE-DATABASE privilege — that's fine, the DB already exists in that
  // setup, so we swallow the error and carry on to the table creates below.
  try {
    const admin = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      ssl: buildSsl(),
    })
    try {
      await admin.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\``)
    } finally {
      await admin.end()
    }
  } catch (err) {
    console.warn(
      `[abpay] skipping CREATE DATABASE (${
        (err as { code?: string }).code ?? "error"
      }) — assuming ${config.db.database} already exists.`,
    )
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS import (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      period_year   INT NOT NULL,
      period_month  INT NOT NULL,
      filename      VARCHAR(255),
      status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
      uploaded_by   VARCHAR(255),
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_import_period (period_year, period_month)
    ) ENGINE=InnoDB
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_row (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      import_id             INT NOT NULL,
      company_code          VARCHAR(20) NOT NULL,
      staff_raw             VARCHAR(255) NOT NULL,
      matched_employee_id   VARCHAR(64),
      matched_employee_name VARCHAR(255),
      basic                 DECIMAL(12,2) NOT NULL DEFAULT 0,
      allowances_json       JSON NOT NULL,
      deductions_json       JSON NOT NULL,
      gross                 DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_import_row_import (import_id),
      CONSTRAINT fk_import_row_import FOREIGN KEY (import_id)
        REFERENCES import(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_map (
      id                     INT AUTO_INCREMENT PRIMARY KEY,
      company_code           VARCHAR(20) NOT NULL,
      staff_raw              VARCHAR(255) NOT NULL,
      altomate_employee_id   VARCHAR(64) NOT NULL,
      altomate_employee_name VARCHAR(255),
      created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_staff_map (company_code, staff_raw)
    ) ENGINE=InnoDB
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posted_run (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      import_id       INT NOT NULL,
      company_code    VARCHAR(20) NOT NULL,
      altomate_run_id VARCHAR(64),
      status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      error           TEXT,
      posted_at       DATETIME,
      UNIQUE KEY uq_posted_run (import_id, company_code),
      CONSTRAINT fk_posted_run_import FOREIGN KEY (import_id)
        REFERENCES import(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `)

  // A posting result: payslip count, totals, skipped people, salary changes.
  await addColumnIfMissing("posted_run", "summary_json", "JSON NULL")

  // The uploaded timesheet, parsed, kept between the preview, column-mapping,
  // review and post steps (one per import). Re-uploading replaces it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_payload (
      import_id   INT PRIMARY KEY,
      parsed_json LONGTEXT NOT NULL,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_import_payload_import FOREIGN KEY (import_id)
        REFERENCES import(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `)

  // Which AltomateHR pay item each timesheet column posts as. One row per
  // column; a NULL category means "don't import this column". Remembered
  // across months so the mapping is set once.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS column_mapping (
      column_key    VARCHAR(40) PRIMARY KEY,
      category_code VARCHAR(60) NULL,
      updated_by    VARCHAR(255),
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `)

  // Owner's AltomateHR companies + their (encrypted) API token. Synced
  // from /auth/verify at login; the token is pasted per-company in the UI.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS company (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      altomate_org_id VARCHAR(64) NOT NULL,
      name            VARCHAR(255) NOT NULL,
      code            VARCHAR(20),
      wp_token_enc    TEXT,
      wp_scopes       JSON,
      connected_at    DATETIME,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_company_org (altomate_org_id)
    ) ENGINE=InnoDB
  `)

  // TTL cache of per-org AltomateHR reads (employees, projects) so the
  // Companies page doesn't re-hit the API on every view. One row per
  // (org, kind); `synced_at` drives the TTL. Refresh forces a re-pull;
  // the pre-post validation always pulls fresh (bypasses this).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS altomate_cache (
      altomate_org_id VARCHAR(64) NOT NULL,
      kind            VARCHAR(20) NOT NULL,
      payload         JSON NOT NULL,
      synced_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (altomate_org_id, kind)
    ) ENGINE=InnoDB
  `)
}

/** `CREATE TABLE IF NOT EXISTS` never adds a column to an existing table. */
async function addColumnIfMissing(table: string, column: string, definition: string) {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { table, column },
  )
  if (rows.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
  }
}
