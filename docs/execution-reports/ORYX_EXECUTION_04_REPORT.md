# ORYX — Execution 04 Report: Customer Platform, Automotive Marketplace & Mobile Applications

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
| Execution 04 branch before this session | did not exist; created from the latest verified `main` |

The branch was created from `main` @ `20dd8b4` (the Execution 03 merge commit).
No prior work was overwritten, reset or force-pushed, and Executions 01–03 were
not restarted.

## 2. Branch and commit

| Item | Value |
| --- | --- |
| Branch | `feature/execution-04-customer-marketplace-mobile` |
| Base | `main` @ `20dd8b471103d138011dd8be8381027a586d85aa` |
| Head at time of writing | see the PR; the branch is not force-pushed |

## 3. Baseline verification (before this session's changes)

- `pnpm --filter @oryx/shared test` — 85 passed.
- `pnpm --filter @oryx/api test:e2e` — 196 passed (7 suites).
- `pnpm --filter @oryx/mobile test` — 14 passed.
- All Execution 01–03 correctness invariants (balanced ledger, atomic and
  idempotent posting, row-locked inventory, tenant isolation, payroll snapshot)
  are preserved and still asserted by the existing suites.

One regression was found and fixed during recovery: the new mobile workspace
pinned React `19.1.0` while the web apps use `19.3.0`. Under the repository's
`node-linker=hoisted` install this hoisted `react@19.1.0` next to
`react-dom@19.3.0`, and `next build` failed at prerender with
`Cannot read properties of null (reading 'useRef')`. The mobile app was aligned
to React `19.3.0` (react-native's peer range is `^19.1.0`, so this is in range)
and the React type overrides were aligned to `19.3.0`. Admin, customer and mobile
now resolve one React version.

## 4. What Execution 04 delivers

### A. Customer identity

Consumer registration and login are a **separate identity plane** from staff
auth: a consumer principal carries `audience: customer` and a staff token is
rejected on a consumer route and vice versa (asserted). Delivered:

- registration, login, refresh, logout, logout-all and session listing;
- password reset by single-use, hashed, expiring token (the token is never the
  password, and an unknown email does not reveal whether the account exists);
- optional TOTP MFA for consumers (enrol, confirm, disable);
- customer profile;
- multiple vehicles per customer with VIN uniqueness and per-owner isolation;
- customer addresses (create, list, update, delete);
- notification preferences;
- privacy controls: data-export request recorded as a pending request rather
  than exporting inline, plus a deletion request.

### B. Customer website (`apps/customer`)

A real Next.js customer site, database-backed end to end: homepage, service
categories and discovery, provider directory and profiles, vehicle garage,
inspection and maintenance booking, service requests, quotations and approvals,
booking management, service tracking, invoices and payment history, vehicle
service history, support and a customer dashboard.

### C. Automotive marketplace

Provider onboarding by public application, platform approval with commission,
provider profiles, service listings and pricing, provider availability, customer
service requests, provider acceptance/rejection, booking assignment, service
completion, reviews and ratings (gated on completed work, range-validated,
moderated before publication), complaints/disputes, marketplace commissions and
provider settlement records that post to the shared ledger.

### D. Booking engine

One reusable scheduling engine shared by inspections, workshops and providers:
bookable resources with working hours and exceptions, service duration, slot
generation inside opening hours, confirmation, rescheduling, cancellation and
reminder state. Double booking is prevented with a database-backed uniqueness
constraint plus a transactional row lock; a cancelled slot is released for reuse
(both asserted).

### E. Service integration

Customer workflows are wired to the Execution 02/03 modules rather than
duplicating them:

- inspection booking → inspection report → invoice;
- maintenance booking → estimate → approval → workshop job card → spare-parts
  consumption through the shared stock ledger → invoice;
- marketplace request → provider assignment → service completion → settlement.

Invoices go through `SalesService.issueInvoice`; parts go through
`InventoryService.recordMovement`; every posting goes through
`AccountingPostingService.postJournal`. No second ledger was created.

### F. Payments

Cash, card-terminal and bank-transfer records, an online-gateway adapter
architecture, payment intents, verified confirmations, refunds, idempotent
webhooks (signature verified; a redelivery is deduplicated), reconciliation and
commissions/settlements. BenefitPay is prepared as a `REDIRECT` adapter: with no
merchant credentials in the repository it reports itself **unconfigured** and
creates no transaction, and an unconfigured online gateway leaves the intent
unpaid rather than pretending money was collected (asserted). No live gateway is
claimed operational.

### G. Notifications

In-app notifications are persisted and functional. Email, SMS, WhatsApp Business
and push are implemented as adapters that report themselves **configured** only
when their provider credentials are present; with no credentials they transmit
nothing and record the reason. Templates and per-customer preferences are stored,
and delivery attempts are tracked with retries. Configured providers and
integrations still awaiting credentials are distinguished in the UI.

### H. Provider portal

A real provider portal for profile, services, bookings, work orders,
availability, commissions, settlements, reviews and reports. Provider scope comes
from membership, not merely permission: a peer administrator who is not linked to
a provider cannot read or act on that provider's work (asserted).

### I. Mobile applications (`apps/mobile`)

A React Native / Expo (SDK 54, expo-router) customer application consuming the
**same** backend APIs as the website: onboarding, authentication, dashboard,
vehicle garage, service discovery, provider profiles, inspection and maintenance
bookings, booking tracking, service history, invoices and payment history,
notifications, support, Arabic RTL / English LTR, dark and light themes, and
secure credential storage through `expo-secure-store`. See section 8 for build
results.

## 5. Database migrations

Three additive migrations:

| Migration | Contents |
| --- | --- |
| `20261015055303_execution_04_customer_marketplace_mobile` | Consumer accounts, sessions, reset tokens, vehicles, addresses, privacy and preference tables; bookable resources, working hours, exceptions and bookings; provider listings, availability, requests, reviews and settlements; payment intents, transactions, refunds, reconciliation, webhook events; notification state |
| `20261015055400_execution_04_booking_concurrency` | The uniqueness constraint and index that make double booking impossible |
| `20261015070252_execution_04_journal_sources_and_notification_state` | New journal source types and notification delivery state |

Every tenant-owned table carries `companyId`. Money is integer minor units;
percentages are basis points. No Execution 01–03 table was altered destructively;
only new relations were added.

## 6. API endpoints

New routes under `/api/v1`:

- `/customer/auth` — 14 routes (register, login, refresh, logout, logout-all,
  sessions, password reset, MFA, profile);
- `/customer` — addresses, privacy, data export/deletion, notification
  preferences, vehicles and vehicle history;
- `/customer-platform` — the staff-facing console (summary, accounts, link,
  status);
- `/bookings` — availability, list, calendar, create, confirm, reschedule,
  cancel, start, complete, no-show and resource/hours/exceptions management;
- `/customer/bookings` — the consumer-facing subset (availability, create, list,
  cancel);
- `/customer/payments` — consumer payment history;
- `/payments` — provider readiness, intents (create/list/get), refunds, refund
  approval, reconciliation, and the idempotent `/payments/webhooks/:provider`
  endpoint;
- `/automotive` — provider applications, provider decisions, listings, requests,
  assignments, completion, reviews and moderation, complaints and settlements.

Every route uses the existing `@RequireModule` + permission guards and is
company-scoped server-side. The full per-route permission table is in
`docs/api/API_REFERENCE.md`.

## 7. Functional cross-module workflows verified

Each is asserted by the integration suite against the real HTTP surface and the
seeded database:

1. **Customer identity:** register → login → a staff token is refused on a
   consumer route and a consumer token on a staff route.
2. **Ownership:** customer A cannot read customer B's vehicle or its history.
3. **Booking concurrency:** two bookings for the same resource and time — the
   second is refused; a cancelled slot becomes bookable again.
4. **Payment idempotency:** a repeated idempotency key returns the original
   intent and posts exactly one ledger entry; a repeated signed webhook is
   processed once.
5. **Honest gateway:** an unconfigured online gateway leaves the intent unpaid; a
   bank transfer stays awaiting confirmation until an operator confirms it.
6. **Refunds:** a settled payment refunds and mirrors the entry; a refund larger
   than the amount collected is refused.
7. **Marketplace:** application → approval with commission → listing → request →
   assignment → completion → commission → settlement posted to the ledger.
8. **Reviews:** a review before completion is refused; an out-of-range rating is
   refused; a pending review stays out of the public profile until published,
   after which the real average rating is exposed.
9. **Provider isolation:** a provider cannot read or act on another provider's
   work.

## 8. Mobile build results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm --filter @oryx/mobile typecheck` | passed |
| Unit tests | `pnpm --filter @oryx/mobile test` | **14 passed** |
| Android bundle | `expo export --platform android` | passed (Hermes bytecode bundle emitted) |
| iOS bundle | `expo export --platform ios` | passed (Hermes bytecode bundle emitted) |

Bundling runs Metro over every screen for both platforms, which is real proof
that the app resolves and links without needing Xcode or the Android SDK. The
repository also ships `expo prebuild` scripts (`prebuild:android`,
`prebuild:ios`) and `expo run:*` scripts for producing native projects locally.
**No app-store publication is claimed** — nothing has been distributed, and no
store submission was performed.

## 9. Test results

| Suite | Command | Result |
| --- | --- | --- |
| Shared unit tests | `pnpm --filter @oryx/shared test` | **85 passed** |
| API integration (e2e) | `pnpm --filter @oryx/api test:e2e` | **196 passed** (7 suites) |
| Mobile unit tests | `pnpm --filter @oryx/mobile test` | **14 passed** |
| Browser acceptance (Playwright) | `pnpm --filter @oryx/admin test:ui` | **113 passed** (incl. 5 new E04 UI tests) |

Total: **408 automated tests passing.**

The new Execution 04 coverage is 64 API integration tests in
`apps/api/test/execution04.e2e-spec.ts` plus 5 browser tests in
`apps/admin/e2e/execution04.spec.ts`. No existing test was removed or weakened;
the Execution 01–03 suites still pass unchanged.

## 10. GitHub Actions CI

The existing CI workflow runs the shared unit tests, the API integration suite
and the full Playwright suite against a PostgreSQL 17 service. Execution 04 adds
a mobile stage to the `quality` job — typecheck, lint, unit tests and an Android
and iOS bundle — and the Execution 04 branch is on the `push` trigger. CI status
is shown on the PR; all jobs must pass on the final commit.

## 11. Screenshots

Captured by the Playwright screenshot suite into
`docs/execution-reports/screenshots/`:

- `e04-customer-dark.png`
- `e04-bookings-dark.png`
- `e04-providers-dark.png`
- `e04-payments-dark.png`

The approved navy/gold design, right-side Arabic navigation, image-led module
cards, responsive layout and both themes are preserved and extended to the new
screens. The official logo is still absent from the repository; the neutral
monogram placeholder remains and no brand mark was invented. Approved dashboard
photography is likewise still not supplied; generated vector tile art is used.

## 12. Migration and rollback notes

- **Apply:** `pnpm db:migrate`. The migrations are additive and safe to apply to a
  database that already has Executions 01–03.
- **Seed:** `pnpm db:seed` is idempotent and adds the Execution 04 modules, their
  plan entitlements and an approved provider per active company.
- **Rollback:** dropping the Execution 04 objects restores the Execution 03
  schema. No Execution 01–03 column or row is modified, so a rollback cannot lose
  prior data.

## 13. Remaining external integrations

These are **not** operational and are not claimed to be:

- **BenefitPay** — adapter written, credentials absent. Needs
  `BENEFITPAY_MERCHANT_ID`, `BENEFITPAY_API_KEY`, `BENEFITPAY_API_SECRET` and
  `BENEFITPAY_BASE_URL`, plus a verified sandbox transaction, before any claim.
- **Card online gateway** — adapter written, no gateway configured.
- **Email / SMS / WhatsApp / push** — adapters written; each reports unconfigured
  until its provider credentials are supplied. In-app notifications work today.
- **Mobile distribution** — build configuration is present and bundles pass; no
  Apple/Google developer account, signing certificate or store listing exists.

## 14. Known limitations

- **Payments do not move money.** Cash, card-terminal and bank-transfer are
  recorded and posted to the ledger; no live gateway charges a card.
- **No jurisdiction compliance.** Payroll (Execution 03) still does not implement
  Bahrain labour law, social insurance or WPS.
- **Inspection is not accreditation.** The inspection workflow remains an internal
  ORYX process, not government certification.
- **Marketplace settlement is administrative.** Commissions and settlement
  records post to the ledger; no money is disbursed to providers.
- **Mobile is not published.** Android and iOS bundles build; nothing is in a
  store.
- **Admin lint is a pre-existing gap.** `apps/admin` has no ESLint configuration,
  so `pnpm -r lint` cannot run it; CI does not run admin lint. This predates
  Execution 04 and was not changed.

## 15. Pull request

The Execution 04 pull request targets `main` and is opened for owner review.
**It is not merged and nothing is deployed.**
