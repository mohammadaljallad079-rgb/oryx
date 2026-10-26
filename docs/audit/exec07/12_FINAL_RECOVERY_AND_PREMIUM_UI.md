# Execution 07 — final recovery, the premium UI, and the APK hand-out

This session began from a crashed conversation. It records what the remote
actually held, what was wrong with the rebuilt Splash and Homepage, what was
changed, and the APK that was built from the result.

Everything below was measured in this session. Nothing is carried over from a
previous report without saying so.

---

## 1. Recovery

| Item | Value |
| --- | --- |
| Repository | `mohammadaljallad079-rgb/oryx` |
| Branch | `feature/execution-07-premium-web` |
| Remote tip at session start | `af8544e2cb6b5e6721a8b3d3bb549eecb486285e` |
| PR #7 | open, **draft**, base `audit/execution-05-verification`, not merged |
| Local `HEAD` at session start | `af8544e` (identical to the remote) |

### 1.1 The remote moved twice during the session

The branch was not still at `af8544e` when this session first tried to push. A
parallel session had pushed two commits:

| Commit | Subject |
| --- | --- |
| `a84af6f` | `docs(mobile): refresh the screen gallery to the rebuilt splash and homepage` |
| `f97a8f6` | `docs(exec07): record the recovery, the gallery refresh and the rebuilt APK` |

Both were read before anything was written. Neither was discarded, reset or
force-pushed over: the local work was rebased onto `f97a8f6`, and the only
conflicts were in regenerated evidence (the gallery PNGs and the manifest), which
was re-cut from the merged tree rather than chosen from either side.

### 1.2 Was anything lost?

No.

- No reset, no force push, no rebase of published history.
- The parallel session's two commits are ancestors of the current tip.
- `f97a8f6` claims an APK at SHA-256 `9d343c55…`. That build predates this
  session's changes, so it is **superseded** by the one in §5 rather than kept.

### 1.3 A correction about this environment

`f97a8f6` records that the Android SDK is at `/home/openhands/android-sdk` and
that `adb` is present. **That is not true in this sandbox.** Checked directly:

```
$ ls /home/openhands/android-sdk        -> No such file or directory
$ ls /usr/lib/jvm                       -> No such file or directory
$ which java javac                      -> (nothing)
```

There is no JDK and no Android SDK here, so the APK cannot be built in this
environment at all. It is built on a GitHub runner instead (§5). The earlier
record was written in a different sandbox; the difference is real and is stated
rather than repeated.

---

## 2. What was wrong with the Splash and the Homepage

The rebuild in `ef3d6d4` was a large improvement over the old screen, but it had
two defects, and one of them was a functional loss rather than a styling
difference.

### 2.1 The homepage had lost two sections

Compared against the version it replaced (`ef3d6d4^`):

| Section | Before `ef3d6d4` | After `ef3d6d4` |
| --- | --- | --- |
| Offers and discounts | present (`repository.offers()`) | **gone** |
| Featured stores | present (`repository.stores()`) | **gone** |

The owner's brief names both. So the page did not only change shape; it stopped
showing two catalogues the app already had data for. Both are restored in §3.

### 2.2 The reference file names are swapped, confirmed independently

The brief says the Splash reference is `ORYX_Splash_Reference.jpg` and the
Homepage reference is `ORYX_Homepage_Reference.jpg`. The files carry the opposite
content, and this session re-derived that from the files rather than trusting the
previous session's note. OCR over each phone screen (`tesseract`, `eng` + `ara`):

| File | What its two screens actually show |
| --- | --- |
| `ORYX_Splash_Reference.jpg` | the **full marketplace homepage** — wordmark header, hero with "Everything Your Car Needs", a search field, five category tiles (Spare Parts, Maintenance, Car Inspection, Towing, Accessories), a SENSAGE AI card beside a "Book a Service" tile, Featured Providers with ratings, Popular Products, and a five-item bottom bar |
| `ORYX_Homepage_Reference.jpg` | a **hero-only composition** — the photograph, the wordmark, the tagline and the three-part subtitle. No bottom bar, no rails |

The implementation therefore follows content, not file name: the Splash is built
from the hero composition and the Homepage from the marketplace page. This is the
same conclusion the previous session recorded, reached here by a separate reading.

### 2.3 The splash muted its own photograph

In the splash the top navy band was a full-frame scrim, so the vehicle
photograph was covered across the middle of the frame. The reference shows the
photograph reading through the centre, lit, with navy only at the top and bottom.
The top band now fades out the way the bottom one does.

---

## 3. What was changed

### 3.1 Homepage — the two lost sections are back

- **Offers and discounts** — a rail of `OfferCard` tiles from `repository.offers()`,
  with a "See all" action and a loading state, matching the other rails.
- **Featured stores** — the top four by rating from `repository.stores()`, same
  treatment.
- **A gold "Explore now" call to action** in the hero, which the reference shows
  under the search field and the previous build did not have.

### 3.2 A display bug found while restoring

An offer with no percentage — "Free delivery over 30 BHD", `percentOff: 0` —
rendered the badge **"off 0%"**. It now shows its promo code (`FREEDEL`) instead,
and nothing when it has neither. This affected the merchant promotions screen too,
which shares the card.

### 3.3 Design tokens

The fixed brand palette — navy, navy-deep, gold and the on-navy inks — moved into
`lib/theme.ts` as `brand`. The splash, the hero and every piece of type sitting
on photography now read it instead of repeating literals, so the identity is
defined once. No visible colour changed.

### 3.4 The launch capture harness

`capture-mobile-launch.mjs` watched for a string the splash no longer draws (the
wordmark is an image now), so it silently captured nothing. It watches the
tagline. The parallel session's change to the same file — merging its own rows
into the manifest so a re-run cannot drop the launch frames — was kept.

---

## 4. Evidence

All of it is under `docs/audit/exec07/` and committed.

| Path | What it holds |
| --- | --- |
| `splash-home/` | Splash in both locales at two widths; Home in both languages, both themes and three widths; a three-part scrolled pass per locale and theme; four reference-versus-implemented sheets |
| `splash-home/home-*-part{1,2,3}.png` | The scrolled pass. **Parts 2 and 3 are where the restored offers and stores are visible** — the page is taller than a handset |
| `splash-home/compare-{splash,home}-{en,ar}.png` | Approved mockup beside the running app |
| `marketplace-demo/screenshots/` | The 67-screen gallery, its contact sheet and its manifest |
| `marketplace-demo/README.md` | The index, with a GitHub link per screen |

### 4.1 Honest limits on the visual comparison

**This environment has no working vision.** The image tool reports that a file
was read; it does not return the pixels, so the composition was **not** judged by
eye. Everything claimed about the references was derived programmatically:

- OCR (`tesseract` with `eng` + `ara`) for the copy and the section order;
- row-wise luminance and horizontal-edge profiles for the vertical composition
  (where the photograph is, where the type sits, where the bars begin);
- bright-pixel bounding boxes for the logo's placement and alignment;
- the rendered DOM's `innerText` for what the app actually draws.

So the comparison sheets are published for **the owner to judge**, and no claim
of pixel-match is made. What is claimed is: the sections the reference shows are
present, in the reference's order, with the reference's copy, and the palette is
the approved navy and gold.

---

## 5. The APK

There is no JDK and no Android SDK in this environment (§1.3), so the APK is built
by `.github/workflows/mobile-apk.yml` on a GitHub runner.

| Item | Value |
| --- | --- |
| Workflow | `.github/workflows/mobile-apk.yml` |
| Trigger | `workflow_dispatch` (manual), plus a path-scoped push on the app, the shared package and the workflow itself |
| Run | [40271089404](https://github.com/mohammadaljallad079-rgb/oryx/actions/runs/40271089404) — **success** |
| Built commit | `88d3296631dd17e9d0e9167b9b16abac0b7b5837` (`88d3296`) |
| Commit subject | `fix(ci): stop using the setup-android action that cannot install` |
| APK size | **70,037,349 bytes** (66.8 MiB) |
| SHA-256 | `e6d4e5e9a0c9f03bfc16b35f73261632003c77fad588339bfe2a699fb9a5a240` |
| Signature | debug keystore — the Expo template's `release` build type |
| Artifact | `oryx-marketplace-88d3296`, 32,825,462 bytes (zipped), expires 2027-01-24 |

**Artifact download** — the stable channel. Sign in to GitHub, then either open
the run above and take `oryx-marketplace-88d3296` from its Artifacts section, or:

```bash
gh run download 40271089404 --repo mohammadaljallad079-rgb/oryx --name oryx-marketplace-88d3296
```

That yields `app-release.apk` and `oryx-marketplace.apk.sha256`. The artifact
holds the raw APK; the smaller number above is the zip's own size.

The workflow typechecks, lints and tests the app; generates the native project
with `expo prebuild`; builds the release APK; hashes it; writes the commit, the
size and the SHA-256 into the run summary; and **fails if the bundled JavaScript
references a backend host**, so the offline claim cannot silently regress.

### 5.1 The APK was verified after download, not assumed

The artifact was downloaded and checked in this session:

| Check | Result |
| --- | --- |
| `sha256sum app-release.apk` | matches the `.sha256` file and the run summary exactly |
| Size | 70,037,349 bytes |
| Archive integrity (`zipfile.testzip`) | 1,316 entries, **0 corrupt** |
| `AndroidManifest.xml`, `classes*.dex`, `index.android.bundle` | all present |
| The bundle carries the restored homepage | `offersAndDiscounts`, `featuredStores`, `Offers and discounts`, `Featured stores`, `offer-card-`, `store-card-` and `exploreNow` each appear |
| No backend host in the bundle | `localhost:3001` 0, `10.0.2.2` 0, `/api/v1` 0, `axios` 0, `fetch(` 0 |
| The duplicated splash line is gone | `AUTO SERVICES` appears 0 times as drawn text |

So the APK is the current design, and it is offline: the imagery is bundled and
no screen reaches a host.

**The APK is the tip's design.** Commits after `88d3296` are documentation only —
none of them touches `apps/mobile`, `packages/shared` or the workflow, which is
why none of them retriggered the build. The mobile source in `88d3296` is
byte-identical to the mobile source on the branch tip.

Three defects were found and fixed while getting it to run — each one only
visible on the runner:

1. `workflow_dispatch` is not offered in the Actions UI until the file exists on
   the default branch, so a dispatch from this feature branch was unreachable. A
   path-scoped push trigger makes it runnable now.
2. The workflow-lint step ran before checkout, so the container action saw an
   empty workspace. Checkout now comes first, as `ci.yml` does.
3. `android-actions/setup-android@v3` installs the legacy `tools` package, which
   the SDK repository no longer publishes, so it failed every run. The runner
   image already ships the SDK; the step now points `ANDROID_HOME` at it and
   accepts the licences.

**What is not claimed: a launch on a handset or emulator.** `/dev/kvm` is absent,
so no emulator runs here, and there is no attached device. The APK evidence is
the build succeeding, the archive being produced and hashed, and the offline
bundle check passing. A device launch is the one check still outstanding, and it
needs the device.

---

## 6. Verification

| Check | Result |
| --- | --- |
| `@oryx/mobile` tests | 46 / 46 passed, 3 files |
| `@oryx/shared` tests | 180 / 180 passed, 9 files |
| `@oryx/mobile` typecheck | clean |
| `@oryx/mobile` lint | clean, 0 warnings |
| `actionlint` 1.7.12 + `shellcheck` 0.10.0 | clean over every workflow |
| Homepage offers rail | present, verified by OCR of `home-light-en-part2.png` |
| Homepage featured stores | present, verified by OCR of `home-light-en-part3.png` |
| Screen gallery | 67 screens, manifest consistent with the images |
| APK build | see §5 and the run summary for the commit, size and SHA-256 |

---

## 7. Honest status

- **The homepage's two lost sections are restored** and are visible in the
  committed scrolled captures.
- **The splash composition was corrected**, not merely re-tinted: the photograph
  now reads through the middle of the frame.
- **The reference-versus-implemented judgement is the owner's.** This environment
  cannot see images (§4.1); the sheets are published for review.
- **The APK is debug-signed.** Fine for a review hand-out, not for a store.
- **No handset launch.** No `/dev/kvm`, no device.
- **PR #7 is left as a draft** and is not merged, per the brief.
- **The internal ERP was not touched**, no backend was wired, and no payment
  gateway was connected.
