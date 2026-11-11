# Approved design baseline — ORYX Marketplace

Frozen record of the approved Splash and Homepage. This file exists so a later
change cannot silently replace the approved design, and so a future reader can
tell whether the screenshots in the repository are the ones that were signed off.

**Baseline commit:** `56a1e63a520dcd10dcf2032418b95f8a4f92984a`

---

## 1. The two reference images, and why their filenames mislead

The owner's mockups are stored under names that are **the wrong way round**.
This was established by reading each file's content, not its name: OCR over both
finds that the file called "Splash" carries twenty homepage sections (header,
hero, search, five category tiles, SENSAGE, providers, products, five-item bottom
bar), while the file called "Homepage" carries only the lockup, the tagline, the
subtitle and a loader.

The implementation follows the **content**. Do not "fix" this by renaming the
files — that would break every report and commit message that references them by
their committed path.

| File | What it actually is | Bytes | SHA-256 | Content |
| --- | --- | --- | --- | --- |
| `apps/mobile/design-reference/ORYX_Homepage_Reference.jpg` | **SPLASH** | 298,578 | `b17d3edf7e1c22b55924ee0a93dbc1c4aef32b98e0f74020e2b7bdc636fcd7d8` | the hero-only composition: lockup, tagline, subtitle, loader |
| `apps/mobile/design-reference/ORYX_Splash_Reference.jpg` | **HOMEPAGE** | 244,745 | `fb424f11da7ef2f18a0e4612fd748f17282a37fd6b7a30cb2afa8954b1b334de` | the full marketplace page: header, hero, search, categories, SENSAGE, providers, products, bottom bar |

## 2. The approved screenshots

These are the captures of the approved implementation, taken from the running
application. They are the visual target for the Android build.

| File | Screen | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `docs/audit/exec07/splash-home/splash-en-phone.png` | Splash, English | 1,111,037 | `06f14238411193b588a86d71b6c42656ca4cea47feafd2eeafab0f7b9b4e941b` |
| `docs/audit/exec07/splash-home/splash-ar-phone.png` | Splash, العربية | 1,104,184 | `d8fcaff94a3644921c2a915b483cac32c5b8cebdc7e7bd7fdd4b670c27c199a4` |
| `docs/audit/exec07/splash-home/home-dark-en-phone.png` | Homepage, English, dark | 580,041 | `c8b7b4df3439b77c48fc966c8207e13a799b4d45b52e75b5f86eff07bb189610` |
| `docs/audit/exec07/splash-home/home-dark-ar-phone.png` | Homepage, العربية, dark | 517,604 | `feb9cd06062792b8723e0796e33de64e39640b86e3c18f8410e70aedcdd14fcb` |

**Caveat that must travel with these images.** They are **web captures** of the
Expo web export — the same React Native components the APK ships, rendered by
`react-native-web`. They are not native Android screenshots. See
`docs/audit/exec07/android-crash/` for the Android captures.

## 3. The scene asset

The Splash and the Homepage hero use one photograph, extracted from the approved
mockup by `.run/extract-scene.py`. That script masks the device chrome (status
bar, lockup, tagline, subtitle, loader) at glyph precision and inpaints it from
the surrounding pixels, leaving the approved scene.

The vehicle band — 45–85% of the frame — is **never** masked. An earlier version
of the script masked `y 360–700` as one band, which is exactly where the car is,
and destroyed it.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `apps/mobile/assets/media/splash-scene.jpg` | 119,332 | `80d11b40ba3ee99709bac37d05e51e1b86ef14b421cc33bbc956ba4556d6dbde` |

Measured detail retained across the vehicle band: 19.9 / 26.0 / 17.7, against
20.3 / 26.3 / 16.1 in the source.

## 4. Palette

| Token | Value |
| --- | --- |
| Deep navy | `#00162b` |
| Secondary navy | `#061b32` |
| Luxury gold | `#c6a15b` |
| Warm gold | `#d7b878` |
| Ivory | `#f7f4ed` |

`apps/mobile/src/lib/theme.ts` is the single source. A screen reads a token; it
never hard-codes a colour. The one documented exception is `GOLDEN_HOUR` in
`launch.tsx`, the warm wash over the splash photograph.

## 5. Rules that protect this baseline

- Do not replace the approved scene with a different photograph, and do not
  recolour a different photograph to approximate it. Recolouring cannot change
  composition; an earlier attempt scored **−0.548** correlation with the reference
  because the compositions were inverted.
- Do not change the official logo. `apps/mobile/assets/brand/oryx-logo-on-dark.png`
  and `-on-light.png` are the artwork.
- Do not rename the reference files.
- If the design changes, update this file in the same commit, with new hashes, and
  say so in the commit message.

---

*Written by an AI agent (OpenHands) on behalf of the repository owner.*
