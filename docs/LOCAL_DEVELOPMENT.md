# ORYX — Local Development Runbook

Verified on Debian 13 with Node 24, pnpm 9.15.9 and PostgreSQL 17.

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | ≥ 20 (24 verified) | `node -v` |
| pnpm | 9.15.9 | `corepack enable && corepack prepare pnpm@9.15.9 --activate` |
| PostgreSQL | ≥ 15 (17 verified) | Must accept password auth on `127.0.0.1` |

## 2. Install

```bash
git clone https://github.com/mohammadaljallad079-rgb/oryx.git
cd oryx
pnpm install
```

## 3. Database

Create the role and database (once):

```bash
sudo -u postgres psql -c "CREATE ROLE oryx WITH LOGIN PASSWORD 'oryx_dev_password' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE oryx_dev OWNER oryx;"
```

## 4. Environment

```bash
cp .env.example .env
```

`.env` is git-ignored. `.env.example` contains no real secrets. At minimum set:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | ≥ 32 random characters; access-token signing |
| `JWT_REFRESH_SECRET` | ≥ 32 random characters; refresh-token signing |
| `CORS_ORIGINS` | Comma-separated allowed origins (default `http://localhost:3000`) |
| `AUTH_THROTTLE_LIMIT` | Login attempts per minute per IP (default 10) |
| `THROTTLE_LIMIT` | Global requests per minute per IP (default 120) |
| `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` | Seeded platform account |

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The admin app reads its own `apps/admin/.env.local`:

```
NEXT_PUBLIC_API_BASE_URL="http://localhost:3001/api"
NEXT_PUBLIC_DEFAULT_LOCALE=ar
NEXT_PUBLIC_DEFAULT_THEME=dark
```

## 5. Migrate and seed

```bash
pnpm db:generate      # Prisma client
pnpm db:migrate       # apply migrations (prisma migrate deploy)
pnpm db:seed          # module catalog, plans, roles, ORYX companies, demo tenants, CMS
```

`pnpm db:migrate:dev` is the interactive variant for authoring new migrations.
`pnpm db:reset` drops and rebuilds the database.

### Seeded accounts (development only)

| Role | Email | Password |
| --- | --- | --- |
| Platform Super Admin | `superadmin@oryx.local` | `ChangeMe!Oryx2026` |
| Company admin (ORYX Auto Services) | `admin@oryx-auto.local` | `ChangeMe!Oryx2026` |
| Company admin (Al Noor Trading, demo tenant) | `admin@demo-alnoor.local` | `ChangeMe!Oryx2026` |

Change these before any non-local use. Two companies are flagged
`SEED_DEMO_DATA` in `Company.notes`; the dashboard labels their figures as
demo data.

## 6. Run

Terminal 1 — API:

```bash
pnpm dev:api
# http://localhost:3001/api
# Swagger UI: http://localhost:3001/api/docs
# Health:     http://localhost:3001/api/health
```

Terminal 2 — admin app:

```bash
pnpm dev:admin
# http://localhost:3000
```

Sign in with the Super Admin account. The dashboard defaults to Arabic RTL and
the dark theme; both are switchable from the header and persist per user.

## 7. Tests

```bash
# 1. Business-logic and authorization invariants (no database needed)
pnpm --filter @oryx/shared test

# 2. API integration: real HTTP surface, guards and Prisma against the seeded DB
pnpm --filter @oryx/api test:e2e

# 3. UI acceptance + screenshots (API and admin must already be running)
pnpm --filter @oryx/admin test:ui
```

The API integration suite creates `AUTHZ-*` fixtures and removes them in
`beforeAll`/`afterAll`. The UI suite creates `E2E-*` fixtures.

If the UI suite reports login timeouts, raise the throttle limits for the
session:

```bash
AUTH_THROTTLE_LIMIT=500 THROTTLE_LIMIT=5000 pnpm dev:api
```

Screenshots are written to `docs/execution-reports/screenshots/`.

## 8. Build

```bash
pnpm --filter @oryx/shared build
pnpm --filter @oryx/database build
pnpm --filter @oryx/api build
pnpm --filter @oryx/admin build
```

## 9. Useful commands

```bash
pnpm typecheck                 # all packages
pnpm --filter @oryx/database migrate:status
psql "$DATABASE_URL"           # inspect data
python3 scripts/generate-tile-art.py   # regenerate dashboard tile artwork
bash scripts/smoke.sh          # quick authenticated API smoke test
```

## 10. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `P1012` on API start | `DATABASE_URL` missing | Ensure `.env` exists at the repo root |
| `Cannot POST /api/auth/login` | Missing version prefix | Use `/api/v1/auth/login` |
| Login returns 429 | Auth throttle reached | Raise `AUTH_THROTTLE_LIMIT` |
| `dist/main.js` missing after build | Stale `tsconfig.build.tsbuildinfo` | `pnpm --filter @oryx/api build` (the script clears it) |
| Dashboard shows demo notice | All companies in scope are `SEED_DEMO_DATA` | Create a real company; the notice disappears |
| UI shows Arabic by default | Default locale is `ar` | Switch from the header, or set `NEXT_PUBLIC_DEFAULT_LOCALE=en` |
