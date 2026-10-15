# ORYX — Execution 05 Report: Platform Completion & External Integrations Center

Status: **implemented, tested and ready for owner review**. Nothing is merged
and nothing is deployed.

## 1. Recovered GitHub state

GitHub was the source of truth.

| Item | Value |
| --- | --- |
| Repository | `mohammadaljallad079-rgb/oryx` |
| PR #1 (`feature/execution-01-super-admin-foundation`) | **merged** into `main` |
| PR #2 (`feature/execution-02-erp-core`) | **merged** into `main` |
| PR #3 (`feature/execution-03-hr-crm-automotive`) | **merged** into `main` at `20dd8b471103d138011dd8be8381027a586d85aa` |
| PR #4 (`feature/execution-04-customer-marketplace-mobile`) | **merged** into `main` at `33ee5579644d88ae6a1763e7d778ba944831912a` |
| Execution 05 branch before this session | did not exist; created from the latest verified `main` |

Executions 01–04 were not restarted. No existing work was overwritten, reset or
force-pushed.

## 2. Branch and commit

| Item | Value |
| --- | --- |
| Branch | `feature/execution-05-platform-completion` |
| Base | `main` @ `33ee5579644d88ae6a1763e7d778ba944831912a` (the Execution 04 merge) |
| Head | `5bc4ba8` |
| Pull request | [#5](https://github.com/mohammadaljallad079-rgb/oryx/pull/5) (draft, open) |

## 3. Baseline verification (before this session's changes)

- `pnpm --filter @oryx/shared test` — 85 passed.
- `pnpm --filter @oryx/api test:e2e` — 196 passed (7 suites).
- `pnpm --filter @oryx/mobile test` — 14 passed.
- `pnpm --filter @oryx/admin test:ui` — 108 passed (Execution 04 baseline).

All Execution 01–04 invariants (balanced ledger, atomic and idempotent posting,
row-locked inventory, tenant isolation, payroll snapshot, booking concurrency,
payment idempotency, refresh-token cookie transport) are preserved and still
asserted by the existing suites.

## 4. What Execution 05 adds

### 4.1 External Integrations Center (the core of this execution)

A single, database-backed catalogue of every external provider the platform
depends on, with the honest status of each. This replaces scattered
configuration with one place an operator can inspect before a launch.

Providers are declared once in `packages/shared/src/integrations.ts` and read by
the API, the admin UI and the customer capabilities endpoint, so there is no
second list to drift.

**The honesty rule.** A provider is `OPERATIONAL` only when it genuinely works:

| State | Meaning |
| --- | --- |
| `OPERATIONAL` | The adapter performs real work and nothing blocks it. |
| `CONFIGURED` | Every required credential is present, but no call has been verified yet. |
| `AWAITING_CREDENTIALS` | One or more required credentials are missing. |
| `DISABLED` | An operator deliberately turned it off. |
| `ERROR` | The last connection test failed. |

Only `OPERATIONAL` is presented as usable, and the customer-facing capabilities
endpoint advertises only `OPERATIONAL` providers. A gateway that holds
credentials but has never completed a verified call is **not** advertised and
**not** shown as working — it is `CONFIGURED`. This is the central invariant of
the execution and is asserted in both the API and browser suites.

The catalogue covers 20 providers across six categories (payments, messaging,
cloud and documents, government and identity, accounting, logistics), including
BenefitPay, the online card gateway, cash and card terminals, email, SMS,
WhatsApp Business, push, object storage, e-invoicing and identity verification.

Internal providers (`CASH`, `CARD_TERMINAL`) are marked `IMPLEMENTED`: they need
no credentials and work from internal records, so they are `OPERATIONAL` from
the start. External providers are marked `ADAPTER_ONLY`: the adapter exists and
the vendor call is deliberately not implemented, so the verification path
reports that plainly instead of claiming success.

### 4.2 Credential handling

- Values are sealed at rest with AES-256-GCM through the existing `SecretCipher`
  (`MFA_ENCRYPTION_KEY`); the plaintext is never returned by any endpoint.
- A non-secret provider identifier keeps a last-four hint so an operator can tell
  which key is installed without revealing it.
- Company-scoped credentials take precedence over platform-scoped ones, so a
  tenant can bring its own merchant account without changing the platform row.
- `.env` values count exactly like stored ones, because the adapter reads the
  environment at call time.
- Every credential change is written to the audit trail **by key, never by
  value**.

### 4.3 Enablement guard

A provider cannot be enabled while a required credential is missing. The API
refuses with `400` and names the missing keys; the UI disables the control
outright so an operator is never offered an action the API would reject.

### 4.4 Verification and audit

`POST /integrations/:key/verify` runs a real connection test, records a
`IntegrationCheck` row with status, message and duration, and updates the
provider's verification status. Changing a credential invalidates a previous
verification, so a stale "verified" badge cannot survive a credential rotation.

## 5. Database migrations

One migration was added:

`packages/database/prisma/migrations/20261015181943_execution_05_integrations_center/migration.sql`

| Object | Purpose |
| --- | --- |
| `IntegrationScope` enum | `PLATFORM` \| `COMPANY` |
| `IntegrationVerificationStatus` enum | `UNVERIFIED` \| `VERIFIED` \| `FAILED` \| `INCOMPLETE` |
| `IntegrationProvider` | One configuration row per provider and scope, with state and verification columns |
| `IntegrationCredential` | Sealed credential values, unique per provider and key |
| `IntegrationCheck` | Append-only connection-test history |
| `IntegrationProvider_platform_key` | **Partial** unique index on `providerKey WHERE companyId IS NULL` |

The partial index matters: Postgres treats `NULL` as distinct in a unique index,
so the composite `(providerKey, scope, companyId)` constraint does **not**
prevent two platform-scoped rows for the same provider. The partial index closes
that gap and is why the service uses a `findFirst` + create rather than a Prisma
`upsert` — Prisma's generated compound-unique input does not accept `null`.

All 12 migrations apply cleanly and `prisma migrate status` reports the schema
is up to date.

## 6. API endpoints

All routes are under `/api/v1`.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/integrations` | `platform.integration.read` | Catalogue with derived state, summary counts and the production blockers |
| `GET` | `/integrations/:key` | `platform.integration.read` | One provider with its masked credential fields and check history |
| `PUT` | `/integrations/:key/credentials` | `platform.integration.manage` | Store or remove credentials; empty value removes |
| `PUT` | `/integrations/:key/enabled` | `platform.integration.manage` | Enable or disable, with an optional reason |
| `POST` | `/integrations/:key/verify` | `platform.integration.verify` | Run a connection test and record the result |
| `GET` | `/customer/capabilities` | customer session | Which payment methods and channels a signed-in customer may actually choose |

Three new permissions were added: `platform.integration.read`,
`platform.integration.manage` and `platform.integration.verify`. A company
principal is denied every integration route — the centre is platform governance.

## 7. Admin interface

New route: `/integrations` (External Integrations Center), added to the Website
& Application Management navigation group.

- Summary tiles: total, operational, configured, awaiting credentials, disabled,
  error.
- A plain-language notice stating that only Operational providers are usable,
  and the list of providers currently blocking production readiness.
- A provider table with category, credential completeness and derived state. Only
  Operational renders green; Configured renders amber.
- A provider dialog with the credential form (one input per catalogue
  credential, secrets masked), the activation requirement, the last check result
  and the full connection-test history.

Fully localised in Arabic (RTL) and English (LTR), in both dark and light
themes, responsive down to mobile width.

## 8. Screenshots

Captured from the running application into
`docs/execution-reports/screenshots/`:

| File | Description |
| --- | --- |
| `e05-integrations-en-dark.png` | Integrations Center, English, dark |
| `e05-integrations-ar-dark.png` | Integrations Center, Arabic RTL, dark |
| `e05-integrations-en-light.png` | Integrations Center, English, light |
| `e05-integration-dialog-en-light.png` | Provider dialog with credential form and check history |
| `e05-integrations-mobile-en-light.png` | Mobile width (420px) |

## 9. Test results

| Suite | Result |
| --- | --- |
| `@oryx/shared` (unit) | **93 passed** (85 baseline + 8 new catalogue-invariant tests) |
| `@oryx/api` (integration) | **218 passed**, 8 suites (196 baseline + 22 new Execution 05 tests) |
| `@oryx/mobile` (unit) | **14 passed** |
| `@oryx/admin` (browser) | **119 passed**, 1 flaky (see below) |

New suites:

- `apps/api/test/execution05.e2e-spec.ts` — 22 tests covering the catalogue,
  derived state, credential sealing and removal, the enablement guard,
  verification, authorization, the audit trail and customer capability
  advertisement.
- `packages/shared/test/integrations.test.ts` — 8 tests asserting catalogue
  invariants (unique keys, known categories, both languages present,
  `configurable` exactly when credentials are declared, and that only
  `OPERATIONAL` counts as usable).
- `apps/admin/e2e/execution05.spec.ts` — 6 browser tests, including the two that
  matter most: an unconfigured gateway is never shown as operational, and a
  connection test on an unimplemented adapter reports "not implemented" rather
  than success.

The mobile suite was unaffected: the mobile app consumes the same backend and
needed no change for this execution.

### Flaky test (pre-existing, not a regression)

`auth-lifecycle.spec.ts › two tabs refreshing at once both stay usable` failed
once in the full run and **passes in isolation** (14/14 in the auth-lifecycle
suite). It races two simultaneous reloads against token rotation and is
timing-sensitive under a loaded machine. It is unrelated to Execution 05 and no
Execution 05 code touches the session path.

## 10. GitHub Actions

`ci.yml` was updated to:

- trigger on `feature/execution-05-platform-completion`;
- run `lint` for the admin and customer apps, which previously had no lint step
  in CI.

The lint scripts in `apps/admin`, `apps/customer` and `apps/mobile` were changed
from `next lint` (deprecated in Next 15 and interactive when no config exists,
which made `pnpm -r lint` hang) to `eslint . --max-warnings=0` against new flat
configs. `eslint` and `@eslint/eslintrc` were already in the lockfile, so
**`pnpm-lock.yaml` and the root `package.json` are unchanged** and
`pnpm install --frozen-lockfile` still succeeds.

All three CI jobs — typecheck and build, unit and API integration, browser
acceptance — pass on the final commit `5bc4ba8`.

### A CI failure that was worth having

The first CI run failed the browser job on the new Execution 05 test with a
login `403`, while the *same commit* passed the identical job on the pull-request
trigger. That split is the signature of a race, and it exposed two real defects
in the test plumbing:

1. **`apiToken`'s login fallback omitted the `x-oryx-csrf` header.** `signIn`
   has already established the refresh cookie, and `CsrfGuard` rejects any
   unsafe method that carries that cookie without a matching header — so the
   fallback could never succeed once a session existed. It now echoes the cookie
   exactly as the refresh call above it does.
2. **The test stored credentials through the page**, racing the page's own
   refresh rotation. It now seeds and clears them from Node in a cookie-less
   Playwright request context, so the request carries only the bearer token and
   no ambient cookie. The credentials are still written and removed through the
   real API, and a `finally` block guarantees removal so later tests still see
   `AWAITING_CREDENTIALS`.

A third, quieter bug surfaced while fixing the above: Playwright resolves a
leading-slash path against the `baseURL`'s **origin** and discards the path
prefix, which silently turned the login call into a `404`. The helper now builds
absolute URLs.

The fix is confirmed by the database: after the suite runs,
`IntegrationCredential` holds 0 rows and only the single default provider row
remains, so the cleanup genuinely works.

## 11. Remaining external integrations

No live third-party integration is operational, and none is claimed to be.
Every external provider is `ADAPTER_ONLY` and `AWAITING_CREDENTIALS` in a fresh
deployment. Activating any of them requires, in order:

1. credentials supplied by the owner (merchant agreement, API keys, webhook
   secrets);
2. storing them through the Integrations Center;
3. a successful verified transaction through `POST /integrations/:key/verify`.

| Integration | What the owner must supply |
| --- | --- |
| BenefitPay | Merchant agreement with the bank, merchant ID, API key, API secret, gateway base URL, webhook signing secret, and one verified sandbox transaction |
| Online card gateway | A chosen acquirer and its API key |
| Email | A provider API key, or an SMTP host |
| SMS | An account SID, auth token and sender ID |
| WhatsApp Business | A Meta business account, phone number ID, access token and webhook verify token |
| Push | An FCM service-account JSON and APNs key |
| Cloud storage | An S3-compatible endpoint, bucket and access keys |
| E-invoicing / identity | Government onboarding and credentials |

The adapter architecture, credential storage, enablement guard, verification
path and audit trail are complete and tested; only the vendor calls and the
owner-supplied credentials are outstanding.

## 12. Known limitations

- **No live gateway is operational.** BenefitPay and the card gateway are
  adapters with no vendor call implemented. `verify` reports "not implemented"
  by design rather than returning a false success.
- **The ORYX logo and approved photography are still not in the repository.**
  As reported in Executions 01–04, the UI uses a neutral monogram placeholder
  and generated vector art. No official brand mark was invented.
- **The one flaky browser test** noted in section 9 is pre-existing and
  unrelated to this execution.
- Execution 05 implements the Integrations Center and platform-completion
  surface. It does not add new ERP modules; the module catalogue was already
  fully implemented and DB-backed after Execution 03.

## 13. Pull request

[#5](https://github.com/mohammadaljallad079-rgb/oryx/pull/5) against `main`
from `feature/execution-05-platform-completion`, head `e68f45c`.

**Do not merge or deploy without owner approval.**
