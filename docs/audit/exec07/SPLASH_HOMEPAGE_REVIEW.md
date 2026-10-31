# Splash and Homepage — review request

**Status: awaiting the owner's visual approval. No APK has been built for this change.**

---

## What changed, and why the earlier attempts failed

The hero was never the approved photograph. Earlier builds took a bundled garage
image and recoloured it to match the reference's average tone. Recolouring cannot
change composition, so the screen never resembled the design.

**The blocker, stated plainly.** This environment cannot see images. That is not
an assumption — it was tested. A purple triangle on a white background was
generated with its answer sealed in a file; the image tool reported "read
successfully" and returned no pixels at all. Every earlier claim of visual
verification was therefore unsupported, and the numerical scores that were
reported measured colour statistics, not resemblance.

The work below follows the written specification, and the screenshots are
produced for you to judge.

---

## 1. Which reference is which

The filenames are swapped. OCR over both files, reading composition rather than
the name:

| File | What it actually contains |
| --- | --- |
| `ORYX_Splash_Reference.jpg` | **HOMEPAGE** — 20 sections: header, hero, search, five category tiles, SENSAGE, featured providers, popular products, five-item bottom bar |
| `ORYX_Homepage_Reference.jpg` | **SPLASH** — four elements: the ORYX lockup, the tagline, the subtitle, the loader |

The implementation follows the content.

---

## 2. The approved references

| Screen | Reference |
| --- | --- |
| Splash | [`ORYX_Homepage_Reference.jpg`](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/apps/mobile/design-reference/ORYX_Homepage_Reference.jpg) |
| Homepage | [`ORYX_Splash_Reference.jpg`](https://github.com/mohammadaljallad-rgb/oryx/blob/feature/execution-07-premium-web/apps/mobile/design-reference/ORYX_Splash_Reference.jpg) |

---

## 3. The new screenshots — **WEB CAPTURES**

Captured from the Expo web export of the same components the APK ships. These are
**not** native Android screenshots; no emulator runs in this environment. The
imagery is bundled, so the native build renders the same scenes.

### Splash

| English | العربية |
| --- | --- |
| [splash-en-phone.png](splash-home/splash-en-phone.png) | [splash-ar-phone.png](splash-home/splash-ar-phone.png) |
| [splash-en-tablet.png](splash-home/splash-en-tablet.png) | [splash-ar-tablet.png](splash-home/splash-ar-tablet.png) |

### Homepage

| English, dark | العربية, داكن | English, light | العربية, فاتح |
| --- | --- | --- | --- |
| [home-dark-en-phone.png](splash-home/home-dark-en-phone.png) | [home-dark-ar-phone.png](splash-home/home-dark-ar-phone.png) | [home-light-en-phone.png](splash-home/home-light-en-phone.png) | [home-light-ar-phone.png](splash-home/home-light-ar-phone.png) |

### Homepage scrolled — Offers and Stores

| Offers | Stores |
| --- | --- |
| [home-light-en-part2.png](splash-home/home-light-en-part2.png) | [home-light-en-part3.png](splash-home/home-light-en-part3.png) |

---

## 4. Side-by-side comparisons

Left: the approved reference. Right: the implemented application.

| Screen | Comparison |
| --- | --- |
| Splash, English | [compare-splash-en.png](splash-home/compare-splash-en.png) |
| Splash, العربية | [compare-splash-ar.png](splash-home/compare-splash-ar.png) |
| Homepage, English | [compare-home-en.png](splash-home/compare-home-en.png) |
| Homepage, العربية | [compare-home-ar.png](splash-home/compare-home-ar.png) |

---

## 5. How the scene was built

`.run/extract-scene.py` produces the splash scene from the approved mockup.

The previous extractor masked `y 360–700` as one band. That band is where the car
is, so it erased the vehicle. This one measures the scene first and masks only
genuine text, at glyph precision:

| Band | Content | Masked? |
| --- | --- | --- |
| 0–8% | OS status bar | yes |
| 8–25% | sky, with the lockup at 24% | lockup only |
| 25–45% | sky and horizon, lit | no |
| **45–85%** | **the vehicle** (detail 20–26) | **never** |
| 85–100% | road and shadow | no |
| 75.2% / 79.6% | tagline, two lines | glyphs only |
| 84.3% | subtitle | glyphs only |

Detail retained across the vehicle band: **19.9 / 26.0 / 17.7**, against
**20.3 / 26.3 / 16.1** in the source. The car survives.

The splash then draws the real UI text at those measured positions, so the
repaired pixels sit under the text that belongs there rather than under a visible
smudge. Nothing is a flattened screenshot: every element is a React Native
component.

---

## 6. What is verified, and what is not

**Verified**

| Check | Result |
| --- | --- |
| Mobile tests | 46 / 46 |
| TypeScript | clean |
| Lint | clean, 0 warnings |
| Functional audit, 37 routes | 0 white screens, 0 console errors, 0 error states |
| Offers rail and featured stores | present, confirmed in the scrolled captures |
| Splash luminance correlation | 0.85 (was −0.548) |

**Not verified**

- **No visual judgement.** This environment cannot see images. The comparison
  sheets exist for you to judge; no claim of resemblance is made.
- **No native Android screenshot and no device launch.** No `/dev/kvm`, no
  attached device. These are web captures of the same components.
- **No APK built.** Per the specification, the APK is built only after these two
  screens are approved.

---

## 7. What I need from you

Please open the four comparison sheets and tell me **what specifically differs**.
I cannot see them, so a description such as "the hero is too short", "the car is
cut off", "the tagline is too small", or "the categories should be two rows" is
what I can act on. A general "still wrong" cannot be resolved by me alone.

---

*This page was written by an AI agent (OpenHands) on behalf of the repository owner.*
