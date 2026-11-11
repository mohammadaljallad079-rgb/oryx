# ORYX — Execution 13 Report

**Theme:** Complete Admin Dashboard, Real Operations & Mobile Synchronisation
**Branch:** `feature/execution-07-premium-web`
**Baseline commit:** `ab0e6fee9441dbaf76754422786b65f81f2b8fad`
**Date:** 2026-10-31

---

## 1. Scope

Execution 13 finishes the ORYX administration system as a working control centre for
the customer app, the merchant portal, the website and the backend. Nothing here is a
mock: every surface reads and writes the real NestJS API and the real PostgreSQL
database, and every claim below is backed by a suite that ran against that stack.

The execution closed three operator gaps that Execution 12 left open, and proved the
cross-platform wiring end to end:

| Gap closed | Surface | What it means |
| --- | --- | --- |
| A banner could be switched on without being approved | `/website` → Banners | `status` (DRAFT/PUBLISHED/ARCHIVED) is now distinct from `isActive`, and only a published + active banner reaches customers |
| A catalogue item had no photographs | `/inventory` → Products | Edit a product, upload/promote/remove photographs through the real media pipeline |
| An announcement could only address staff | `/notifications` | The composer addresses the customer audience as well as staff |

Alongside the UI work, a new API integration suite
(`execution13-cross-platform-sync.e2e-spec.ts`, 20 tests) asserts eight journeys in
which a write in one plane is read back from another.

---

## 2. Files changed

### Shared — `packages/shared`

| File | Change |
| --- | --- |
| `src/contracts.ts` | `CmsBannerDto.status`; new `ProductImageDto` |

### Backend — `apps/api`

| File | Change |
| --- | --- |
| `src/cms/cms.dto.ts` | `UpsertBannerDto.status` (optional, `DRAFT`/`PUBLISHED`/`ARCHIVED`) |
| `src/cms/cms.service.ts` | Writes `status` only when supplied; stamps `publishedAt` on the first publish; create defaults to `DRAFT` |
| `src/notifications/staff-notification.controller.ts` | `customerAccountIds` + `allCustomers`, a 5,000-recipient cap, and a `customerRecipients` response field |

### Admin — `apps/admin`

| File | Change |
| --- | --- |
| `src/app/(app)/website/page.tsx` | Banner table surfaces editorial status next to activation; `BannerEditor` gains a status field; `banner-row-${id}` testids |
| `src/app/(app)/inventory/page.tsx` | `EditProductModal` and `ProductImagesModal`; upload / promote / remove a photograph; refactored to `useCallback`/`useEffect` |
| `src/app/(app)/notifications/page.tsx` | Audience selector (staff / customers), "every active customer account" toggle, composer reset |
| `src/lib/api.ts` | `productImages`, `uploadProductImage`, `updateProductImage`, `deleteProductImage`; `sendAnnouncement` accepts the customer audience |
| `src/i18n/dictionaries.ts` | English + Arabic keys for the new fields |

### Tests

| File | Change |
| --- | --- |
| `apps/api/test/execution13-cross-platform-sync.e2e-spec.ts` | New — 20 tests over 8 cross-platform journeys |
| `apps/admin/e2e/execution13-admin-operations.spec.ts` | New — 5 Playwright acceptance tests |

### Documentation

| File | Change |
| --- | --- |
| `AGENTS.md` | Execution 13 gotchas |
| `docs/audit/backend/EXECUTION_13_REPORT.md` | This report |

---

## 3. Backend endpoints

No new route was added. Execution 13 made existing routes carry the state the
cross-platform journeys need. All routes are versioned under `/api/v1`.

| Method | Route | Permission | Change |
| --- | --- | --- | --- |
| PUT | `/cms/banners` | `platform.cms.manage` | Accepts `status`; keeps the stored status when it is omitted; stamps `publishedAt` on the first publish |
| GET | `/inventory/products/:productId/images` | `erp.inventory.read` \| `erp.inventory.item.manage` | Existing — now consumed by the admin catalogue |
| POST | `/inventory/products/:productId/images` | `erp.inventory.item.manage` | Existing — multipart upload through the shared media pipeline |
| PATCH | `/inventory/products/:productId/images/:imageId` | `erp.inventory.item.manage` | Existing — used to promote an image to primary |
| DELETE | `/inventory/products/:productId/images/:imageId` | `erp.inventory.item.manage` | Existing — remove a photograph |
| POST | `/notifications/announcements` | `platform.notification.manage` | Accepts `customerAccountIds` and `allCustomers`; returns `customerRecipients` |

### Design rules held

- **Two banner states, one customer condition.** The homepage serves only
  `status: 'PUBLISHED'` **and** `isActive: true`. `PUT /cms/banners` writes `status`
  only when the caller supplies it, so an operator switching a slide on cannot
  publish a draft by accident. This is asserted in both the API and the UI suite.
- **The media pipeline is the only path.** An upload is validated and re-encoded by
  the shared media storage service; the admin client renders the API-resolved `url`
  and never composes a storage path.
- **Two id spaces for announcements.** A staff `userId` is not a `CustomerAccount.id`.
  The endpoint takes both lists, and a broadcast is capped at
  `MAX_ANNOUNCEMENT_RECIPIENTS` (5,000) so a single request cannot queue unbounded
  delivery rows.
- **No new ledger, no new stock path.** Product images attach to the existing
  catalogue; nothing in Execution 13 writes stock or accounting rows directly.

---

## 4. Real HTTP test results

### API integration suite

```
pnpm --filter @oryx/api test:e2e
Test Suites: 24 passed, 24 total
Tests:       468 passed, 468 total
```

The run was made against the migrated and seeded `oryx_dev` database. The suite
includes `test/execution13-cross-platform-sync.e2e-spec.ts` (20 tests) covering eight
journeys:

1. **website → mobile homepage.** A banner published as an operator appears in
   `GET /customer/homepage`; a draft that is switched on does not; deactivating it
   removes it again.
2. **admin → catalogue.** A photograph uploaded through the admin path is served to
   the customer catalogue, and a non-image upload to the same route is refused.
3. **admin → checkout.** Stock recorded by staff is what the customer checkout draws
   down, and the staff valuation shows the reduced quantity.
4. **application → directory.** A public provider application shows to the platform as
   pending and, once approved, appears in the public directory.
5. **app → staff, and only staff.** A booking created in the app is listable and
   confirmable by staff; a staff account without booking permission is refused.
6. **app → merchant → platform.** A customer order is visible in the merchant portal
   and in the platform ecosystem figures, and the merchant's status write is visible to
   the customer.
7. **merchant → customer feed.** A merchant offer reaches the customer feed only while
   it is active, and leaves when it is withdrawn.
8. **platform → customer inbox.** An operator announcement is delivered to the
   addressed customer only; a non-platform caller is refused.

### UI acceptance suite

```
pnpm --filter @oryx/admin test:ui
  197 passed (7.6m)
```

Zero failures across the whole admin suite. The Execution 13 spec
`e2e/execution13-admin-operations.spec.ts` accounts for 5 of those:

1. the banner list shows the editorial status next to activation;
2. a published banner reaches the customer homepage and a draft does not (create →
   publish → read back → delete, cleaned up in a `finally`);
3. the product image manager uploads, promotes and removes a photograph (a tenant
   fixture created and deactivated in a `finally`);
4. the notification centre can address the customer audience;
5. a company administrator cannot reach the platform CMS banner write
   (`permission-denied`).

Every mutation is removed in a `finally` block through a `request.newContext()`, which
carries no ambient cookie and therefore cannot race the page's own session rotation.
The seeded catalogue was verified intact after the run.

### Mobile and cross-cutting results

| Check | Result |
| --- | --- |
| `pnpm --filter @oryx/mobile test` | 6 files, **93 passed** |
| `pnpm --filter @oryx/shared test` | 9 files, **180 passed** |
| API typecheck | pass |
| Admin typecheck | pass |
| Mobile typecheck | pass |
| Admin lint (`--max-warnings=0`) | pass |
| Customer lint | pass |
| Mobile lint | pass |
| React version regression | `react` and `react-dom` resolve to **19.1.0** in admin, customer and mobile |
| API production build | pass |
| Admin production build | pass |
| Customer production build | pass |

### Environment problems resolved during this execution

Two environment problems produced failures that were **not** code defects. Both are
recorded in `AGENTS.md`:

- The sandbox restart removed the Playwright browsers; every UI test failed with
  `Executable doesn't exist`. Fixed with
  `pnpm --filter @oryx/admin exec playwright install chromium`.
- `pnpm exec playwright test` does not read `.env`, so the MFA reset script refused to
  run (`DATABASE_URL does not look like a development or test database`). Sourcing
  `.env` before the run resolved it.

A stale admin build produced four misleading UI failures (a banner status column that
was not in the served bundle). `pnpm --filter @oryx/admin build` followed by a
`next start` restart resolved them; the source was never wrong.

Two real defects were found and fixed while writing the spec:

- The PNG fixture was 8×8, below the media pipeline's 64×64 minimum, so the upload
  failed `400 media.dimensions_invalid`. The fixture is now a real 96×96 PNG.
- The product fixture was created as the platform Super Admin, who has no tenant
  scope, so the API answered `403`. The fixture now uses a tenant administrator.

---

## 5. Security verification

- **Server-side authorization.** Every route carries an explicit guard
  (`@RequirePermissions` / `@RequireAnyPermission` / `@PlatformOnly`). The UI hides a
  surface; the API is what refuses. The UI suite asserts a company administrator sees
  `permission-denied` for the platform CMS banner write.
- **Tenant isolation.** A catalogue item belongs to a tenant; the API answers `403` for
  a platform principal that has no tenant scope, which the suite exercises.
- **No secret is echoed.** Product image reads return a resolved media `url`, never a
  storage key or a credential. The announcement payload carries ids and counts only.
- **Bounded writes.** A customer broadcast is capped at 5,000 recipients so one request
  cannot queue unbounded delivery rows.
- **Upload validation.** MIME type, dimensions and size are validated and the image is
  re-encoded by the shared media service; a non-image upload is refused (asserted in
  journey 2).
- **Two-state publishing.** An unapproved banner cannot reach a customer even when it
  is switched on, which is a content-safety property, not only a UI one.

---

## 6. Design preservation

- The Homepage was **not** redesigned.
- The dark navy and gold ORYX visual identity is unchanged; the new UI reuses the
  existing `Card`, `SectionHeader`, `Badge`, `Button`, `Field`, `Modal`, `TableShell`
  and `ErrorBanner` components.
- No new slider images, no onboarding screens and no startup changes were introduced.
- The new fields render in both languages and both themes.

---

## 7. Remaining incomplete work

This report claims only what it verified. The following remain open and are **not**
claimed as done here:

- **Android visual acceptance of the mobile Splash and Homepage.** A DOM or
  UI-hierarchy assertion is not a substitute for an on-device check, and none was
  performed in this execution.
- **SENSAGE inspection image upload from the mobile app.** The backend upload path
  exists and is exercised by the API suite; the on-device camera/gallery flow was not
  part of this execution's changes and is not claimed.
- **A new APK.** No APK was published; the instruction was to hold the release until
  the integrated functionality is coherent.
- **Merchant mobile authentication.** Merchant operations are exercised through the
  API and the admin portal; a dedicated merchant mobile sign-in flow was not built in
  this execution.

---

## 8. Final commit

Implementation commit `eb9a040` on `feature/execution-07-premium-web` — the commit
that accompanies this report. PR #7 remains **open and draft** (verified after the
push: `state=open`, `draft=true`, `head=eb9a040`); nothing was merged or deployed, and
no APK was published.

Baseline before this execution: `ab0e6fee9441dbaf76754422786b65f81f2b8fad`.
