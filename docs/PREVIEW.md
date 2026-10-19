# Design preview (GitHub-hosted)

The Execution 07 design work has a permanent preview that lives on GitHub, so a
link to it does not expire when an editor session ends.

- **Site:** `https://mohammadaljallad079-rgb.github.io/oryx/`
- **Workflow:** `.github/workflows/preview.yml`
- **Built from:** `feature/execution-07-premium-web`
- **Served from:** the `gh-pages` branch (generated output; do not edit by hand)

The URL is stable. It changes only if the repository is renamed or the Pages
site is reconfigured.

## What the preview is

A static site generated from files already committed to the branch: the audit
reports rendered to HTML, the Phase E before/after captures, the light-vs-dark
comparison sheets, and the approved brand assets. It is marked `noindex` and it
is **not** a production deployment.

| Page | Contents |
|---|---|
| `/` | Overview, what changed, and the hosting requirements for a full-stack preview |
| `/evidence/` | Five surfaces, before/after, with the dark render beside each, in Arabic RTL and English LTR at desktop, tablet and mobile |
| `/reports/` | Every committed report, rendered from its Markdown |
| `/brand/` | The official logo and the approved design references |

## How it stays current

`.github/workflows/preview.yml` runs on every push to
`feature/execution-07-premium-web`, and on manual dispatch. It builds the site,
verifies it in a real browser, and publishes it. A push is the only trigger, so
the preview can never drift from the branch.

The job has three stages:

1. **build** — `pnpm preview:build` writes `build/preview/`.
2. **verify** — serves the build and drives it with Playwright: every page
   renders, every image resolves, no console error, no horizontal overflow at
   desktop and mobile. A separate crawl follows every internal link and renders
   each page in dark mode. A failure here blocks publication.
3. **deploy** — force-updates the `gh-pages` branch with the built site, which
   GitHub Pages serves. That branch holds generated output only and is never
   edited by hand.

No repository secret is required: the workflow uses the token GitHub issues to
the run itself, and the build reads only committed assets, so it is safe to run
on any branch.

## Running it locally

```bash
pnpm preview:build     # writes build/preview/
pnpm preview:serve     # serves it at http://127.0.0.1:8099
pnpm preview:verify    # renders every page and reports broken images or overflow
pnpm preview:check     # crawls every internal link and renders each page dark
```

`build/preview/` is generated output and is git-ignored; the committed evidence
it is built from lives under `docs/audit/`.

## Why a full-stack preview is not hosted here

The interactive customer site and the API are long-lived services: the API is a
Node process with a PostgreSQL database behind it, and the two Next.js apps need
their own origins and an HTTPS cookie scope. GitHub Pages serves static files
only, so it cannot host them, and running them inside a workflow would end when
the job ends.

To host a full-stack preview, a container host or a small VM is needed with:

| Component | Requirement |
|---|---|
| API | Node 22, a long-lived health-checked process |
| Database | PostgreSQL 17, `prisma migrate deploy` plus a seed, isolated from production |
| Apps | A build of `apps/customer` and `apps/admin`, each on its own origin |
| Networking | HTTPS on both origins, `CORS_ORIGINS` set to them |
| Secrets | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MFA_ENCRYPTION_KEY`, each generated for the preview and never shared with production |

Adding that would need a hosting account and a token stored as a repository
secret. Until then, this static preview is the permanent, verifiable artifact.

## Note on the committed demo credentials

Several reports under `docs/audit/` and `docs/execution-reports/` list the
seeded demo accounts and their development passwords. Those values are already
public in `.env.example` and are development defaults, not production secrets.
They are published here unchanged, because the reports are the source of truth
and redacting them would change the evidence. They must still be replaced before
any real deployment — see `docs/DEPLOYMENT.md`.
