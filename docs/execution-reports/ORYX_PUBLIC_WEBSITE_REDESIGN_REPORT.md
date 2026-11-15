# ORYX — Public Website Redesign Report (Automotive Services, Booking & Spare-Parts Commerce)

Status: **implemented, tested and running on an isolated public preview**. Nothing
is committed, pushed, merged or deployed. The owner reviews first.

## 1. Scope and constraints respected

- This is the **public customer-facing website** (`apps/customer`). The internal
  ERP dashboard (`apps/admin`) was not redesigned or replaced.
- No backend was rebuilt. The existing NestJS API, PostgreSQL schema, consumer
  authentication, booking engine, branches, products and inventory were reused.
  One additive API module (`StorefrontModule`) exposes the public catalogue,
  filters, cart quote, guest booking and contact endpoints; it duplicates no
  database and no ledger.
- The separate Vehicle Inspection & Sales Invoice workstream was not touched.
- No production data was changed. All preview traffic runs against the local
  seeded `oryx_dev` database.
- No push, merge, release or branch/worktree deletion was performed.

## 2. Brand identity

Approved colours only, used everywhere and in both themes:

| Token | Value | Use |
| --- | --- | --- |
| Navy | `#00162b` | Dark backgrounds, light-theme headings |
| Gold | `#d4af37` | Primary actions, highlights, accents |
| Ivory | `#f7f4ed` | Light-theme surfaces |

- The **official ORYX wordmark** from `docs/assets/` is used, recoloured per
  theme (`public/brand/oryx-logo.png`, `oryx-logo-dark.png`) plus the monogram as
  the Apple icon. No brand mark was invented.
- One font family throughout, with full Arabic + English coverage.
- No purple or blue-purple gradients; no unrelated brand colours.
- The theme switch repaints the header, hero slider, navigation, service cards,
  product cards, booking wizard, filters, cart and footer.

## 3. Header, hero slider and homepage

- Premium responsive header: logo, Home, Services, Book Appointment, Spare
  Parts, Offers, Branches, About ORYX, Contact, language switch, theme switch,
  customer login/register and a cart with a live item count. It stays usable
  while scrolling.
- **Hero slider is a real slider**: four distinct photographs, each with its own
  Arabic headline, description and CTA:

  | Slide | Photograph | Headline |
  | --- | --- | --- |
  | 1 Services | `hero-services.jpg` | خدمات السيارات المتكاملة في مكان واحد |
  | 2 Maintenance | `hero-maintenance.jpg` | عناية احترافية لسيارتك |
  | 3 Spare parts | `hero-parts.jpg` | قطع غيار لسيارتك بكل سهولة |
  | 4 Inspection | `hero-inspection.jpg` | افحص سيارتك بثقة |

  Autoplay, prev/next controls, visible pagination, pause on hover, touch swipe,
  per-slide CTAs and a fallback image on load error. No placeholder graphics.
- Trust strip below the hero (services, specialists, trusted parts, easy online
  booking, quality, service follow-up) — no invented statistics or ratings.
- Ten automotive service cards, each with a real photograph, title, description,
  "learn more" and "book" actions, using a clear image area separate from the
  information area.

## 4. Photography

All imagery is **real automotive photography** from Wikimedia Commons under the
licences recorded in `apps/customer/public/media/CREDITS.md`. Nothing is a
coloured placeholder, and no image is reused as a stand-in for another subject.

## 5. Online booking

A dedicated six-step booking page (service → branch → date → time → details →
confirm), wired to the real backend:

- Service and branch lists come from the database; three published branches.
- Available dates/times come from the branch schedule and resource availability.
  Unavailable slots are never shown, working hours and holidays are respected,
  and a database unique constraint plus a transactional lock prevent double
  bookings.
- Guest booking works and returns a real reference number; signed-in customers
  additionally see booking history under `account/appointments`.

## 6. Spare-parts store, filters and search

- Store listing over the real catalogue (**31 products**, 11 categories, 19
  brands) with product cards showing image, name, brand, part number/SKU, price
  in BHD, availability, compatible vehicles, details link, add-to-cart and
  wishlist.
- **Dynamic filters** that query the database: vehicle make/model/year, engine
  type, category, brand, part number, price range, availability, condition,
  discounted-only. Filters combine, show active indicators and counts, support a
  "clear all", a mobile filter drawer, and preserve state across navigation.
- Search matches name, SKU and part number with autocomplete from real catalogue
  records and an honest empty state. Sorting by price, newest and name.
- Selecting a vehicle filters to parts whose compatibility exists in the
  database — compatibility is never implied.

## 7. Product details, cart and checkout

- Product detail page: gallery, name, brand, SKU, price, availability,
  description, specifications, a real compatible-vehicles table, warranty when
  present, quantity selector, add-to-cart, wishlist and related products.
- Cart: add/remove, change quantity, live totals, images and stock checks,
  priced **server-side** via the cart-quote endpoint (no client-side money math).
- Checkout: customer details, delivery/collection, branch selection, shipping
  address, order summary with taxes and discounts, payment method and order
  confirmation. Orders are persisted as `WebOrder` rows. No fake payment success:
  the flow reuses the existing payment system and never marks an intent paid
  without a verified confirmation.

## 8. Branches, About, Contact, Offers, Footer, Account

- Branches: name, address, contact, hours, services and map link when
  coordinates exist, all from the database.
- About ORYX: introduction, mission/values, expertise, services and quality
  commitment with real workshop photography — no invented history or
  certifications.
- Contact: form saved by the backend, plus phone, email, branches, hours and
  social links where configured.
- Offers: discounted products, service offers and featured products, with
  original and discounted prices taken from the database.
- Footer: logo, introduction, quick links, services, spare parts, booking,
  branch contacts, social links, privacy policy and terms — in both themes.
- Customer account: register, sign in, profile, vehicles/garage, appointments,
  order history, saved addresses, wishlist and notifications, reusing the
  existing consumer identity plane.

## 9. Arabic / English, responsive design and SEO

- Arabic is the default and RTL; English is complete LTR. Direction, navigation,
  product and service copy, the booking interface, and date/currency formatting
  (BHD, three decimals) all localise.
- Responsive from large desktop down to handset: responsive navigation, sized
  images, mobile slider, mobile-friendly booking, a filter drawer, responsive
  product grids and no horizontal overflow. The mobile experience is designed,
  not shrunk.
- SEO: canonical URLs per route, page titles and meta descriptions, Open Graph,
  Twitter cards, **Product schema** on product pages, **Service schema** on
  service pages, **AutoRepair / LocalBusiness** schema (address + branches) on
  the home and branches pages, a 51-URL sitemap generated from the live
  catalogue, robots configuration, and `next/image`-style loading with lazy
  loading and alt text.

## 10. Verification

### 10.1 Automated suites

| Suite | Result |
| --- | --- |
| Shared unit (`@oryx/shared`) | **93 passed** |
| API integration (`@oryx/api test:e2e`) | **218 passed** (8 suites) |
| Customer browser (`apps/customer` Playwright) | **40 passed** (20 desktop + 20 mobile) |
| Admin browser (`@oryx/admin test:ui`) | **121 passed** (verified earlier this session) |
| Mobile unit (`@oryx/mobile`) | **17 passed** |

Customer browser coverage includes: hero is a real four-photograph slider; trust,
service and product sections; all ten services plus a detail page; store listing
and category filtering; search with an honest empty state; product detail with
price/availability/compatibility/add-to-cart; server-quoted cart and checkout;
guest booking returning a reference; branches/about/contact/offers pages; the
contact form saving to the backend; signed-in account appointments and wishlist;
theme switching; language switching; the new canonical + JSON-LD assertions; and
no horizontal overflow on any primary page.

### 10.2 Live preview checks (through the public host)

- Home, store, product, service, booking, branches, about, contact, offers,
  cart and checkout all return HTTP 200.
- `GET /api/v1/storefront/products` returns real rows; the store renders 31
  products.
- `/sitemap.xml` emits **51 URLs**; `/robots.txt` disallows `/account` and
  `/checkout`.
- JSON-LD present: `AutoRepair` + `PostalAddress` on the home page; `Product` +
  `Offer` + `Brand` on a product page (`priceCurrency: BHD`, `InStock`); `Service`
  on a service page. Canonical URLs verified on eight routes.
- 50 screenshots captured (Arabic dark and English light; desktop, tablet and
  mobile) into `docs/execution-reports/screenshots/`, all size-verified
  non-blank.

## 11. Fixes made in this session

- **Same-origin API base.** The browser client now uses a relative `/api` base
  and `next.config.ts` proxies `/api/*` to the API server, so the consumer
  refresh cookie is same-origin in local runs and behind a single preview host.
  Server-side SEO fetches use an absolute `ORYX_API_BASE_URL`.
- **Structured data added** (Product, Service, AutoRepair) plus per-route
  canonical URLs, satisfying requirement 20.
- Earlier fixes retained: sitemap pagination (API caps `pageSize` at 60),
  booking slot-reload guard, `clearCart` helper, and content-page test regexes.

## 12. Preview

| Surface | URL |
| --- | --- |
| Public website (preview) | https://work-1-ukfvcntbstnpjhcd.prod-runtime.all-hands.dev/ |
| API (same host) | https://work-1-ukfvcntbstnpjhcd.prod-runtime.all-hands.dev/api/v1 |

Runs locally as: API on `:3001`, customer site on `:3002`, preview proxy on
`:12000`.

## 13. Awaiting approval

No push, merge, release or production deployment has been performed. The owner
reviews the preview, screenshots and test results before any of those steps.
