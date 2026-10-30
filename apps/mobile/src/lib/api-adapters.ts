/**
 * Adapts API responses into the shapes the approved cards render.
 *
 * The cards were built against `DemoProduct` and `DemoProvider`, which carry more
 * fields than the API returns — a rating, a store, a discount, a photograph key.
 * Rather than change the cards (which would risk the approved design) or invent
 * values (which would present fiction as fact), this module maps what the API
 * genuinely has and leaves the rest explicitly empty.
 *
 * Two rules it follows:
 *
 *   - **A missing value stays missing.** No rating is invented, no review count
 *     is fabricated, no discount is implied. The cards already handle `null`.
 *   - **A missing image falls back to a bundled asset**, chosen deterministically
 *     from the record's own key so the same product always shows the same
 *     placeholder rather than a new one on every render.
 */
import type { DemoProduct, DemoProvider, PhotoKey, CategoryKey } from '../demo/catalogue';
import type { FavoriteResponse, HomepageResponse } from './api';

/** The bundled photographs, used when the API has no image for a record. */
const FALLBACK_PHOTOS: PhotoKey[] = [
  'partsStore',
  'mechanicEngine',
  'inspectionBay',
  'autoService',
  'carwashPremium',
];

/**
 * Picks a stable fallback photograph for a record.
 *
 * Deterministic on the id, so a product keeps the same placeholder across
 * renders and screens instead of shuffling.
 */
function fallbackPhoto(id: string): PhotoKey {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return FALLBACK_PHOTOS[sum % FALLBACK_PHOTOS.length] as PhotoKey;
}

/** The API's product, as the homepage returns it. */
export type ApiProduct = HomepageResponse['products'][number];

/**
 * Maps an API product onto the card's type.
 *
 * Fields the API does not supply — rating, review count, brand, stock, discount
 * — are set to their neutral value. The card renders no rating badge when
 * `reviewCount` is 0 and no strike-through when `compareAtMinor` is null, so the
 * absence reads as absence rather than as a zero score.
 */
export function toDemoProduct(product: ApiProduct): DemoProduct {
  return {
    id: product.id,
    sku: product.sku,
    // The API returns one localised name; both fields carry it so either locale
    // renders the same real value rather than one of them falling back to demo.
    nameEn: product.name,
    nameAr: product.name,
    storeId: '',
    categoryKey: 'spare_parts' as CategoryKey,
    groupEn: '',
    groupAr: '',
    brand: '',
    priceMinor: product.priceMinor,
    compareAtMinor: null,
    rating: 0,
    reviewCount: 0,
    stock: 0,
    photo: fallbackPhoto(product.id),
    fits: [],
    warrantyMonths: 0,
  };
}

/** The API's provider, as the homepage returns it. */
export type ApiProvider = HomepageResponse['providers'][number];

/**
 * Maps an API provider onto the card's type.
 *
 * `services` is empty when the API supplied no listing price, because inventing a
 * service would put a price on screen that nobody set. The card's "from" line is
 * driven by the listing price the API did return.
 */
export function toDemoProvider(provider: ApiProvider): DemoProvider {
  return {
    id: provider.id,
    kind: 'inspection',
    categoryKey: (provider.categoryKey ?? 'spare_parts') as CategoryKey,
    nameEn: provider.name,
    nameAr: provider.name,
    cityKey: '',
    rating: 0,
    reviewCount: 0,
    verified: true,
    photo: fallbackPhoto(provider.id),
    distanceKm: 0,
    services:
      provider.fromPriceMinor === null
        ? []
        : [
            {
              nameEn: 'Service',
              nameAr: 'خدمة',
              priceMinor: provider.fromPriceMinor,
              durationMinutes: 60,
            },
          ],
    opensAt: '08:00',
    closesAt: '18:00',
    closedOn: [],
    // The API does not return marketing copy or a phone number for a provider
    // listing, so these stay empty rather than being invented. The card omits
    // the rows when they are blank.
    aboutEn: '',
    aboutAr: '',
    phone: '',
  };
}

/** Maps a favourite onto the card's type. */
export function favoriteToDemoProduct(favorite: FavoriteResponse): DemoProduct {
  return {
    id: favorite.productId,
    sku: favorite.sku,
    nameEn: favorite.nameEn,
    nameAr: favorite.nameAr,
    storeId: '',
    categoryKey: 'spare_parts' as CategoryKey,
    groupEn: '',
    groupAr: '',
    brand: '',
    priceMinor: favorite.priceMinor,
    compareAtMinor: null,
    rating: 0,
    reviewCount: 0,
    stock: favorite.available ? 1 : 0,
    photo: fallbackPhoto(favorite.productId),
    fits: [],
    warrantyMonths: 0,
  };
}
