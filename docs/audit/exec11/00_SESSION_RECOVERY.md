# Execution 07 — session recovery and light-theme continuation

This record covers the recovery of the crashed OpenHands session and the
continuation of Execution 07 Phase E (light-theme correction). It states plainly
what was recovered, what was already on the remote, and what was lost.

## 1. What the crashed session had already pushed

The recovery brief gave `b3c9a71eaeaea0eb4ae5aa1ab141a1511a10de37` as the last
confirmed pushed commit. The remote branch is **ahead of that SHA**:

| Ref | SHA | Note |
| --- | --- | --- |
| Last SHA given in the brief | `b3c9a71` | ancestor of the remote tip |
| Remote tip, `origin/feature/execution-07-premium-web` | `7f4efe7` | **36 commits after `b3c9a71`** |

So the crashed session did push additional work. The 36 commits after the last
known SHA are intact on the remote and were not lost:

```
7f4efe7 docs(agents): record the ubuntu-latest / Playwright 26.04 hazard
227b070 docs(exec07): correct the scrim evidence to what was measured
5989f7e ci: pin the Chromium jobs to ubuntu-24.04
745c742 docs(exec07): record the fourth continuation and the light/dark sheets
ceae975 chore(exec07): keep the light-theme diagnostic probes
a56c01a docs(exec07): regenerate the Phase E evidence after the scrim fix
e8abbf7 feat(exec10): per-company branding with a validated, tenant-scoped API
593dfe1 fix(customer): finish the light theme and mirror the RTL photo scrim
5563e3c fix(rbac): make the platform Super Admin role repairable
951b78a fix(exec10): stop a staging stack from inheriting production secrets
7fc0bc6 docs(exec10): record the existing-server access blocker in AGENTS.md
11543a9 docs(exec10): record the existing-server pre-deployment blocker and the plan
911f35d fix(exec09): make the first production deploy reachable and verifiable
0d6c430 fix(exec09): resolve document currency and country from the tenant, not SA/SAR
d79da8d docs(exec08): publish the Execution 08 captures in the browsable preview
de5d4ea fix(ci): make the deploy workflow valid and lint workflows in CI
e571e29 docs(exec08): recovery record, light-theme evidence and the live preview sweep
f89285c feat(exec08): production deployment package and hardened dependencies
792fe39 feat(exec08): Bahrain market configuration and the shared plan catalogue
488e637 docs(exec07): refresh the live-preview evidence from the redeployed site
5302b88 fix(customer): finish the light theme and recover the interrupted work
327f954 docs(exec07): record the published preview and prove it from the live site
b3bb18b fix(exec07): let the published-asset check outlast the Pages rebuild
7ff2dd5 fix(exec07): publish .nojekyll so Pages stops stripping the site assets
5c85a4e docs(exec07): record the light-theme sign-off and refresh the evidence
b8050cb feat(customer): publish the site as a real static export for the preview
32c1d16 docs(exec07): record the permanent preview with live captures
3474568 fix(exec07): drop the branch-restricted Pages environment from deploy
ecbcfeb fix(exec07): deploy the preview from the gh-pages branch
2ac68d3 feat(exec07): permanent GitHub-hosted design preview
```

## 2. Work that was in the sandbox but not on the remote

Three commits were committed locally but never pushed when the sandbox died.
They were recovered intact from the local clone, not rebuilt:

```
1897db0 fix(exec07): correct the admin light theme to the approved ivory identity
df92871 docs(agents): record the admin light-theme and customer capture gotchas
c0ebd31 chore(exec07): add the light-theme evidence page builders
```

`1897db0` is the actual correction the owner asked for: the admin control plane
still rendered a cold blue-grey light theme (`#f5f6f8` field, `#0d2338` navy
type) while the customer site and the dark theme use the warm ivory / deep
charcoal / metallic gold identity, so the two applications read as two products.
It moves the light tokens to the approved values:

| Token | Before | After |
| --- | --- | --- |
| field | `#f5f6f8` | `#f7f4ed` (warm ivory) |
| deep field | `#eceef2` | `#efeae0` |
| surface | `#ffffff` | `#ffffff` |
| raised | `#f0f2f6` | `#fbf9f4` (warm neutral) |
| type | `#0d2338` | `#22201d` (deep charcoal) |
| muted type | `#5b6b7d` | `#5a544b` |
| accent gold (text) | `#b8912a` | `#7d5f10` |
| accent gold (fill) | — | `#e0c168` … `#c9a227` |

The commit touches **only** the light-theme block; the dark tokens are
untouched, which the dark-invariance check in section 4 confirms.

## 3. Work that was lost with the sandbox

Honest accounting — this is **not** recovered, because it is not present:

- Nothing that had been committed and pushed was lost.
- The three local commits above were present in the clone and are now preserved.
- Uncommitted regenerated audit screenshots (42 PNGs, mtimes 17:28–17:35,
  before this session) were found in the working tree. They are byproducts of
  the admin Playwright suites (`apps/admin/e2e/audit.spec.ts`,
  `screenshots.spec.ts`), which write into `docs/audit/` and
  `docs/execution-reports/screenshots/`. They are regenerable, not authored
  deliverables; they are handled in section 5 rather than presented as recovered
  work.
- Any reasoning or plan text that existed only in the crashed conversation's
  context is not recoverable. This record replaces it from the repository state.
- Three untracked helper scripts from the crashed session were found in the
  working tree and are preserved in `.run/` rather than discarded:
  `exec09-make-env.py` (fills `deploy/env/production.env.example` with generated
  secrets into a temp path — no secret is hardcoded), `probe-effective-perms.mjs`
  (reads the repaired platform role and runs it through the shipped resolver)
  and `rewrite-tokens.py` (the one-off token consolidation whose result is
  already in `apps/customer/src/app/globals.css`). None carries a credential.

## 4. The light theme today — measured, not eyeballed

The owner's report was that the light theme "still look[s] inconsistent". The
correction is verified by measurement against the running stack, not by
inspection:

- **Contrast:** `.run/audit-light-theme.mjs` reads the resolved
  background/foreground/border of the shared primitives on each customer surface
  and reports the WCAG ratio of every text colour against the surface it sits
  on. Result: **0 text/surface pairs below their WCAG threshold.**
- **Consistency:** `.run/consistency-audit.mjs` flags a primitive whose
  foreground/background pair changes identity between surfaces (a white input on
  one page and a grey input on another). Result: **no inconsistent component
  properties found.**
- **Dark invariance:** `.run/verify-dark-identical.mjs` compares every dark
  capture against the previously published dark render. Result: **0 captures
  with a real colour shift**; the small movement reported is isolated
  sub-threshold pixel deviation, and 5 captures are byte-identical.

The tokens are centralized: `apps/admin/src/app/globals.css` and
`apps/customer/src/app/globals.css` each define the light and dark palettes under
`data-theme="dark|light"` on `<html>`. There are no scattered per-page colour
overrides; a surface styles itself from the tokens.

## 5. Evidence produced for this continuation

Fresh captures were taken from the running stack and committed under
`docs/audit/exec11/light-theme/`:

- The four surfaces the brief names — homepage, customer dashboard, provider
  directory and the sign-in page — in the light theme, in Arabic RTL and English
  LTR, at desktop, tablet and mobile (24 images).
- The Super Admin dashboard in the light theme (the surface `1897db0` corrected)
  and its dark counterpart, in both locales (4 images).
- A light-vs-dark side-by-side sheet per surface and locale (8 composites).

Every capture is machine-checked to belong to the theme it claims
(`.run/verify-exec11-theme.mjs`), and the RTL/LTR direction is asserted during
capture rather than assumed.

## 6. Preview

The repository publishes a browsable design preview to GitHub Pages from the
`gh-pages` branch via `.github/workflows/preview.yml` on every push to
`feature/execution-07-premium-web`. The Execution 11 captures are wired into the
`/evidence/` page by `scripts/preview/build-preview.mjs`, so the owner gets a
stable HTTPS link instead of a temporary sandbox URL.

## 7. Status of the wider task

Execution 07 Phase E (light-theme correction) is complete and verified locally.
Production deployment and production acceptance remain blocked on server access
and are **not** claimed as done.
