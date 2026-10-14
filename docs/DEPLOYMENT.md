# ORYX — Deployment Runbook

Status: **prepared, not performed.** Nothing in this repository has been
deployed. This document describes the steps a deployment engineer must take and
the checks that must pass before ORYX handles real data.

Read `docs/LOCAL_DEVELOPMENT.md` first; this runbook assumes that local setup
works.

---

## 1. What must be true before you start

| Requirement | Why |
| --- | --- |
| PostgreSQL 15 or newer | The schema uses `BigInt`, arrays and JSON columns |
| Node.js 20 or newer | Required by Next.js 15 and NestJS 11 |
| HTTPS terminating endpoint | Session cookies are `Secure` in production |
| A secret manager | MFA keys and JWT secrets must not live in a file on disk |
| A backup target | The database holds all tenant data |

Do not deploy with the seeded development passwords. Section 6 covers this.

---

## 2. Environment variables

All variables are documented in `.env.example`, which contains **no real
secrets**. Copy it and replace every placeholder.

### Required

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Use `sslmode=require` for a managed database |
| `JWT_ACCESS_SECRET` | ≥ 32 random characters. Rotating it invalidates every access token |
| `JWT_REFRESH_SECRET` | ≥ 32 random characters, **different** from the access secret. Rotating it signs every user out |
| `MFA_ENCRYPTION_KEY` | ≥ 32 random characters. **Rotating it invalidates every MFA enrollment** |
| `CORS_ORIGINS` | Comma-separated admin origins, e.g. `https://admin.oryx.example` |
| `NODE_ENV` | Must be `production` so cookies default to `Secure` |

### Recommended

| Variable | Notes |
| --- | --- |
| `COOKIE_SECURE` | Defaults to `true` when `NODE_ENV=production`. Set explicitly if TLS terminates upstream |
| `COOKIE_SAMESITE` | `lax` (default). Use `none` **only** with `Secure` when the admin app is on a different site than the API |
| `COOKIE_DOMAIN` | Set to `.oryx.example` only if the API and admin share a parent domain |
| `MFA_ISSUER` | Shown in authenticator apps. Set to your real brand name |
| `MFA_CHALLENGE_TTL` | Seconds the login challenge stays valid. Default 300 |
| `AUTH_THROTTLE_LIMIT` | Login attempts per minute per IP. Default 10 |
| `THROTTLE_LIMIT` | Global requests per minute per IP. Default 120 |
| `API_PORT` | Default 3001 |
| `API_PREFIX` | Default `api`. Routes become `/api/v1/...` |

### Admin application

Set in the admin build environment (these are embedded at build time):

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Public API base, e.g. `https://api.oryx.example/api` |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `ar` or `en` |
| `NEXT_PUBLIC_DEFAULT_THEME` | `dark` or `light` |

### Generating secrets

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it once per secret. Never reuse a value across variables or environments.

---

## 3. Database migration

Migrations are versioned SQL files under
`packages/database/prisma/migrations/`. They are applied in order and are safe
to run repeatedly.

```bash
# Verify what will be applied without changing anything
pnpm --filter @oryx/database exec prisma migrate status

# Apply pending migrations (no interactive prompts, no data loss)
pnpm db:migrate
```

Rules:

- **Never** use `prisma migrate dev` against production; it can reset the
  database.
- `pnpm db:reset` **destroys all data**. It exists for local development only.
- Take a backup immediately before applying migrations.
- The seed script (`pnpm db:seed`) is idempotent and safe to re-run, but review
  what it creates before running it against production: it inserts the module
  catalog, three example plans, ORYX internal companies, roles and CMS
  baseline records. It also creates a Super Admin from
  `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`.

### First production deploy

1. Apply migrations.
2. Run the seed to install the module catalog and roles, but set
   `SEED_SUPER_ADMIN_EMAIL` to the real owner address and
   `SEED_SUPER_ADMIN_PASSWORD` to a strong, unique password.
3. Sign in as that Super Admin and immediately:
   - change the password,
   - enroll TOTP MFA,
   - store the recovery codes in the secret manager,
   - create the real companies and plans,
   - deactivate or delete the demo tenants (they are flagged `SEED_DEMO_DATA`).

---

## 4. Building and starting

```bash
# Build workspace packages before the apps: they resolve each other from dist/
pnpm --filter @oryx/shared build
pnpm --filter @oryx/database build
pnpm --filter @oryx/api build
pnpm --filter @oryx/admin build

# Start the API
node apps/api/dist/main.js

# Start the admin app
pnpm --filter @oryx/admin start
```

The API listens on `API_PORT` (default 3001) and serves:

| Path | Purpose |
| --- | --- |
| `/api/health` | Liveness and database connectivity. Version-neutral, unauthenticated |
| `/api/v1/...` | Versioned API surface |
| `/api/docs` | Swagger UI. **Restrict or disable this in production** |

### Health check

```bash
curl -fsS https://api.oryx.example/api/health
# {"status":"ok","service":"oryx-api","version":"0.1.0","database":"up",...}
```

`status` is `degraded` when the database is unreachable. Wire this into your
platform's health probe and restart the process on repeated failure.

---

## 5. Reverse proxy and HTTPS

The API must sit behind TLS. A minimal nginx front end:

```nginx
server {
  listen 443 ssl http2;
  server_name api.oryx.example;

  ssl_certificate     /etc/letsencrypt/live/api.oryx.example/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.oryx.example/privkey.pem;

  # Required so the API sees the real client IP for rate limiting and audit.
  location / {
    proxy_pass         http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}

server {
  listen 80;
  server_name api.oryx.example;
  return 301 https://$host$request_uri;
}
```

Notes:

- The refresh cookie is scoped to `/api/v1/auth`; do not rewrite that path.
- Set `COOKIE_SECURE=true` when TLS terminates at the proxy and the API speaks
  plain HTTP internally.
- Do not add a caching layer in front of `/api/v1/auth`.
- The admin app is a separate origin (`https://admin.oryx.example`) and must
  appear in `CORS_ORIGINS` exactly, with scheme and without a trailing slash.

---

## 6. Removing development defaults

Before the first real use:

| Item | Action |
| --- | --- |
| Seeded Super Admin password | Change it, or create a new Super Admin and disable the seeded one |
| Seeded company admin accounts (`admin@oryx-auto.local`, `admin@demo-alnoor.local`) | Change the password or remove the memberships |
| Demo tenants (`DEMO-ALNOOR`, `DEMO-GULFAUTO`) | Archive them; they are flagged `SEED_DEMO_DATA` |
| Swagger UI (`/api/docs`) | Restrict to an internal network or disable |
| `.env` | Must never be committed. Verify with `git check-ignore -v .env` |

Confirm no secret is tracked:

```bash
git ls-files | grep -E '(^|/)\.env$' && echo 'SECRET FILE TRACKED' || echo 'clean'
```

---

## 7. Secret management

| Secret | Storage | Rotation impact |
| --- | --- | --- |
| `DATABASE_URL` | Secret manager; inject at runtime | Reconnect required |
| `JWT_ACCESS_SECRET` | Secret manager | Every access token is invalidated; users re-authenticate silently via refresh |
| `JWT_REFRESH_SECRET` | Secret manager | Every session ends; all users sign in again |
| `MFA_ENCRYPTION_KEY` | Secret manager | **Every MFA enrollment becomes unreadable.** Users must re-enroll. Rotate only during a maintenance window, and keep the previous key available for a transition period if you implement key versioning |
| `SEED_SUPER_ADMIN_PASSWORD` | Use once, then remove | None |

Guidance:

- Inject secrets as environment variables from the platform's secret store; do
  not bake them into images.
- Restrict read access to operators who need it.
- Never log a secret. The API does not log tokens, MFA secrets or recovery
  codes, and it strips the refresh token from every response body.

---

## 8. Backup and restore

### Backup

```bash
# Logical backup, compressed
pg_dump "$DATABASE_URL" --format=custom --file="oryx-$(date +%F-%H%M).dump"

# Verify it is readable before trusting it
pg_restore --list "oryx-$(date +%F-%H%M).dump" | head
```

Schedule at least daily, retain at least 30 days, and store copies off the
database host. Take an extra backup immediately before any migration.

### Restore

```bash
# Restore into a fresh database, never over the live one
createdb oryx_restore
pg_restore --dbname=oryx_restore --no-owner --clean --if-exists oryx-<timestamp>.dump
# Point a staging API at it and verify /api/health and a login before promoting.
```

### Rollback

| Change | Rollback |
| --- | --- |
| Application release | Redeploy the previous image or commit. The schema is unchanged |
| Migration | Restore the pre-migration backup. Prisma migrations are forward-only; there is no automatic down-migration |
| Secret rotation | Restore the previous value from the secret manager |
| MFA key rotation | Restore the previous key, or reset MFA per user via `POST /api/v1/auth/mfa/reset/:userId` |

Because migrations are forward-only, always confirm a migration is additive
before applying it to production, and always have the pre-migration backup.

---

## 9. Production validation checklist

Run through this after every deployment.

- [ ] `GET /api/health` returns `"database":"up"`
- [ ] Sign in as the Super Admin; the login response sets an `oryx_rt` cookie
      that the browser reports as `HttpOnly` and `Secure`
- [ ] `document.cookie` in the admin app does **not** contain `oryx_rt`
- [ ] A state-changing request without the `x-oryx-csrf` header returns 403
- [ ] MFA is enrolled on the Super Admin; a password-only login returns a
      challenge rather than a session
- [ ] A recovery code signs in once and is then rejected
- [ ] `GET /api/v1/companies` with a company admin token returns only that
      company
- [ ] `GET /api/v1/audit-logs?companyId=<other tenant>` as a company admin
      returns 403
- [ ] The dashboard shows real figures, and no demo notice once demo tenants are
      archived
- [ ] Both themes and both languages render without layout breakage at 390 px
- [ ] The audit log contains an entry for the sign-in above
- [ ] No `.env` file and no secret appears in `git ls-files`

---

## 10. Operational notes

**Rate limiting.** The API applies a global limit (`THROTTLE_LIMIT`) and a
tighter limit on `/auth/login` (`AUTH_THROTTLE_LIMIT`). Both are per IP, so a
reverse proxy must forward the real client IP or every user shares one bucket.

**Sessions.** Access tokens live 15 minutes by default; refresh tokens 30 days.
Every refresh rotates the token and a replayed token revokes all sessions for
that user. Deactivating a membership or suspending a user also revokes their
sessions immediately.

**Support access.** A platform administrator cannot read tenant data until it
opens a support session with a reason and a bounded lifetime. Sessions are
audited on open and on end.

**Monitoring.** Alert on `/api/health` failing, on a sustained rise in 401 or
403 responses, and on `plan.limit_exceeded` rates. The audit log is the source
of truth for who changed what.

**Not implemented in Execution 01.** No payment gateway, no email/SMS/push
delivery, no storage or API-request metering, no automated off-site backup. Do
not assume any of these exist.
