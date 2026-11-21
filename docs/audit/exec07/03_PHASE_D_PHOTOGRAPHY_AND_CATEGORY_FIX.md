# Execution 07 — Phase D: Real Photography, Dynamic CMS and the Category Defect

Report date: 2026-10-18
Branch: `feature/execution-07-premium-web`
Pull request: [#7](https://github.com/mohammadaljallad079-rgb/oryx/pull/7)
Verified head before this phase: `30268f2`
Status: **Phase D complete, externally verified; owner review pending**

This report covers the Phase D work and the defect found and fixed while
verifying it. Every claim names the script that produced it and the artifact it
wrote.

## 1. What Phase D delivered

The owner asked for a premium luxury automotive experience with **real licensed
photography wired through the dynamic CMS into the customer homepage**. Phase D
did that, and in doing so exposed a defect that had been silently breaking the
category filters.

| Piece | Where |
|---|---|
| CMS admin endpoints for categories and banners | `apps/api/src/cms/content.controller.ts`, `content.service.ts`, `cms.dto.ts` |
| Media library seeded with 10 photographs, processed to WebP variants | `scripts/seed-exec07-content.mjs` |
| Customer hook that reads published website content | `apps/customer/src/lib/use-website-content.ts` |
| Homepage hero, category cards and partner strip driven by the CMS | `apps/customer/src/app/page.tsx` |
| One shared category catalogue | `packages/shared/src/service-categories.ts` |
| Regression tests | `packages/shared/test/service-categories.test.ts`, `apps/api/test/execution07.e2e-spec.ts` |

The ten source photographs are tracked under `apps/customer/public/media/`. The
uploaded bytes and the WebP variants they produce are runtime state under
`apps/api/.media/`, now ignored by git.

## 2. Defect D1 — three category vocabularies, one silent failure

**Symptom.** Every service category chip and card on the customer website linked
to `/providers?category=<key>`, and every one of those links returned an **empty
provider directory**. On the homepage the five category cards also rendered the
bundled vector fallback instead of the CMS photograph, so the Phase D
photography never appeared on a card.

**Root cause.** Three layers each used a different key for the same concept:

| Layer | Keys it used |
|---|---|
| Customer website and mobile `SERVICE_CATEGORIES` | `automotive_maintenance`, `automotive_inspection`, `automotive_tyres`, `automotive_bodywork`, `automotive_recovery` |
| Seeded `ServiceCategory` rows (which the CMS attaches imagery to) | `vehicle_inspection`, `maintenance`, `spare_parts`, `recovery`, `car_wash` |
| Seeded `MarketplaceProvider.categoryKey` | `WORKSHOP` |

The provider directory filters on `categoryKey`, so a chip sent a key no provider
carried and the directory correctly returned nothing. The homepage looked up
`content.categories` by the website key, found no row, and fell back to vector
art. Neither failure logged an error; both simply rendered an empty or generic
result.

**Fix.** The catalogue now lives once, in `packages/shared/src/service-categories.ts`,
and every consumer imports it:

- the seed writes the `ServiceCategory` rows **and** the provider `categoryKey`
  values from it, creating one approved provider per category;
- the customer website and the mobile app re-export it instead of declaring
  their own list;
- the keys are the persisted `ServiceCategory.key` values, so the CMS rows, the
  photography and the provider directory agree by construction.

The provider seed now creates five approved providers per company, one per
category, so each filter has real rows to return.

**Evidence — the API.**

| Probe | Before | After |
|---|---|---|
| `GET /marketplace/providers?categoryKey=automotive_maintenance` | `0` | `0` (retired key, correctly empty) |
| `GET /marketplace/providers?categoryKey=vehicle_inspection` | `0` | `27` |
| `GET /marketplace/providers?categoryKey=maintenance` | `0` | `27` |
| `GET /marketplace/providers?categoryKey=spare_parts` | `0` | `27` |
| `GET /marketplace/providers?categoryKey=recovery` | `0` | `27` |
| `GET /marketplace/providers?categoryKey=car_wash` | `0` | `27` |
| `GET /marketplace/providers` (no filter) | `20` | `135` |

**Evidence — the live UI.** `.run/verify-category-filter.mjs` drives the real
preview: it reads the category chips the site itself renders, opens each
`/providers?category=` URL, and counts the rendered provider cards. Output:
`docs/audit/exec07/phase-d/category-filter-verification.json`.

| Category | Provider cards rendered | Empty state shown |
|---|---|---|
| `vehicle_inspection` | 27 | no |
| `maintenance` | 27 | no |
| `spare_parts` | 27 | no |
| `recovery` | 27 | no |
| `car_wash` | 27 | no |

**Evidence — the CMS photography.** `.run/capture-exec07-phase-d.mjs` asserts
that the hero background and every category card art resolve to a `cms/media`
URL rather than the bundled SVG:

| Capture | Hero from CMS | Category cards | Cards from CMS | Horizontal overflow |
|---|---|---|---|---|
| `home-ar-dark` | yes | 5 | **5** | no |
| `home-en-dark` | yes | 5 | **5** | no |
| `home-ar-light` | yes | 5 | **5** | no |
| `home-en-light` | yes | 5 | **5** | no |

Before the fix the same script reported `categoryCardsFromCms: 0`. The four
full-page captures are in `docs/audit/exec07/phase-d/`.

## 3. Regression tests

The fix is pinned by tests that fail if a second vocabulary returns.

**Unit — `packages/shared/test/service-categories.test.ts`** (7 tests): unique
keys, the persisted identifier shape, both locales of copy and artwork per
category, distinct sort order, and explicit rejection of the retired
`automotive_maintenance` and `WORKSHOP` keys.

**API — `apps/api/test/execution07.e2e-spec.ts`** (3 new tests):

- *serves the provider directory under the same category keys the CMS publishes* —
  reads the public CMS category keys and asserts each one returns at least one
  provider;
- *returns no provider for a retired category key* — asserts the two old keys
  match nothing;
- *persists every catalogue category as a seeded `ServiceCategory` row* — asserts
  the database and the code catalogue agree.

## 4. Test results

| Suite | Command | Result |
|---|---|---|
| Shared unit | `pnpm --filter @oryx/shared test` | **103 passed** (6 files) |
| API integration | `pnpm --filter @oryx/api test:e2e` | **302 passed** (14 suites) |
| Mobile unit | `pnpm --filter @oryx/mobile test` | **20 passed** (3 files) |
| Typecheck | customer, mobile, api, admin | **clean** |
| Lint | customer, admin | **clean** (`--max-warnings=0`) |
| External preview sweep | `.run/sweep-preview.mjs` | **39 / 39 surfaces, 0 failed requests** |
| CI run [`39161406862`](https://github.com/mohammadaljallad079-rgb/oryx/actions/runs/39161406862) | head `a9b1db4` | **all 3 jobs success** (typecheck+build, unit+API integration, browser acceptance) |

The full API run log is `.run/api-e2e-full.log`; the sweep log is
`.run/sweep-phase-d-final2.log` and its machine-readable output is
`docs/audit/evidence/exec06-preview-sweep.json`.

## 5. Live preview

The staging previews were re-verified from outside the sandbox after this
change. The links and demo credentials are unchanged and are listed in
`docs/audit/07_LIVE_PREVIEW_AND_CREDENTIALS.md`.

| Surface | URL |
|---|---|
| Super Admin and every ERP module | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev` |
| Customer website, dashboard and mobile web | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev` |
| Customer homepage (Phase D photography) | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/` |
| Category filter proof | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/providers?category=maintenance` |

Demo logins re-verified with `.run/check-demo-credentials.mjs`: Super Admin,
Enterprise tenant admin, Demo SaaS tenant admin and Demo consumer all sign in
and reach a rendered dashboard.

## 6. Honest limitations

- The category cards now use **real licensed photography** from the seeded media
  library. The official ORYX brand logo is present; the approved dashboard
  photography named in `docs/assets/ORYX Auto Services Dashboard.png` is still
  not in the repository, so full visual parity with that reference is **not**
  claimed.
- This is a staging preview on the sandbox ingress, not a production deployment.
- The provider count per category (27) reflects the seeded demo tenants plus E2E
  fixtures; it is not a production figure.
