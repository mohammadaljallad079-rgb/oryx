# ORYX Marketplace — screen gallery

Every screen of `apps/mobile`, captured from the running app. 65
images: 29 customer screens in English, 29 in Arabic,
7 in the merchant shell, and the launch screen in both locales.


- [Contact sheet](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/contact-sheet.png) — all of them in one image
- [Browse the machine-readable manifest](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/manifest.json)

All of them are the **light theme** — Execution 07 Phase E is the light-theme
correction, so that is the theme under review. The app's stored default is the
dark theme; the approved dark captures live one directory up, in
[`../`](https://github.com/mohammadaljallad079-rgb/oryx/tree/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo),
one per screen beside its light counterpart.

## How these were taken

The web export of the same components the APK ships (`expo export --platform
web`), at 430×932 with a 2× device scale — a handset frame. The stored session
and the locale are seeded before the bundle runs, so the sweep navigates *inside*
the app.

That last detail matters: a full page reload drops the in-memory access token, so
driving the app by reloading a URL per screen produces a sign-in page or an error
for every route past the first. Navigating internally is what makes these
captures the real screens.

The APK is the native build of exactly these components; the imagery is bundled,
not remote, so the same screens render with the radio off.

## The rebuilt Splash and Homepage

The two screens the owner named are rebuilt against the approved mockups and
captured in both languages, both themes and three widths. The reference-versus-
implemented sheets are in
[`../splash-home/`](https://github.com/mohammadaljallad079-rgb/oryx/tree/feature/execution-07-premium-web/docs/audit/exec07/splash-home)
— `compare-splash-en.png`, `compare-splash-ar.png`, `compare-home-en.png`
and `compare-home-ar.png`.

The homepage is taller than a handset, so the rails below the fold — **offers and
discounts** and the **featured stores** — are only visible in a scrolled capture.
Those are committed as `home-light-en-part2.png` and `home-light-en-part3.png`
(and their dark and Arabic counterparts) beside the first-frame shots.

## Launch screen

| Screen | Route | View | Image |
| --- | --- | --- | --- |

## Customer — English (LTR)

| Screen | Route | View | Image |
| --- | --- | --- | --- |
| Onboarding | `/onboarding` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/onboarding.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/onboarding.png) |
| Sign in | `/login` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/login.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/login.png) |
| Home | `/home` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/home.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/home.png) |
| Categories | `/categories` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/categories.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/categories.png) |
| Search | `/search` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/search.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/search.png) |
| Parts shop | `/parts` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/parts.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/parts.png) |
| Part detail | `/parts/prod-001` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/part-detail.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/part-detail.png) |
| Store | `/parts/store/store-01` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/store.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/store.png) |
| Service directory | `/services` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/services.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/services.png) |
| Service detail | `/services/inspection-01` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/service-detail.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/service-detail.png) |
| SENSAGE | `/sensage` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/sensage.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/sensage.png) |
| SENSAGE booking | `/sensage/new` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/sensage-new.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/sensage-new.png) |
| Recovery | `/recovery` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/recovery.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/recovery.png) |
| Bookings | `/bookings` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/bookings.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/bookings.png) |
| New booking | `/bookings/new` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/bookings-new.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/bookings-new.png) |
| Cart | `/cart` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/cart.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/cart.png) |
| Checkout | `/checkout` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/checkout.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/checkout.png) |
| Orders | `/orders` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/orders.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/orders.png) |
| Order detail | `/orders/order-001` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/order-detail.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/order-detail.png) |
| Wallet | `/wallet` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/wallet.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/wallet.png) |
| Favourites | `/favourites` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/favourites.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/favourites.png) |
| Vehicle | `/vehicles/veh-01` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/vehicles.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/vehicles.png) |
| Add vehicle | `/vehicles/new` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/vehicles-new.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/vehicles-new.png) |
| Addresses | `/addresses` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/addresses.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/addresses.png) |
| Notifications | `/notifications` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/notifications.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/notifications.png) |
| Support | `/support` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/support.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/support.png) |
| Account | `/account` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/account.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/account.png) |
| Recovery detail | `/recovery/recovery-001` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/recovery-detail.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/recovery-detail.png) |
| SENSAGE report | `/sensage/sensage-001` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/sensage-detail.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/en/sensage-detail.png) |

## Customer — Arabic (RTL)

| Screen | Route | View | Image |
| --- | --- | --- | --- |
| Onboarding | `/onboarding` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/onboarding.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/onboarding.png) |
| Sign in | `/login` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/login.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/login.png) |
| Home | `/home` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/home.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/home.png) |
| Categories | `/categories` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/categories.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/categories.png) |
| Search | `/search` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/search.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/search.png) |
| Parts shop | `/parts` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/parts.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/parts.png) |
| Part detail | `/parts/prod-001` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/part-detail.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/part-detail.png) |
| Store | `/parts/store/store-01` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/store.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/store.png) |
| Service directory | `/services` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/services.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/services.png) |
| Service detail | `/services/inspection-01` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/service-detail.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/service-detail.png) |
| SENSAGE | `/sensage` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/sensage.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/sensage.png) |
| SENSAGE booking | `/sensage/new` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/sensage-new.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/sensage-new.png) |
| Recovery | `/recovery` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/recovery.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/recovery.png) |
| Bookings | `/bookings` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/bookings.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/bookings.png) |
| New booking | `/bookings/new` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/bookings-new.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/bookings-new.png) |
| Cart | `/cart` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/cart.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/cart.png) |
| Checkout | `/checkout` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/checkout.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/checkout.png) |
| Orders | `/orders` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/orders.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/orders.png) |
| Order detail | `/orders/order-001` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/order-detail.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/order-detail.png) |
| Wallet | `/wallet` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/wallet.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/wallet.png) |
| Favourites | `/favourites` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/favourites.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/favourites.png) |
| Vehicle | `/vehicles/veh-01` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/vehicles.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/vehicles.png) |
| Add vehicle | `/vehicles/new` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/vehicles-new.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/vehicles-new.png) |
| Addresses | `/addresses` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/addresses.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/addresses.png) |
| Notifications | `/notifications` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/notifications.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/notifications.png) |
| Support | `/support` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/support.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/support.png) |
| Account | `/account` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/account.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/account.png) |
| Recovery detail | `/recovery/recovery-001` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/recovery-detail.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/recovery-detail.png) |
| SENSAGE report | `/sensage/sensage-001` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/sensage-detail.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/ar/sensage-detail.png) |

## Merchant shell

| Screen | Route | View | Image |
| --- | --- | --- | --- |
| Merchant dashboard | `/merchant/dashboard` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-dashboard.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-dashboard.png) |
| Merchant orders | `/merchant/orders` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-orders.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-orders.png) |
| Merchant products | `/merchant/products` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-products.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-products.png) |
| Merchant services | `/merchant/services` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-services.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-services.png) |
| Merchant promotions | `/merchant/promotions` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-promotions.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-promotions.png) |
| Merchant profile | `/merchant/profile` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-profile.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-profile.png) |
| Merchant plan | `/merchant/plan` | [view](https://github.com/mohammadaljallad079-rgb/oryx/blob/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-plan.png) | [png](https://raw.githubusercontent.com/mohammadaljallad079-rgb/oryx/feature/execution-07-premium-web/docs/audit/exec07/marketplace-demo/screenshots/merchant/merchant-plan.png) |

---

Generated by `node .run/build-mobile-screenshots-readme.mjs`.
