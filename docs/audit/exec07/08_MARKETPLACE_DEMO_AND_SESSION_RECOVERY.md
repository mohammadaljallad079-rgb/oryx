# Execution 07 — Session recovery and the marketplace demo

Branch: `feature/execution-07-premium-web`
Date: 2026-10-18

This session began after a sandbox error ended the previous conversation. It has
two parts: what the recovery actually found, and the premium Android demo of
`apps/mobile` that the owner asked for. Everything below was measured in this
session; nothing is carried over from a report.

---

## 1. Recovery

### 1.1 What the remote held

| Item | Value |
| --- | --- |
| Branch | `feature/execution-07-premium-web` |
| Remote tip (`origin/feature/execution-07-premium-web`) | `8cb372b` |
| Local `HEAD` at recovery | `d7a0a81` |
| Ahead / behind (local vs remote) | `1 / 0` |
| PR #7 | exists; state not re-verified this session — the API is unreachable (401, §3.9) |

The crash report named `b3c9a71` as the last confirmed push. That commit exists
and is an **ancestor of `HEAD`, 60 commits back**. The remote had moved on since
it was written down, so `b3c9a71` is not the branch tip and using it as a
starting point would have discarded 60 commits.

### 1.2 Was anything lost?

No.

| Question | Answer | How it was checked |
| --- | --- | --- |
| Did the crashed session push past `b3c9a71`? | Yes — 60 commits, to `8cb372b` | `git rev-list --count b3c9a71..HEAD` |
| Is any remote work missing locally? | No | `git rev-list --left-right --count` → `1 / 0` |
| Is anything stranded in a stash? | No | `git diff --stat stash@{0} HEAD` is **empty** |
| Is there unpushed work? | Yes — 1 commit | `d7a0a81`, 94 files, +9226 / −2629 |

The stash `safety-snapshot-exec07-mobile-marketplace` is byte-for-byte contained
in `HEAD`, so it holds nothing that is not already committed. It was left in
place rather than dropped.

`d7a0a81` is the only unpushed commit. It is the marketplace work that was sitting
uncommitted in the working tree when the sandbox failed — the crashed session had
written it but not committed it, so it survived as working-tree changes and was
committed here. It has not reached the remote: the push is blocked on an expired
credential, described in §3.9.

**No unpushed work was lost, and none had to be reconstructed.** The one commit
that was at risk is present, committed locally, and waiting only on a valid token
to be pushed.

### 1.3 What was not touched

Nothing was reset, force-pushed, rebased, reverted or discarded. The branch, the
PR base and the PR head are as they were found.

---

## 2. The light theme

The owner's last request was that the light theme "still looks inconsistent and
needs professional correction". That correction is **already on the branch and on
the remote** — it is Execution 07 Phase E, committed and pushed before the crash.
This session re-measured it rather than redoing it.

Verified directly against the pushed tip, not the working tree:

```
$ git show origin/feature/execution-07-premium-web:apps/customer/src/app/globals.css
:root[data-theme='light'] {
  --bg: #f7f4ed;      /* ivory */
  --bg-deep: #efeae0; /* deeper ivory */
  --surface: #ffffff; /* white card */
```

So the light theme is not local-only work waiting on a push: the pushed branch
already carries it.

### 2.1 Contrast

`node .run/check-light-palette.mjs` — **33 / 33 pairs meet their threshold**.
The pairs cover the surfaces the request names:

| Group | Examples | Worst measured |
| --- | --- | --- |
| Body text on ivory / white | charcoal on ivory | 14.79 |
| Muted text | muted on white | 7.49 |
| Faint text | faint on deeper ivory (footer) | 4.88 |
| Gold as text | eyebrow gold on ivory | 5.44 |
| Gold as fill | on-gold on deep fill | 4.60 |
| Photo surfaces | white caption on scrim | 17.57 |
| Status on white | success on ivory | 4.56 |

The worst case overall, 4.60, is on-gold type over the deepest metallic fill; the
threshold is 4.5. Nothing fails, and the two closest results — 4.60 and 4.56 —
are both deliberate dark-on-accent pairs, not body copy.

### 2.2 The tokens are centralised

The request asked for centralised tokens rather than scattered overrides. The
light palette is defined once, in `:root[data-theme='light']` in
`apps/customer/src/app/globals.css`, with a single RTL variant block and a small
number of component-scoped exceptions (brand logo on light chrome, footer logo).
There is no per-page colour override.

Read from the running site, light theme, 1440×1024:

| Property | Value |
| --- | --- |
| `body` background | `rgb(247, 244, 237)` — ivory |
| `body` colour | `rgb(34, 32, 29)` — charcoal |
| `data-theme` | `light` |

### 2.3 The dark theme is intact

`node .run/verify-dark-theme-invariance.mjs` compares the Phase E `before` and
`after` dark captures, separating a palette change from a content change by
measuring the header chrome band — which is painted by the tokens and carries no
photograph.

**31 dark captures compared. Captures whose theme chrome moved: 0.** The
whole-frame deltas are content: CMS copy that could not load before the preview
build was fixed, and a hero photograph that was replaced. Five captures are
byte-identical whole frames; the rest differ only where content sits.

---

## 3. The marketplace demo

### 3.1 Build

| Item | Value |
| --- | --- |
| App | `apps/mobile` — `ORYX Marketplace` |
| Slug / package | `oryx-marketplace` / `com.oryx.marketplace` |
| Version | `1.0.0` (versionCode 1) |
| Artefact | `android/app/build/outputs/apk/release/app-release.apk` |
| Size | 70,019,297 bytes (67 MiB) |
| SHA-256 | `32ba9d9923d4eed78ac027028fc5dae1b2ed97d2707ebe38a6ef5c9b3aea8156` |
| Gradle | BUILD SUCCESSFUL |

The APK is not committed: `apps/mobile/.gitignore` excludes `/android`, which is
correct — it is a build output, and 67 MiB of binary does not belong in the
history.

It is downloadable from this environment without waiting on GitHub, served by the
preview proxy from a hard link (so no second copy on disk):

```
https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/evidence/exec07-phase-e/apk/oryx-marketplace-1.0.0.apk
```

The proxy answers `Content-Type: application/vnd.android.package-archive` with
`Content-Disposition: attachment`, so a phone downloads it rather than trying to
render it. The link was tested by downloading the whole file through it and
re-hashing: the result matches the SHA-256 above.

**The build is debug-signed.** `android/app/build.gradle` points the `release`
build type at `signingConfigs.debug` (the Expo template default), so it installs
with "unknown sources" enabled and is not a store artefact. Fine for a review
hand-out, not for distribution.

### 3.2 Does it need a backend?

No. Every screen reads `src/lib/repository.ts`, whose demo implementation
resolves from the seeded catalogue in `src/demo/`. There is no HTTP client in the
app: no `fetch(`, no `axios`, and no host is hard-coded — `localhost:3001`,
`10.0.2.2` and `/api/v1` each appear zero times in `assets/index.android.bundle`.

`XMLHttpRequest` does appear, six times, but none of them are calls. They are
React Native's own internals and error strings ("`XMLHttpRequest` URL needs to be
defined"), which ship in every bundle. The `https://` hits are the same story:
`react.dev`, `reactnative.dev`, `expo-router` and similar appear in the string
table, and `classic-assets.eascdn.net` sits directly against
`~assets/parts?category=` from the app's own router path — Metro's string table
has packed two unrelated literals together. `expo-updates` is not a dependency
and `app.json` has no `updates` block, so there is no over-the-air fetch.

The 20 photographs are real files in the APK, not remote URLs: `assets/media/`
holds 10 photos and their 10 `-sm` variants, and the build packs all 20 as
`res/*.jpg`, 2,974,970 bytes. So the imagery renders with the radio off.

**What was not done: a launch on a real device or emulator.** This environment
has no Android SDK, no `adb` and no `/dev/kvm`, so an emulator cannot run here.
The evidence above is static — the archive is intact, the bundle is self-
contained and the imagery is bundled — and the screenshots are the web build of
the same components. A launch on a handset is the one check still outstanding,
and it needs a device.

### 3.3 Demo accounts

Both are seeded in `src/demo/activity.ts` and offered as one-tap cards on the sign
in screen, under "Demo access". The email and password path works too and
validates against the same records.

| Role | Email | Password | Name | Lands on |
| --- | --- | --- | --- | --- |
| Customer | `customer@oryx.demo` | `demo1234` | Ahmed Al Mannai / أحمد المناعي | `/(tabs)/home` |
| Merchant | `merchant@oryx.demo` | `demo1234` | Yousef Al Noor / يوسف النور | `/merchant/dashboard` |

Switching between them:

- **Merchant → customer:** store profile has a "Switch to customer" button.
- **Customer → merchant:** there is no button. Sign out from the account tab and
  take the merchant card, or sign in with the merchant email.

The second point is a real gap rather than a design choice:
`switchToMerchant` is defined in `i18n.ts` and never referenced, and the account
tab has no row for it. `switchRole` in `app-context.tsx` already toggles either
direction, so wiring a button on the account tab is a few lines — but it is a code
change, and this session is scoped to the hand-out. Recorded, not fixed.

### 3.4 Screens

47 screen captures of the marketplace, each in both themes, from the running app
on a 412×915 handset at 2× — 18 English screens (36 files) and 5 Arabic screens
(10 files), plus onboarding in dark only. That last one is deliberate: onboarding
is shown once before the theme control is reachable, so there is no light
counterpart to capture.

With the two contact sheets and the branded launch screen the pack holds **74
images**; the gallery page displays 26 of them (23 light-beside-dark pairs plus
the three sheets). An earlier draft of this report said "37 captures", which was
the count of English files alone, not screens or images.

The app is a self-contained demo, so each screen is reached by its own URL after
a one-tap demo sign-in. That is worth recording because an earlier revision of
the capture script drove the tab bar and silently produced the homepage 15 times:
the tab `href`s are the flattened route paths (`/mobile/home`), not the group
paths, and the wrong selector left every screen where it started.

Themes are genuinely different, not a tinted copy — mean luminance of the same
screen in each theme:

| Screen | Dark | Light |
| --- | --- | --- |
| Home | 26, 44, 58 | 179, 179, 175 |
| Parts | 48, 65, 80 | 224, 221, 217 |
| Wallet | 8, 34, 58 | 246, 244, 241 |
| Account | 14, 38, 60 | 242, 240, 236 |
| Sign in | 17, 38, 55 | 238, 235, 227 |

### 3.5 What each headline feature actually does

"Complete" means a screen exists, it reads seeded data through `repository.ts`,
and it can be driven end to end. "Simulated" means the screen and its data are
real but the thing it depicts is faked on a timer, and the UI says so.

| Feature | State | What it does |
| --- | --- | --- |
| Marketplace | Complete | Catalogue, categories, search, part detail, store pages, cart, checkout, orders, wallet, favourites, addresses |
| SENSAGE AI | Complete, offline | Pick a car, add photos, watch four named stages, get a scored report with findings and recommendations, in both languages. The analysis is seeded, not a model call — there is no network. |
| Recovery / towing | Screen complete, tracking simulated | Choose the issue, get a quote derived from it, submit, and follow the job. The status advance is a timer and the screen states that. |
| Order tracking | Complete | A four-step bar driven by real order status, so `SHIPPED` shows two steps done and `DELIVERED` shows four |
| Merchant panel | Complete | Dashboard with revenue, order mix and live queue; products, orders, services, promotions, plan and store profile. Every figure derives from the store's own orders, so tiles and lists cannot disagree. |

Nothing here is a placeholder screen. The honest caveats are the two above: the
SENSAGE analysis is seeded rather than computed, and the recovery tracking is a
labelled simulation. Both are appropriate for an offline demo and both are
disclosed in the UI rather than only in this report.

### 3.6 Arabic RTL

The app does not set `dir` on the document element; `Screen` and the text
components carry `direction` / `writingDirection` from the locale and reverse
rows with `flexDirection: row-reverse`. So the witness is the computed style of
the rendered tree:

| Locale | Elements computing to `rtl` |
| --- | --- |
| English | 1 |
| Arabic | 455 – 678, per screen |

### 3.7 The launch screen

Android 12 and later compose the launch screen from a window background and one
centred icon, so the photographic `splash.png` is not drawn on a current device —
it is used only on older releases. `apps/mobile/src/components/launch.tsx` covers
the moment after the platform splash until the stored session has been read, and
is what makes the photography visible on a modern handset.

The capture confirms it: the top band is the carwash photograph (luminance
standard deviation 31.4 — real image, not a flat field), and the footer is flat
navy at 21.7, which is the same navy as the platform splash, so there is no
colour step between them.

### 3.8 Review pack

`docs/audit/exec07/marketplace-demo/` — 75 files, 26 MB:

| Item | What it is |
| --- | --- |
| `pairs/` | 23 light-beside-dark composites, one per screen (light left, dark right) |
| `sheet-light.png`, `sheet-dark.png` | contact sheets of the whole app, one per theme |
| `launch-screen.png` | the branded launch screen |
| `live-homepage-light.png` | the web homepage in light theme, from the running site |
| 20 × `NN-*-light.png` / `NN-*-dark.png` | the full-resolution English captures |
| 5 × `ar-*-light.png` / `ar-*-dark.png` | the Arabic RTL pass |
| `00-onboarding-dark.png` | onboarding (dark only, see §3.4) |
| `index.html` | a browsable gallery of all of the above |

Committed rather than left in `.run/`, because `.run/evidence/` is gitignored by
design and the repository keeps reviewable evidence under `docs/audit/`.

---

### 3.9 Commits, and why they are not on the remote

Three commits are on `feature/execution-07-premium-web` locally:

| Commit | Subject |
| --- | --- |
| `d7a0a81` | chore(mobile): checkpoint the uncommitted marketplace work from the crashed session |
| `330bfc7` | feat(mobile): carry the brand through start-up on Android 12+ |
| *(this commit)* | docs(exec07): session recovery, and the marketplace demo evidence pack |

**The push did not succeed.** Both available credentials are expired:

| Credential | Result |
| --- | --- |
| `GITHUB_TOKEN` (`ghu_…`, 40 chars) | `401 Bad credentials` — `gh auth status` reports "The token in GITHUB_TOKEN is invalid" |
| Token embedded in `origin` (`ghu_bah…`) | `401` — `remote: Invalid username or token` |

There is no credential helper and no `~/.git-credentials`, so no third source.
`origin` was left exactly as it was found, with the original embedded token.

This is an environment problem, not a repository problem. Once a valid token is
available the work goes up with:

```bash
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/mohammadaljallad079-rgb/oryx.git"
git push origin feature/execution-07-premium-web
```

Until then the three commits exist only in this workspace. PR #7 still points at
`8cb372b` and its description has not been updated with this evidence, because
the branch it describes has not moved.

---

## 4. Verification

| Check | Result |
| --- | --- |
| `@oryx/mobile` tests | 46 / 46 passed, 3 files |
| `@oryx/shared` tests | 180 / 180 passed, 9 files |
| Light palette contrast | 33 / 33 meet threshold |
| Dark theme chrome movement | 0 of 31 captures |
| Gallery render | 26 images, 0 broken |
| Typecheck (`@oryx/mobile`, `tsc --noEmit`) | clean |
| Lint (`@oryx/mobile`, `eslint --max-warnings=0`) | clean |

## 5. Honest status

- The light theme needed no further correction. Phase E, already pushed, is the
  correction; this session re-measured it and found it complete. Re-editing it
  would have been churn, and would have risked the approved dark theme.
- The APK is a release build of the demo app. `apps/mobile/android/app/build.gradle`
  points the `release` build type at `signingConfigs.debug`, which is the Expo
  template default — it is signed with the debug keystore. That is fine for a
  demo hand-out and not for a store submission, which would need a real keystore.
- The APK is **not** committed; it is a local build output and
  `apps/mobile/.gitignore` excludes it. It is downloadable from this environment
  instead, through the preview proxy — see §3.1.
- The web captures in `docs/audit/exec07/phase-e/` predate this session and were
  left as they are; the new captures are the mobile marketplace pack.
- **The three local commits are not on the remote.** The push is blocked on an
  expired `GITHUB_TOKEN`; see §3.9. PR #7 is therefore unchanged.
- **Customer → merchant has no in-app switch.** The merchant profile can switch
  back to customer, but the customer account tab has no equivalent row, so the
  route back requires a sign-out. `switchRole` already handles both directions.
  Recorded in §3.3 rather than fixed, because it is a code change and this
  session is scoped to the hand-out.
- SENSAGE is an offline demo analysis, and recovery tracking is a labelled
  simulation. Neither is a model call or a live GPS feed. See §3.5.
- Not merged, no production deployment, no backend connected.
