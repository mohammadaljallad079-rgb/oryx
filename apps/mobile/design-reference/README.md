# Design references — ORYX Marketplace

The two mockups the owner approved for the mobile application, kept in the
repository so the implementation can be checked against them at any time and so
they survive a lost sandbox.

| File | Size | Source |
| --- | --- | --- |
| `ORYX_Splash_Reference.jpg` | 1536×1024 | attached by the owner |
| `ORYX_Homepage_Reference.jpg` | 1536×1024 | attached by the owner |

Both are landscape 3:2 mockups, each carrying **two phone screens side by side**
(English on the left, Arabic on the right). They are **references, not assets**:
no mockup is shipped in the bundle and none is used as a flat background image.
Every element is a React Native component.

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

## What the mockups actually contain

Read by OCR (`tesseract`, `eng` + `ara`) over each phone screen, not eyeballed.
The extraction is reproducible with `.run/capture-splash-home.mjs`, and the
reference-versus-implemented sheets are in `docs/audit/exec07/splash-home/`.

### `ORYX_Splash_Reference.jpg` — carries the **homepage** design

Its two phone screens show the full marketplace home, top to bottom:

- wordmark header, then the hero with **“Everything Your Car Needs”** and
  **“Parts + Services + Trusted Providers”**;
- a search field reading *“Search for parts, services, or providers…”*;
- five category tiles: **Spare Parts, Maintenance, Car Inspection, Towing,
  Accessories**;
- the **SENSAGE AI** card beside a **Book a Service** tile;
- **Featured Providers** — “BMW Service Center 4.8”, “Bridgestone Tires 4.7”,
  “4.6 (280)”;
- **Popular Products**;
- a bottom bar with five items: **Home, Categories, Search, Bookings, Profile**.

That is the homepage. The file name says otherwise.

### `ORYX_Homepage_Reference.jpg` — carries a **hero / splash** composition

Its two phone screens show a large photographic hero under warm golden light with
the wordmark, the tagline and the three-part subtitle. There is **no bottom
navigation bar, no category rail, no provider rail and no product rail** — the
composition is the photograph plus the brand lockup.

### The two names are swapped relative to their content

The owner's brief describes the splash as a cinematic frame and the homepage as
the full marketplace page. The files carry the opposite names. The implementation
therefore follows **content**, not file name:

| Implemented screen | Built from |
| --- | --- |
| Splash | the hero composition in `ORYX_Homepage_Reference.jpg` + the owner's written brief |
| Homepage | the marketplace page in `ORYX_Splash_Reference.jpg` |

This is recorded rather than silently worked around, because a future reader who
trusts the file names will build the wrong screen.

### The reference's bottom bar carries no gold

In the homepage reference the bottom bar is a plain navy strip with **no
highlighted item** — no tab carries gold. The active-tab treatment is therefore a
decision for this implementation, not something copied from the reference: the
app tints the active item with the theme accent so the current destination is
identifiable.

## Status

The Splash and the Homepage are rebuilt against these references and captured in
both languages, in the light and dark themes and at phone, tablet and desktop
widths. See `docs/audit/exec07/splash-home/` for the captures and the
reference-versus-implemented sheets.

### What the references are checked against

The references carry no machine-readable structure, so the implementation was
compared to them programmatically rather than by eye:

- **OCR** (`tesseract`, `eng` + `ara`) for the copy and the order of the sections.
  This is what established that the two files are named the wrong way round.
- **Row-wise luminance and horizontal-edge profiles** for the vertical
  composition — where the photograph is, where the type sits, where the bars begin.
- **Bright-pixel bounding boxes** for the logo's placement. In the hero reference
  the lockup is centred; the splash centres it too.
- **The rendered DOM's text** for what the app actually draws, so a claim about a
  section is checked against the screen and not against the source.

The homepage is taller than a handset, so the **offers** and the **featured
stores** — two sections the approved rebuild had dropped and this branch restores
— only appear in the scrolled captures: `home-<theme>-<locale>-part2.png` and
`part3.png`.

The remaining demo screens have not been re-measured against these references;
only the two the owner named were rebuilt.
