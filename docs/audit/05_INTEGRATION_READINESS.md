# ORYX — Integration Readiness Audit

Audit date: 2026-10-16
Source of truth: `packages/shared/src/integrations.ts`

## Catalogue

`INTEGRATION_PROVIDERS` is declared once and feeds the API, the admin page and the
customer capabilities endpoint. The catalogue contains **8 providers**, not 20:

| Key | Category | Implementation | Configurable | Per-company | Credential fields |
|---|---|---|---|---|---|
| `BENEFITPAY` | PAYMENTS | ADAPTER_ONLY | yes | yes | 5 |
| `CARD_ONLINE` | PAYMENTS | ADAPTER_ONLY | yes | yes | 2 |
| `CASH` | PAYMENTS | IMPLEMENTED | no | no | 0 |
| `EMAIL` | MESSAGING | ADAPTER_ONLY | yes | yes | 3 |
| `SMS` | MESSAGING | ADAPTER_ONLY | yes | yes | 3 |
| `WHATSAPP` | MESSAGING | ADAPTER_ONLY | yes | yes | 2 |
| `PUSH` | MESSAGING | ADAPTER_ONLY | yes | yes | 2 |
| `IN_APP` | MESSAGING | IMPLEMENTED | no | no | 0 |

> **Documentation discrepancy (corrected 2026-10-16).** `AGENTS.md` described
> "a 20-provider catalogue". The code declares 8, and the guide now says 8 to
> match `packages/shared/src/integrations.ts`.

## State model

`deriveState` in `apps/api/src/integrations/integrations.service.ts` is the single
place that decides a provider's state. `AWAITING_CREDENTIALS` is checked **before**
a stored `verificationStatus` is trusted, so a gateway holding credentials that
have never produced a verified call is `CONFIGURED`, not `OPERATIONAL`.

| State | Meaning |
|---|---|
| `OPERATIONAL` | Works and is verified. The only state advertised to customers. |
| `CONFIGURED` | Credentials present, no verified call yet. |
| `AWAITING_CREDENTIALS` | One or more required credentials missing. |
| `NOT_STARTED` | No adapter behaviour. |
| `DISABLED` | Turned off. |
| `ERROR` | Last check failed. |

## Live state on staging

Verified in the browser at `/integrations` (Super Admin, Arabic RTL):

| State | Count | Providers |
|---|---|---|
| `OPERATIONAL` | 2 | Cash & card terminal, In-app notifications |
| `AWAITING_CREDENTIALS` | 6 | BenefitPay, Online card gateway, Email, SMS, WhatsApp, Push |

The two `OPERATIONAL` providers are the `IMPLEMENTED` internal ones, which need no
credentials. This is the correct reading: no external gateway is claimed to work.

## Credential handling

| Rule | Where it is enforced | Check |
|---|---|---|
| Reads return a `hint` only, never a value | integrations service read path | `execution05.e2e-spec.ts` |
| An empty value in `PUT /integrations/:key/credentials` deletes the row | update path | `execution05.e2e-spec.ts` |
| Changing a credential clears the verification | update path | `execution05.e2e-spec.ts` |
| Values are sealed with AES-256-GCM | credential sealing service | code review |
| Audit logs by credential key, never by value | `AuditService` call site | `execution05.e2e-spec.ts` |
| Enabling a provider with a missing required credential is refused | enablement guard | `execution05.e2e-spec.ts` |

## Customer capabilities endpoint

`GET /customer/capabilities` advertises only `OPERATIONAL` providers. With the
current staging state it advertises 2. The rule is not widened to make a screen
look better.

## Payment adapters

| Method | Behaviour | Verified by |
|---|---|---|
| `CASH` | Always configured; the receipt is the confirmation | `execution04.e2e-spec.ts` |
| `CARD_TERMINAL` | Always configured; the receipt is the confirmation | `execution04.e2e-spec.ts` |
| `BANK_TRANSFER` | Awaiting confirmation until an operator confirms | `execution04.e2e-spec.ts` |
| `BENEFITPAY` | Reports itself unconfigured without credentials; leaves the intent unpaid | `execution04.e2e-spec.ts` |
| `CARD_ONLINE` | Reports itself unconfigured without credentials; leaves the intent unpaid | `execution04.e2e-spec.ts` |

No path marks an intent paid without a verified provider confirmation.

## Database constraint

The `(providerKey, scope, companyId)` compound unique does not accept `null`, and
Postgres treats `NULL` as distinct, so a platform row is created with
`findFirst` + `create`. The `IntegrationProvider_platform_key` partial index,
hand-written in the migration and not expressible in the Prisma schema, is what
enforces one platform row per provider.

## Readiness summary

| Question | Answer |
|---|---|
| Is the catalogue declared once? | Yes — `INTEGRATION_PROVIDERS` |
| Are credentials sealed and never echoed? | Yes |
| Is the "operational" claim trustworthy? | Yes — `OPERATIONAL` requires a verified call |
| Can the owner enable an external gateway today? | No — the vendor calls are `ADAPTER_ONLY`, so `verify` reports "not implemented" |
| What is needed to go live with a gateway? | The merchant agreement and production credentials listed in each provider's `activationRequirement` |

## Blockers

1. **No external gateway is implemented.** Every external provider is
   `ADAPTER_ONLY`: the adapter exists but the vendor call is not implemented, so
   `verify` correctly reports "not implemented" rather than a success. This is by
   design, not a defect.
2. **No production credentials are present**, and none may be committed. A live
   gateway needs credentials supplied through the environment or the
   Integrations Center at deploy time.
3. **`AGENTS.md` overstated the catalogue size** (20 vs 8). Corrected in the
   guide as part of this audit.
