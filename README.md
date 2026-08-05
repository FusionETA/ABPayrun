# ABPayrun (ABPay)

Companion app for **AltomateHR** that turns Ayu Borneo's monthly timesheet
into per-company payroll runs.

Upload **one** `.xlsx` (all companies mixed) → ABPay splits it by company,
validates every employee against AltomateHR, previews it, then posts a
payroll run per company.

## Stack

Hono + TypeScript (run with `tsx`, no build step) · MySQL (`mysql2`) ·
JWT sessions · server-rendered Hono JSX + Tailwind (CDN).

## Run locally

1. Copy `.env.example` → `.env` and fill it in.
2. `npm install`
3. `npm start` → http://localhost:8787

## Notes

- `.env` holds real secrets (AltomateHR master key, DB password, JWT +
  token-encryption keys) and is **git-ignored** — never commit it.
- Per-company AltomateHR API tokens are stored **AES-256-GCM encrypted**
  in the DB; AltomateHR employees/projects are TTL-cached (`altomate_cache`).
