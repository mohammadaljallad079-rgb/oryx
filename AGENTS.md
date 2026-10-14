# OpenHands / Coding Agent Guide — ORYX

Read **docs/ORYX_MASTER_REFERENCE.md** and **docs/ORYX_VISUAL_REFERENCE.md** before writing code. The owner-provided dashboard screenshot and logo are source-of-truth visuals and must be obtained/uploaded before implementing visual fidelity.

**EXECUTION 01:** Build the functional **Super Admin and multi-company ERP foundation** first. This is not a single dashboard HTML mock or a mobile app build. Audit this repository, select a maintainable stack, implement persistent authentication, tenant/group/company/branch hierarchy, RBAC, module catalog, configurable SaaS plans and entitlements, company provisioning, and the core Website & App Management section / versioned API architecture. Deliver real working screens and backend endpoints in implemented portions.

Constraints:
- Exact requested product: ORYX Holding ERP + Business SaaS ERP + Automotive Consumer Ecosystem.
- Dark/Light themes, Arabic RTL and English LTR; navy/gold premium visual identity; image-tile dashboard.
- Security-first company/branch/tenant isolation; backend guardrails for plans and permissions.
- A company's admin can never grant staff permissions beyond their company's plan or their own delegation rights.
- Keep future app services structurally ready; app itself belongs to later executions.
- Never confuse internal ORYX companies with subscribing businesses.
- Prefer increments with true DB-backed CRUD and tests rather than blanket placeholder modules; clearly identify incomplete portions.
- Never modify or delete pre-existing project code without first auditing it.
- Run automated tests, record outcomes, and push a feature branch/PR where appropriate. Do not claim deployment or feature completion without verification.

Report the implementation with working commands, routes, migrations, tests, remaining limitations and visual comparison.
