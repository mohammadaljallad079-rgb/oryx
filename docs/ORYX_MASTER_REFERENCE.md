# ORYX — MASTER PROJECT REFERENCE
Status: **Owner-approved requirements / proposed scope; not implemented yet**.
This reference is authoritative for OpenHands. It supplements, not replaces, the owner's original project presentations and visual assets.

## Core identity
ORYX is a unified enterprise platform combining:
1. **ORYX Holding Enterprise ERP** — first-party operational ERP for ORYX's own group of companies and their branches, across different business sectors.
2. **ORYX Business SaaS ERP** — tenant-isolated ERP accounts sold to subscribing businesses; the Super Admin chooses the plan and permitted modules.
3. **ORYX Automotive Platform** — automotive consumer app, website, partner portals and shared APIs, managed from the same Super Admin, to be implemented in later phases.

## Non-negotiable architecture
- One system with **platform / group / company / branch** hierarchy and explicit tenant boundaries; distinguish ORYX's internal companies from independent paying customer tenants.
- A **real Super Admin**, not a screenshot or static mock, can create and manage holding companies, business tenants, company accounts, branches, users, roles, plan catalog, subscriptions, module entitlements, and cross-platform configuration.
- Super Admin can grant **module-level and feature/action-level entitlements** to companies. Company administrators can grant subordinate staff permissions **only inside their licensed company scope**. Branch restrictions also apply. Backend enforces all checks, never just hidden UI.
- Packages are **admin-created and editable**, not hard-coded. Assign each package a versioned set of modules, capabilities, users/branches/storage/API limits, pricing/currency/billing cadence, trial/expiry and lifecycle. Support per-tenant overrides with audit and explicit permissions. Package changes must not retroactively corrupt historical invoices or permissions.
- Consumer-app registered users are separate from business tenants but can be linked to verified companies / partner profiles. A registered user may upgrade or subscribe to a business ERP plan and provision a controlled business tenant, subject to admin verification and billing policy.
- Internal holding ERP and SaaS ERP may share code but **must not share tenant-private data accidentally**. A Super Admin's support access to a tenant must be explicit, authorized, logged and suitably time-bounded.
- All monetary actions need auditable source documents, validations, transaction safety, and correct company/currency/tax context.

## Phase 1 — build the complete functioning web control platform
### A. Platform governance / Super Admin
Platform overview, company and tenant registry, branch hierarchy, account provisioning/invitations, member lifecycle, RBAC and permission catalog, session security/MFA, audit log, roles/approval flows, modules catalog, entitlement policy, plan/billing/subscription administration, payment configuration adapters, invoices and receipts, helpdesk, notifications, platform settings and basic observability.
### B. Holding / company ERP
Financial accounting (chart of accounts, journals, posting controls, AR/AP, invoices, VAT settings), CRM/customers, sales and POS integration points, procurement and vendor management, inventory and warehouses / transfers, HR and payroll-ready entities, assets, jobs/operations, BI reporting. Implement vertical modules progressively but ensure each delivered workflow is actually functional, tested and DB backed.
### C. Automotive application administration (inside Super Admin)
An **independent navigation group named Website & App Management**, with CMS pages/menus/hero banners/media, bilingual localization, home-screen content, feature flags, app versions, categories, FAQs, policies, user/customer moderation, vehicles/vehicle passports, inspection providers and templates, inspection bookings and reports, service partners/listings, automotive map categories, products/spare-parts sellers/marketplace moderation, commissions/orders, recovery service categories/providers, campaigns/promos, push/email/SMS notification templates, and support.
Create documented **versioned API contracts** for the future mobile application (`/api/v1`), auth/token lifecycle, permissions, pagination, errors, rate limits and secure partner integrations; never publish secret API keys to web clients. Phased integrations can be clearly identified as not yet implemented. Build real admin CRUD and persistent models for the Phase-1 modules that are declared delivered.
### D. SaaS ERP business subscription portal
Self-service entry following authorized purchase/activation, company onboarding, invited staff, company/branch selector, enabled module navigation, role assignment constrained by purchased entitlements, billing overview and upgrade requests. No unauthorized tenant data access.
### E. UI
Reproduce the owner-approved navy/gold dashboard reference with image-led section tiles, elegant charts/KPIs, right-to-left Arabic support, English, responsive layout, accessible navigation, shared design tokens, **Dark + Light themes** with saved user preference. Implement actual routed pages behind the tiles; no static image as the product.

## Planned automotive ecosystem (later implementation)
- My Garage / digital vehicle passport with VIN, timeline and controlled sharing.
- Inspection appointments, checklists, verified PDF/QR reports, human-approved AI assistance.
- Auto Map: discovery of garages, inspection centers, spare parts and mobile services.
- Multi-vendor spare parts marketplace, fitment verification, ordering, returns and RFQ.
- Recovery / SOS / driver dispatch and tracking.
- Consumer Super App, vendor/workshop/inspection/recovery/fleet portals and driver app.
- AI insights as explainable, reviewed assistance — not unverified diagnosis.
Plan APIs and admin boundaries now; **do not claim these user apps are built in Phase 1**.

## Data/security baseline
PostgreSQL preferred; schema migrations; strong credentials/hashed passwords, MFA for privileged users, secure cookies/tokens, RBAC plus tenant/branch constraints, audit trails, object-level authorization, server-side entitlements, test fixtures clearly marked synthetic, no payment-card storage, least privilege, backups, monitoring, encrypted sensitive data and privacy controls. Configure via environment, never hardcode secrets.

## Definition of Done
An authenticated Super Admin can create a company and branches; set plan/module entitlements; invite a company admin; the admin logs in and sees only licensed modules; invites a staff user with strictly lesser rights; records persist in the database; tenant-crossing API calls fail; app/CMS management CRUD is real for declared-delivered features; Arabic/English, dark/light themes and responsive UI work. Include automated functional/authorization tests and a reproducible local runbook. Clearly report incomplete modules instead of fake demo claims.

## Sequencing
1. Repo audit, technical foundation, visual design system, auth, orgs/branches/tenancy/RBAC.
2. Working Super Admin company provisioning, module catalog, plans and subscriptions.
3. Working ERP module workflows in deliberate increments.
4. Working website/app CMS and API management.
5. SaaS tenant onboarding/entitlements.
6. Consumer mobile app and automotive business ecosystem after web control plane is stable.

**Do not rebuild unrelated projects, start mobile app first, or replace the approved visual identity.**
