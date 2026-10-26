# Design references — ORYX Marketplace

The two mockups the owner approved for the mobile application, kept in the
repository so the implementation can be checked against them at any time and so
they survive a lost sandbox.

| File | Size | Source |
| --- | --- | --- |
| `ORYX_Splash_Reference.jpg` | 1536×1024 | attached by the owner |
| `ORYX_Homepage_Reference.jpg` | 1536×1024 | attached by the owner |

Both are landscape 3:2 mockups. They are **references, not assets**: no mockup is
shipped in the bundle and none is used as a flat background image. Every element
is a React Native component.

## The official logo

The approved logo file is already in the repository. It was uploaded by the
owner to `main` in commit `699560c` ("Add files via upload").

| File | Size | Use |
| --- | --- | --- |
| `docs/assets/logo.png.jpeg` | 2000×2000 | the original upload, 11.6% of the canvas used |
| `apps/mobile/assets/brand/oryx-logo-on-dark.png` | 1404×320 RGBA | light artwork, for dark surfaces |
| `apps/mobile/assets/brand/oryx-logo-on-light.png` | 1404×320 RGBA | dark artwork, for light surfaces |

The artwork is the **ORYX** wordmark with **AUTO SERVICES** set beneath it. Both
colourways carry a real alpha channel, so the mark sits on any surface without a
plate behind it.

The logo is never redrawn, recoloured, or regenerated. If a reference mockup
shows a mark that differs from these files, the files win.

## What the mockups are measured to contain

Measured, not eyeballed — a colour and edge analysis of both files:

- The field is deep navy, `#02101d` to `#0e1a28`, with near-black bars at
  `#04050a`. This matches the approved `#00162b` family.
- **Splash:** a gold band across roughly 15–35% of the height, a navy field, then
  a bottom bar at `#040e18`. Logo high, car through the middle, indicator low.
- **Homepage:** a large warm gold region from about 30% to 85% of the height —
  the hero photography — and a dark bottom bar at `#06070b` carrying **no gold at
  all**, meaning no tab is highlighted in the reference. The active-tab treatment
  is therefore a decision for this implementation, not something to copy.

## Status

The layout has not been rewritten from these references yet. A vision model is
required to read the mockups in detail, and the model serving this session is
text-only. What is committed here is the groundwork: the references preserved,
the official logo located and verified, and the measurements above.
