# ORYX — Execution 10: existing-server pre-deployment

Status: **BLOCKED at STEP 1 — no server access is available in this
environment.** No staging environment was created, no backup was taken, no
production system was touched. This report says what was verified, what is
blocked and why, and gives the exact commands and the cutover plan so the work
can proceed the moment access exists.

Commit under test: `911f35d` (`feature/execution-07-premium-web`).
Local rehearsal: the Execution 09 stack (Compose project `oryx-exec09`) no
longer exists — this session's sandbox is a fresh container with no Docker
daemon, so even the local stack could not be re-inspected. That is a change in
this environment, not a regression in the repository.

---

## 1. Why STEP 1 is blocked

Execution 10 is about **a server that already exists**. Every instruction —
inspect the OS, back up the database, find PM2, read nginx, list PostgreSQL
databases, check the certificates — needs a shell on that host. This
environment does not have one, and no credentials for it were provided.

Verified, not assumed:

| Capability | Result | Evidence |
|---|---|---|
| SSH client binary | **absent** | `which ssh scp rsync` → exit 1, no output |
| SSH private keys | **absent** | `~/.ssh/` does not exist |
| SSH config / known_hosts | **absent** | neither file exists |
| ssh-agent / `ssh-add` | **absent** | `ssh-add: command not found` |
| Server host, IP or user in env | **none** | no `DEPLOY_*`, `SSH_*`, `HOST`-shaped variable beyond the container's own |
| Server details in the repo | **none** | grep for IPs, `root@`, `ssh `, `pm2`, hostnames found only `example.com`-style placeholders and `*.oryx.local` rehearsal names |
| Deploy secrets in the repo | **not readable** | `actions/secrets` and `actions/variables` both return `403 Resource not accessible by integration`; no `production` environment exists (only `github-pages`) |
| Server details in conversation history | **none** | the only IPv4 addresses present are private cluster DNS (`10.x`), `1.1.1.1` and `8.8.8.8`; the only `ssh` string is the literal `ssh username@hostname` from a skill document |
| Docker daemon (for a local rehearsal) | **absent** | `/var/run/docker.sock` does not exist |

`.github/workflows/deploy.yml` expects four repository secrets — `DEPLOY_HOST`,
`DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH` — and its `production`
environment is not configured. Those secrets are unreadable to this integration
and their values are not in the working tree, which is correct: they are
secrets. But it means the host cannot be reached from here even indirectly.

**What I did not do, and will not do:** I did not invent a hostname, guess a
port, or describe a deployment I could not run. No staging environment is
claimed. No backup is claimed. No staging URL is claimed. Nothing was switched,
replaced, merged or cut over.

---

## 2. STEP 1 — read-only inspection, ready to run

Because the inspection itself cannot be run from here, it is packaged as a
script for the operator to run **on the target host**. It is strictly read-only:
it queries, it never writes, installs, restarts, pulls, prunes, migrates or
seeds.

```bash
# on the existing server
sudo bash deploy/scripts/inspect-server.sh > /tmp/oryx-server-audit.txt 2>&1
```

`deploy/scripts/inspect-server.sh` (added in this execution) covers all ten
STEP 1 questions:

1. **OS and resources** — `/etc/os-release`, kernel, uptime, CPU, memory, swap,
   disk by filesystem, inodes, largest directories.
2. **Existing ORYX applications** — likely roots (`/srv/oryx`, `/opt/oryx`,
   `/var/www/oryx`, …), a depth-limited `*oryx*` search, node/PM2/next
   processes with their working directories, and listening TCP ports with the
   owning process.
3. **PM2 and Docker** — `pm2 list` and `pm2 jlist`, `pm2 dump` locations, docker
   version, all containers, compose projects, networks, volumes, images, and
   matching systemd units.
4. **Nginx** — binary version, `nginx -t` (a test, not a reload), `sites-enabled`
   and `conf.d` listings, every `server_name`, `listen` and `proxy_pass`, and
   the full `nginx -T` for review.
5. **PostgreSQL** — service status, processes, the listener on 5432, `psql -l`,
   database sizes, and whether `_prisma_migrations` exists (this is what says
   whether a schema is already managed by Prisma).
6. **Domains and DNS** — FQDN, host IPs, resolvers, public IP, forward lookups
   for the candidate hostnames, and certbot renewal config.
7. **SSL certificates** — certificate files on disk, subject/issuer/expiry for
   each `fullchain.pem`, `certbot certificates`, and a read-only TLS handshake.
8. **Current versions** — git HEAD, tag and dirty state for every ORYX checkout,
   `package.json` name/version, and running image tags.
9. **Uploads and persistent data** — media/upload roots with sizes, docker
   volume mountpoints, existing `oryx-*.dump` files, existing backup
   directories, and free space where new backups would go.
10. **Environment files** — **paths, sizes, modes, owners and a key count only,
    never values**, so no production secret is exposed in the audit output.

The script needs no arguments and tolerates missing tools; each section prints a
skip note instead of aborting, so a partial audit is still produced. Sections
that need root say so and are skipped cleanly without root.

---

## 3. STEP 2 — protect existing production (plan, not performed)

Not performed, because there is nothing here to back up and no host to reach.
The commands below are the ones to run **before** any change, in this order.
They use the repository's own scripts, which already verify what they produce.

```bash
# 0. record what is running now — the rollback target
docker ps --format '{{.Names}}\t{{.Image}}' | tee /tmp/oryx-before-containers.txt
pm2 list | tee /tmp/oryx-before-pm2.txt
$SUDO nginx -T > /tmp/oryx-before-nginx.conf 2>&1
$SUDO cp -a /etc/nginx /tmp/oryx-before-nginx-tree        # config, verbatim

# 1. database — the repository's backup.sh writes, then verifies with
#    pg_restore --list, and refuses to report success on an unreadable dump
ORYX_BACKUP_DIR=/srv/backups deploy/scripts/backup.sh

# 2. uploads / media — whatever section 9 of the audit reported as the media root
$SUDO tar -czf /srv/backups/oryx-media-$(date -u +%Y%m%dT%H%M%SZ).tgz -C <media-root> .

# 3. environment files — copy, never overwrite
$SUDO cp -a <deploy-root>/.env.production /srv/backups/oryx-env-$(date -u +%Y%m%dT%H%M%SZ)

# 4. prove the backups are readable before trusting them
$SUDO tar -tzf /srv/backups/oryx-media-*.tgz | head
deploy/scripts/backup.sh    # a second run is harmless; it verifies again
```

**Prohibitions honoured:** no `prisma migrate reset` was run or planned; no
production `.env` was read, written or overwritten; no existing data was deleted
or reset; no destructive migration is proposed.

---

## 4. STEP 3 — isolated staging (plan, not performed; isolation defect found and fixed)

The intent is to run the current commit on the existing server **without
disturbing the running dashboards**. While validating the isolation offline, a
real defect in the shipped compose file was found and fixed. It is described
first, because it changes the staging procedure.

### 4.1 The defect — `--env-file` does not isolate the API container

`deploy/docker-compose.production.yml` gave the `api` service a hard-coded
`env_file: [../.env.production]`. Compose treats `--env-file` and a service's
`env_file:` as two different mechanisms:

- `--env-file` only interpolates `${...}` references **inside the compose
  file**.
- `env_file:` injects the file's keys **directly into the container**, and it is
  overridden only by an explicit `environment:` entry for the same key.

The `api` service overrides just three keys (`NODE_ENV`, `DATABASE_URL`,
`MEDIA_ROOT`). Everything else came from `.env.production`. Resolving the stack
with `--env-file .env.staging` therefore produced an API container holding the
**production** values — measured, not assumed:

```
api.JWT_ACCESS_SECRET   = <production value, not staging>
api.MFA_ENCRYPTION_KEY  = <production value, not staging>
api.POSTGRES_PASSWORD   = <production value, not staging>
```

That is 49 keys, four of them secrets, and it means a "staging" stack would
have signed sessions with the production key and accepted production MFA
enrolments. It did **not** touch the production database, because
`DATABASE_URL` is one of the three keys the service overrides — but it is a
serious isolation failure and it was on the path to STEP 3.

### 4.2 The fix

The env-file path is now configurable, defaulting to production so the
documented production command is unchanged:

```yaml
    env_file:
      - "${ORYX_API_ENV_FILE:-../.env.production}"
```

Verified with `docker compose config` (which needs no daemon):

| Stack | `JWT_ACCESS_SECRET` resolved to | Result |
|---|---|---|
| Production (`--env-file .env.production`, var unset) | the production value | unchanged |
| Staging (`--env-file .env.staging`, `ORYX_API_ENV_FILE=../.env.staging`) | the staging value | isolated |

`ORYX_API_ENV_FILE` is documented in `deploy/env/production.env.example`.

### 4.3 The regression guard — `deploy/scripts/verify-staging-isolation.sh`

A read-only checker that resolves both stacks and asserts they share no project
name, no published port, no persistent volume, no sensitive value and no
database. It prints no secret value. It is proven non-vacuous: it **passes** on
the fixed compose file and **fails** on the original one, naming exactly the
leaking keys.

```bash
deploy/scripts/verify-staging-isolation.sh .env.staging
```

Run this **before** starting a staging stack. Two early versions of the checker
were wrong and were corrected — it first compared declared volume keys (which
are identical by design; compose prefixes the project name at runtime) and
flagged empty unconfigured adapters as leaks. Both were false positives; the
final version compares resolved volume names and skips empty values.

### 4.4 Isolation levers

The isolation levers, all of which must differ from the live deployment:

| Resource | Live (example) | Staging (must differ) |
|---|---|---|
| Compose project name | `oryx` | `oryx-staging` |
| Edge ports | `80` / `443` | `8080` / `8443` (`EDGE_HTTP_PORT`, `EDGE_HTTPS_PORT`) |
| Database | `oryx_production` | a separate database, e.g. `oryx_staging` |
| Postgres data | `oryx_postgres-data` | `oryx-staging_postgres-data` (compose prefixes the project name, so this is automatic) |
| Media | `oryx_media-data` | `oryx-staging_media-data` (automatic) |
| API env file | `../.env.production` | `ORYX_API_ENV_FILE=../.env.staging` |
| Secrets | production values | freshly generated, never shared |
| Hostnames | `www.*` / `admin.*` | `staging.www.*` / `staging.admin.*` |

```bash
# staging env: generated secrets, staging ports, staging hosts, separate database
cp deploy/env/production.env.example .env.staging
# ... set ORYX_ADMIN_HOST/ORYX_CUSTOMER_HOST to staging names,
#     EDGE_HTTP_PORT=8080 EDGE_HTTPS_PORT=8443,
#     POSTGRES_DB=oryx_staging, fresh secrets for JWT_* and MFA_ENCRYPTION_KEY,
#     and ORYX_API_ENV_FILE=../.env.staging

# prove the isolation before starting anything
deploy/scripts/verify-staging-isolation.sh .env.staging

# build and start under a separate project name — the live stack is untouched
ORYX_IMAGE_TAG=<commit> \
  docker compose -p oryx-staging \
    -f deploy/docker-compose.production.yml --env-file .env.staging \
    up -d --build
```

Bahrain defaults come from the shared package (`DEFAULT_COUNTRY_CODE='BH'`,
`DEFAULT_TIMEZONE='Asia/Bahrain'`, `DEFAULT_CURRENCY='BHD'` at scale 3), and
`NEXT_PUBLIC_DEFAULT_LOCALE=ar`, `NEXT_PUBLIC_DEFAULT_THEME=light` from the env
template. MFA is set with `MFA_REQUIRE_SUPER_ADMIN=true`; the Execution 09 fix
means the owner can still enrol through the four bootstrap routes before every
other platform route starts refusing.

HTTPS for staging: either a second certificate for the staging hostnames, or the
rehearsal self-signed pair, **never** the production private key.

---

## 5. STEP 4 — real workflows to test (plan, not performed)

These are the workflows to exercise on staging, each with the thing that proves
it actually persisted:

| Workflow | What proves it worked |
|---|---|
| Customer registration | the row exists in `customer` after a fresh login, not just a `201` |
| Customer login | access token issued, refresh cookie `HttpOnly`, `oryx_csrf` echoed on the next unsafe call |
| Vehicle garage | vehicle persists and is visible only to its owner |
| Service booking | booking confirmed; the same resource + slot fails on a second attempt (the DB constraint, not a UI rule) |
| Provider operations | a provider admin who is **not** linked to a provider cannot read that provider's work |
| Administration | create a tenant, assign a plan, create a branch and a user; a tenant with no plan has zero capacity |
| CMS image update | upload an image, confirm it is served from the media volume, confirm it survives a container restart |
| Database persistence | restart the stack; every row above is still there |
| Production-safe init | `production:init` runs clean, is idempotent on a second run, and does not overwrite an existing owner password |
| Rollback | `deploy/scripts/deploy.sh` records the previous tag and restores it when the health probe fails |

---

## 6. STEP 5 — report

### 6.1 Existing-server audit

**Not produced — blocked.** The script that produces it is in §2. No claim is
made about the OS, the resources, the PM2 processes, the nginx config, the
databases, the domains, the certificates, the versions or the uploads on the
existing server, because none of it was observed.

### 6.2 Backup confirmation

**None.** No backup was taken, because there is no database to reach from here.
No claim of a verified backup is made.

### 6.3 Staging URLs

**None.** No staging environment exists. No URL is claimed.

### 6.4 Actual service health

Only the **local rehearsal** from Execution 09 can be reported, and even that
stack no longer exists in this sandbox. The last verified state, at `911f35d`,
was: 5/5 containers healthy, API `{"status":"ok","service":"oryx-api","version":"0.1.0","database":"up"}`,
API integration 311/311, shared 152/152, mobile 20/20, CI green on all six
checks. That is a record of a past run, not a live health reading.

### 6.5 Test results

| Suite | Result |
|---|---|
| API integration | 311 / 311 |
| Shared unit | 152 / 152 |
| Mobile unit | 20 / 20 |
| Execution 09 suites | 9 / 9 |
| Typecheck / lint | clean |
| CI on `911f35d` | all six checks pass |

These ran in the Execution 09 session. They were **not** re-run against a
staging host, because there is no staging host.

### 6.6 Remaining blockers

1. **No server access** — this is the blocker. Without SSH access to the
   existing server, STEPS 1–4 cannot be performed at all. Needed: host, port,
   user and either a private key or a password, plus permission to run docker on
   that host.
2. **No readable deploy secrets** — `DEPLOY_HOST`, `DEPLOY_USER`,
   `DEPLOY_SSH_KEY`, `DEPLOY_PATH` are not readable to this integration and the
   `production` environment is not configured. Either configure the environment
   or provide access directly.
3. **No staging DNS** — staging hostnames must resolve, or staging is tested by
   `Host` header / `--resolve` only.
4. **No staging certificate** — a real cert or the rehearsal self-signed pair.
5. **Resource headroom unknown** — whether the host can run a second stack
   alongside the live one (CPU, RAM, disk) is exactly what §1 of the audit
   answers. If headroom is tight, staging must run on a different machine or
   during a quiet window.

### 6.7 Production cutover plan (not executed)

Only after staging passes, and only with explicit owner approval:

1. Confirm a fresh verified database backup and a media archive exist (§3).
2. Record the live image tags and the live nginx tree (§3, step 0).
3. `deploy/scripts/deploy.sh <tag>` — it takes the backup, builds, runs the
   migration job, waits on the health probe, and **automatically rolls back to
   the recorded tag** if the probe fails.
4. Run `deploy/scripts/health-check.sh` with the production hosts.
5. Verify the real workflows from §5 against production.
6. Switch DNS only if the hostnames change. If they do not, there is no DNS step.

### 6.8 Rollback

- **Application:** `deploy/scripts/deploy.sh` restores the previous image tag
  automatically on a failed health probe; the tag is also recorded in step 0.
- **Database:** the schema is **not** reverted by `deploy.sh`, by design —
  guessing a down migration is worse than stopping. Restore the §3 dump into a
  separate database with `deploy/scripts/restore.sh`, verify it, then promote it
  deliberately.
- **Config:** the nginx tree copied in step 0 is the exact previous state.
- **Staging:** tearing staging down is `docker compose -p oryx-staging down`.
  Because it uses its own project name, its volumes are separate and the live
  stack is unaffected.

---

## 7. Honest status

- **No server was inspected, no backup was taken, no staging environment was
  created, no workflow was tested on staging, and no production system was
  changed.** Every one of those is blocked on access.
- Nothing was switched, replaced, merged or cut over. No PR was merged.
- The approved website was not redesigned.
- **One real defect was found and fixed while validating STEP 3 offline:** the
  compose file's hard-coded `env_file: [../.env.production]` meant a staging
  stack would have received the production JWT, refresh, MFA and database
  secrets. The fix is backward compatible (production is unchanged) and is
  guarded by a new, non-vacuous checker. This is a genuine improvement to the
  deployment package, not a staging run — no container was started.
- What this execution actually delivered: the diagnosis of the access blocker
  with evidence, a read-only inspection script that answers all of STEP 1, the
  verified backup and isolation plans, the staging-isolation defect fix and its
  regression guard, and the cutover and rollback procedures — so the moment
  access is provided, STEPS 1–4 can run without further design.

_This report was written by an AI agent (OpenHands) on behalf of the repository owner._
