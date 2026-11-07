# Execution 07 — fourth session: recovery, the gallery refresh, and the APK

The previous conversation ended with:

> Sandbox error — This conversation's sandbox encountered an error. The history
> above is read-only.

This records the recovery first, states plainly what is on the remote and what
was lost, and then finishes the work that was open when the sandbox died.

## 1. Recovery

| Item | Value |
| --- | --- |
| Repository | `mohammadaljallad079-rgb/oryx` |
| Branch | `feature/execution-07-premium-web` |
| `origin/feature/execution-07-premium-web` at session start | `af8544e2cb6b5e6721a8b3d3bb549eecb486285e` |
| Local `HEAD` at session start | `af8544e` (identical to the remote) |
| Owner-supplied "last confirmed push" | `b3c9a71eaeaea0eb4ae5aa1ab141a1511a10de37` |
| PR #7 | open, **draft**, head `af8544e`, base `audit/execution-05-verification`, not merged |
| PR #6 | open, not draft, head `audit/execution-05-verification`, base `main`, not merged |

### 1.1 The owner-supplied SHA is an ancestor, not the tip

`b3c9a71` exists and is an **ancestor** of the tip, 81 commits behind it:

```
$ git merge-base --is-ancestor b3c9a71 HEAD   # exits 0 — it is an ancestor
$ git rev-list --count b3c9a71..HEAD          # 81
```

The branch tip at the start of this session was `af8544e`, the splash
logo-duplication fix. **Nothing between `b3c9a71` and `af8544e` is missing.**

### 1.2 Was anything lost?

**No product work, and none is claimed as recovered.** The check was:

- **Local `HEAD` equalled the remote tip** at the start of the session, so the
  crashed sandbox had already pushed every commit it made.
- **The stash `safety-snapshot-exec07-mobile-marketplace`** is a pre-Phase-E
  snapshot of the *old* baseline (94 files, +9,226/−2,629). Every file it holds
  already exists on the remote in a later form. It contains no work the remote
  lacks.

If the crashed session made an edit and never wrote it to disk, that edit left no
trace and cannot be reconstructed. It is not reported as recovered.

### 1.3 The one commit this session added

| Commit | Contents |
| --- | --- |
| `a84af6f` | `docs(mobile): refresh the screen gallery to the rebuilt splash and homepage` |

## 2. The gallery had gone stale, and its index had lost two rows

The committed screen gallery was captured **before** the splash and homepage were
rebuilt to the approved references (`ef3d6d4`). Its `en/home.png`,
`ar/home.png`, `en/categories.png`, `ar/categories.png` and both launch frames
therefore showed the superseded layout. Re-running the sweep against the current
build fixed that.

Re-running it also exposed a second, quieter defect. The launch capture wrote no
manifest row: the screen sweep cannot see the launch screen, which is gone before
its first navigation, so a separate step had been adding those two entries by
hand. A re-run of the sweep alone therefore **silently dropped them**, and the
gallery index fell from 67 to 65 while the images themselves stayed on disk. The
launch script now merges its own rows, keyed by name, so either script can be
re-run alone without losing a frame.

The gallery is back to **67 screens** — 29 customer in English, 29 in Arabic, 7
in the merchant shell, and the launch screen in both locales.

## 3. The APK was rebuilt

The APK on disk was built **before** the splash and homepage rebuild, so it still
carried the duplicated `AUTO SERVICES` line and the superseded homepage. It has
been rebuilt from the current tree.

| Item | Value |
| --- | --- |
| Path | `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` |
| Size | 70,035,329 bytes (67 MiB) |
| SHA-256 | `9d343c55813323acf85d8d5ae8c8babe4ad52b93d80f4dfc7843c02e2690d457` |
| Entries | 1,316 — opens, no corrupt entry |
| Signature | APK Signature Scheme v2, debug keystore (`CN=Android Debug`) |
| Download | `https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/evidence/exec07-phase-e/apk/oryx-marketplace-1.0.0.apk` |

The served copy was downloaded through the proxy and re-hashed: it matches the
SHA-256 above.

The bundle inside the archive was checked for the fix that motivated the rebuild:
`AUTO SERVICES` appears **0** times as a literal the screen draws. The wordmark
artwork supplies those words, and the artwork is an image, so it is not in the
string table. The no-backend claims still hold unchanged — `fetch(` 0, `axios` 0,
`localhost:3001` 0, `10.0.2.2` 0, `/api/v1` 0 — and all 20 photographs are packed
as `res/*.jpg`, 2,974,970 bytes.

**A correction to the previous record.** It stated this environment "has no
Android SDK, no `adb` and no `/dev/kvm`". The first two are wrong: the SDK is at
`/home/openhands/android-sdk` and `adb` is present. Only `/dev/kvm` is missing,
which is what actually prevents an emulator. That record has been corrected.

## 4. The light theme

The owner's outstanding request was that the light theme "still looks
inconsistent and needs professional correction". It was re-measured rather than
re-edited, and the measurement says the correction is already in place:

| Check | Result |
| --- | --- |
| `.run/check-light-palette.mjs` | **33/33** pairs meet their threshold |
| `.run/probe-light-surfaces.mjs` | warmth spread across routes: **0.0** |
| Phase E light re-capture | 23 of 24 frames byte-identical; the 24th (a dark frame) differs by at most 2/255 per channel — antialiasing noise, not a theme change |

The surface probe samples the *painted* field on every customer route, including
the 404, and finds the same ivory `rgb(247, 244, 237)` everywhere. The palette is
centralised in one `:root[data-theme='light']` block per app; the only hard-coded
colours outside `globals.css` are two `themeColor` metadata values and two
comments. Re-editing a measured, working palette would have been churn and would
have risked the approved dark theme for no gain.

The dark theme is unchanged: its captures resolve to `--bg: #00162b`,
`--text: #eef3f9`, `--gold: #d4af37`, exactly as before.

## 5. Verification

| Check | Result |
| --- | --- |
| `@oryx/mobile` tests | 46 / 46 passed, 3 files |
| `@oryx/mobile` typecheck | clean |
| `@oryx/mobile` lint | clean, 0 warnings |
| Light palette contrast | 33 / 33 |
| Light surface consistency | 0.0 warmth spread |
| Screen gallery | 67 screens, index consistent with the images |
| APK | rebuilt, 1,316 entries, v2-signed, served copy re-hashed |

## 6. Honest status

- **No handset launch.** `/dev/kvm` is absent, so no emulator runs here. The APK
  evidence is static verification of the archive plus the web build of the same
  components. A device launch remains the outstanding step.
- **The APK is debug-signed** — the Expo template's `signingConfigs.debug`. Fine
  for a review hand-out, not for a store.
- **The APK is not committed**; it is a build output and `apps/mobile/.gitignore`
  excludes it. It is downloadable from this environment instead.
- **The light theme was not re-edited.** It was re-measured and found complete.
- **Nothing is claimed as recovered.** The crashed sandbox had pushed everything
  it wrote.
