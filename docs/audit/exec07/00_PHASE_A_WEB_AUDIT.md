# Execution 07 — Phase A: Existing Web Product Audit

Audit date: 2026-10-18
Branch: `feature/execution-07-premium-web` (created from `604e36a`, the verified
Execution 06 head on `audit/execution-05-verification`, so every Execution 06
fix is preserved).

## Scope inspected

| Surface | Entry point | Route count |
|---|---|---|
| Platform Super Admin + Tenant ERP (one Next.js app) | `apps/admin` | 35 pages |
| Public website + Customer portal (one Next.js app) | `apps/customer` | 16 pages |
| REST API (unchanged in this execution) | `apps/api` | — |

## What is already strong

- **Token system.** Both apps define the same approved palette (deep navy
  `#00162b` family, gold `#d4af37`, hairline borders) in `globals.css`, with a
  full `data-theme="dark|light"` light override and `data-dir="rtl|ltr"`
  direction handling. 110 classes in the admin sheet, 59 in the customer sheet.
- **Official logo.** `BrandLogo` ships the owner's real lockup as two
  colourways (`oryx-logo-on-dark.png`, `oryx-logo-on-light.png`), swapped by CSS
  on `data-theme` so there is no first-paint flash. Used in the admin sidebar,
  admin login, admin dashboard hero and the customer header.
- **Bilingual by construction.** Arabic is the default and the source language;
  every key exists in both dictionaries (admin 1824 lines, customer 323 lines).
- **Admin module art.** 28 distinct generated SVGs in `apps/admin/public/tiles/`
  from `scripts/generate-tile-art.py`, plus a dashboard hero banner.

## Confirmed gaps and defects

### G1 — The customer website has no imagery at all (highest impact)

`apps/customer/public/` contains only `brand/`. Fourteen of sixteen customer
pages reference no image asset. The service-category tiles on the homepage and
`/services` render a **single generic gradient** (`--tile-overlay` +
`radial-gradient`), so all five categories look identical — violating the
Execution 07 rule "use distinct visuals for distinct service categories".

### G2 — The homepage is a thin prototype, not a premium site

`apps/customer/src/app/page.tsx` is 128 lines and renders only: a text hero, a
category grid, three provider cards and a three-step strip. The task requires a
homepage with value proposition, service categories, how-it-works, customer
benefits, provider/partner opportunities, trust and safety, FAQ, contact and a
professional footer. Everything from "benefits" onward is **absent**.

### G3 — The footer is a single line

`SiteFooter` renders one copyright span and two links. A premium public site
needs a multi-column footer (services, company, support, legal, language).

### G4 — No service discovery journey beyond a filter link

`/services` renders five cards that each link to `/providers?category=…`. There
is no explanatory copy, no price/expectation guidance, no distinct art.

### G5 — Customer dashboard is a bare KPI row

`/dashboard` renders four plain count cards and two lists. It has no welcome
banner, no next-action guidance, no vehicle/service status summary.

### G6 — Admin dashboard home is a module grid only

`/dashboard` deliberately holds no KPIs (they live at `/dashboard/overview`).
That split is intentional and is preserved, but the module grid and hero need
final polish for a premium feel.

### G7 — No documented design system

Tokens and components exist in code but there is no single document describing
the colour tokens, type scale, spacing, component inventory and breakpoints.
Execution 07 requires a reusable, documented system.

## Non-goals (explicitly excluded)

- No change to authentication, sessions, CSRF, MFA, permissions or API logic.
- No change to the native mobile app (`apps/mobile`).
- No new business claims, partner logos, certifications or testimonials — the
  site only states capabilities the code actually implements.

## Plan

Phase B builds the design-system documentation and the four representative
previews (public homepage, customer dashboard, Super Admin dashboard, tenant ERP
dashboard) for owner approval. Phase C applies the system across all web pages.
Phase D runs functional, responsive, accessibility and regression tests.
