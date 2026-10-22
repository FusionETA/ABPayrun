# ABPayrun (ABPay)

Companion app for **AltomateHR** that turns Ayu Borneo's monthly timesheet
into per-company payroll runs.

Upload **one** `.xlsx` (all companies mixed) → ABPay splits it by company,
validates every employee against AltomateHR, previews it, then posts a
payroll run per company.

## AltomateHR

ABPay talks to the **AltomateHR v2** API (`https://hr-api.altomate.io`):

| Endpoint | Credential | Used for |
|---|---|---|
| `POST /auth/verify` | master key (`wp_master_…`) | login — checks the password only; ABPay mints its own session |
| `POST /auth/organizations` | master key | refreshing the owner's companies (`{ userId }`) |
| `GET /whoami` | company key (`wp_live_…`) | checking a pasted key belongs to that company |
| `GET /employees` | company key | matching timesheet staff (employees + supervisors, by employee number or name) |
| `GET /projects` | company key | matching outlets (active projects) |
| `GET /payroll/runs` | company key, Payroll module | which month each company can run next |
| `GET /payroll/runs/{id}` | company key, Payroll module | who is already in the month's other runs |
| `POST /payroll/runs` | company key, Payroll module | creating a timesheet's run (named after it) |

The master key can only reach the two `/auth/*` endpoints; company data is
always read with that company's own key.

## Several timesheets a month

A month can have more than one timesheet — say, one per staff group. Each
timesheet is posted as its own AltomateHR run per company, **named after the
timesheet** (the name is typed on upload, filled in from the file name), and
ABPay tracks each run by its id. Uploading for a month that already has a
timesheet asks whether it's a new timesheet or a corrected copy of one; a
corrected copy replaces only that timesheet's draft runs.

A person is paid in only one run a month, so a timesheet is refused while
anyone on it is already in another of the month's runs (another timesheet's,
or one made in AltomateHR). Needs an AltomateHR with run names (Oct 2026+).

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
