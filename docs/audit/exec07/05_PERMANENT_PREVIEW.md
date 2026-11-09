# 05 — Permanent GitHub-hosted design preview

The owner rejected temporary sandbox preview links. This report records the
permanent preview and the verification behind it.

- **Site:** `https://mohammadaljallad079-rgb.github.io/oryx/`
- **Workflow:** `.github/workflows/preview.yml`
- **Served from:** the `gh-pages` branch (generated output, never edited by hand)
- **Source:** `feature/execution-07-premium-web`

## Why GitHub Pages

GitHub is already the source of truth for this work, so publishing the preview
from GitHub keeps one system rather than adding a second one that can drift. The
preview is generated from files committed to the branch, so it can only show
what the repository contains.

The static preview is the part that can live on GitHub. The interactive
applications cannot: the API is a long-lived Node process with PostgreSQL behind
it, and GitHub Pages serves static files only. `docs/PREVIEW.md` records what a
full-stack preview would require.

## How it is published

`preview.yml` runs on every push to `feature/execution-07-premium-web`, and on
manual dispatch.

| Stage | What it does | Gate |
|---|---|---|
| build | `pnpm preview:build` writes `build/preview/` | Fails if a surface's captures are missing |
| verify | Serves the build, drives it with Playwright, crawls every internal link and renders each page in dark mode | Fails on a broken image, console error or horizontal overflow |
| deploy | Force-updates `gh-pages`, then waits for the published URL to answer | Fails if the site does not become reachable |

Verification blocks publication, so a bad build is never published. No
repository secret is required: the workflow uses the token GitHub issues to the
run itself.

Two failures were found and fixed while bringing this up, both in the workflow
rather than the site:

1. The first deploy used `actions/configure-pages` with `enablement: true`. The
   run token cannot create a Pages site — `Resource not accessible by
   integration` — so publishing could never succeed that way.
2. The deploy job then declared the `github-pages` environment, which carries a
   branch policy allowing only `gh-pages`. A job running on the design branch
   was held by that policy and failed after the push had already succeeded.
   Removing the environment reference is the correct fix; the environment does
   not gate a plain branch push.

## Verification

Run [`39332710747`](https://github.com/mohammadaljallad079-rgb/oryx/actions/runs/39332710747)
on head `3474568`: **build, verify and deploy all success.** CI on the same head
is also success.

| Check | Result |
|---|---|
| Pages site reachable | `200` on `/`, `/evidence/`, `/reports/`, `/brand/`, a report page and the stylesheet |
| Published `gh-pages` head | `9d4f449`, committed from `3474568` |
| Live render, 4 viewports | **0 broken images** |
| Internal links | **171 pages crawled, 0 bad responses** |
| Dark mode | every page rendered dark, **0 issues** |
| Brand assets on the live site | 24 images, 0 broken |

The captures in this directory were taken from the **published** URL, not from a
local build, so they show what a visitor sees.

| File | Surface |
|---|---|
| `preview-01-home.webp` | Homepage, desktop |
| `preview-02-evidence.webp` | Evidence index, desktop, top of page |
| `preview-03-brand.webp` | Brand assets |
| `preview-04-mobile.webp` | Homepage, 390 px |

## Note on the committed demo credentials

Several reports under `docs/audit/` and `docs/execution-reports/` list the
seeded demo accounts and their development passwords. Those values are already
public in `.env.example`, are development defaults, and are not production
secrets. The preview publishes the reports unchanged, because they are the
evidence and redacting them would change it. They must still be replaced before
any real deployment.
