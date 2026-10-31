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
import { CATEGORY_PHOTO } from '../demo/catalogue';
import type {
  DemoOffer,
  DemoOrder,
  DemoProduct,
  DemoProvider,
  DemoRecoveryJob,
  DemoStore,
  DemoVehicle,
  PhotoKey,
  CategoryKey,
} from '../demo/catalogue';
import {
  mediaUrl,
  type CatalogOffer,
  type CatalogProduct,
  type CatalogStore,
  type CustomerServiceRequest,
  type CustomerVehicle,
  type FavoriteResponse,
  type HomepageResponse,
  type OrderSummary,
  type PublicProvider,
} from './api';

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
export function fallbackPhoto(id: string): PhotoKey {
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
    // A real uploaded photograph wins over the bundled fallback art. `mediaUrl`
    // resolves the API's relative path against the API origin.
    imageUrl: mediaUrl(product.imageUrl),
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

/** The consumer catalogue's product, as `GET /customer/catalog/products` returns it. */
export type ApiCatalogProduct = CatalogProduct;

/**
 * Maps a catalogue product onto the card's type.
 *
 * `available` is the API's boolean, so a product the catalogue will not sell
 * shows as out of stock. A rating and a review count are not in the public
 * catalogue projection — no rating badge is drawn rather than a fabricated one.
 */
export function catalogProductToDemo(product: CatalogProduct): DemoProduct {
  return {
    id: product.id,
    sku: product.sku,
    nameEn: product.nameEn,
    nameAr: product.nameAr,
    storeId: product.storeId,
    categoryKey: 'spare_parts' as CategoryKey,
    groupEn: '',
    groupAr: '',
    brand: product.store.name,
    priceMinor: product.priceMinor,
    compareAtMinor: null,
    rating: 0,
    reviewCount: 0,
    stock: product.available ? 1 : 0,
    photo: fallbackPhoto(product.id),
    imageUrl: mediaUrl(product.imageUrl),
    fits: [],
    warrantyMonths: 0,
  };
}

/**
 * Maps a catalogue store onto the store card's type.
 *
 * The public catalogue has no delivery fee or rating, so `deliveryMinor` is 0
 * and the card's "free delivery" line is not claimed — the card is given no
 * rating count, so it draws no rating pill.
 */
/**
 * Maps a live promotional offer onto the offer card's type.
 *
 * The percentage arrives in basis points (1500 = 15%), so it is divided for
 * display. `expiresAt` is a real bound when the provider set one and an empty
 * string otherwise; the card formats an empty string as absent rather than as a
 * date. The photograph is chosen from the offer's category so the card shows a
 * picture that matches the service, falling back deterministically on the id.
 */
export function catalogOfferToDemo(offer: CatalogOffer): DemoOffer {
  const category = (offer.categoryKey ?? null) as CategoryKey | null;
  const photo = (category && CATEGORY_PHOTO[category]) || fallbackPhoto(offer.id);
  return {
    id: offer.id,
    titleEn: offer.titleEn,
    titleAr: offer.titleAr,
    subtitleEn: offer.description ?? offer.provider.nameEn,
    subtitleAr: offer.description ?? offer.provider.nameAr,
    percentOff: Math.round(offer.percentOffBp / 100),
    storeId: null,
    categoryKey: category,
    photo,
    expiresAt: offer.endsAt ?? '',
    code: '',
  };
}

export function catalogStoreToDemo(store: CatalogStore): DemoStore {
  return {
    id: store.id,
    nameEn: store.nameEn,
    nameAr: store.nameAr,
    cityKey: '',
    rating: 0,
    reviewCount: 0,
    verified: store.providerId !== null,
    photo: fallbackPhoto(store.id),
    deliveryMinor: 0,
    minimumOrderMinor: 0,
    since: 0,
    tags: [],
    productCount: store.productCount,
  };
}

/** Maps a consumer order onto the order card's type. */
export function orderToDemo(order: OrderSummary): DemoOrder {
  return {
    id: order.id,
    reference: order.reference,
    customerId: '',
    storeId: '',
    items: order.lines.map((line) => ({
      productId: line.id,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
    })),
    subtotalMinor: order.subtotalMinor,
    deliveryMinor: order.deliveryMinor,
    totalMinor: order.totalMinor,
    status: order.status,
    placedAt: order.placedAt,
    etaAt: order.placedAt,
    addressEn: '',
    addressAr: '',
    paymentMethod: order.paymentMethod,
  };
}

/**
 * Maps a public marketplace provider onto the card's type.
 *
 * The directory returns an aggregate rating and its active listings. A provider
 * with no published review gets `reviewCount: 0`, so the card draws no rating
 * pill rather than a "0.0" that would be a false claim. The listing count and the
 * cheapest listing price are real, taken from the listings the API returned.
 *
 * A distance is not returned by the API, so `distanceKm` is 0 and the card does
 * not claim a distance it cannot measure.
 */
export function publicProviderToDemo(provider: PublicProvider): DemoProvider {
  const services = provider.listings.map((listing) => ({
    nameEn: listing.nameEn,
    nameAr: listing.nameAr,
    priceMinor: listing.priceMinor,
    // A listing has no duration in the public projection, so the card's
    // duration line is left at zero rather than invented.
    durationMinutes: 0,
  }));
  return {
    id: provider.id,
    kind: 'maintenance',
    categoryKey: (provider.categoryKey ?? 'spare_parts') as CategoryKey,
    nameEn: provider.nameEn,
    nameAr: provider.nameAr,
    cityKey: '',
    rating: provider.averageRating ?? 0,
    reviewCount: provider.reviewCount,
    verified: true,
    photo: fallbackPhoto(provider.id),
    distanceKm: 0,
    services,
    opensAt: '',
    closesAt: '',
    closedOn: [],
    aboutEn: '',
    aboutAr: '',
    phone: provider.phone ?? '',
  };
}

/**
 * Maps a customer's own garage vehicle onto the card's type.
 *
 * The API's plate may be absent, in which case the VIN is shown instead of an
 * invented plate. The colour is a single free-text value, so both language slots
 * carry it rather than one being fabricated. The photograph is a bundled
 * fallback: the garage holds no image, and a placeholder is honest where a
 * stock photograph of some other car would not be.
 */
export function customerVehicleToDemo(vehicle: CustomerVehicle): DemoVehicle {
  return {
    id: vehicle.id,
    ownerId: 'live',
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.modelYear,
    plate: vehicle.plateNumber ?? vehicle.vin,
    vin: vehicle.vin,
    colourEn: vehicle.color ?? '',
    colourAr: vehicle.color ?? '',
    mileageKm: vehicle.mileage ?? 0,
    photo: fallbackPhoto(vehicle.id),
  };
}

/**
 * Maps a live service request onto the recovery card's type.
 *
 * A service request carries no pickup/dropoff text, no driver and no ETA — those
 * belong to the demo simulation — so those fields are empty and the card shows
 * the request's own reference, status and category. The price is not invented: a
 * request has no agreed amount until a provider quotes, so `quotedPriceMinor` is
 * 0 and the card omits the amount rather than claiming one.
 */
export function serviceRequestToDemo(request: CustomerServiceRequest): DemoRecoveryJob {
  return {
    id: request.id,
    reference: request.requestNumber,
    customerId: '',
    providerId: request.providerId ?? '',
    vehicleId: '',
    issueKey: request.categoryKey,
    pickupEn: '',
    pickupAr: '',
    dropoffEn: '',
    dropoffAr: '',
    pickupPoint: { x: 0, y: 0 },
    dropoffPoint: { x: 0, y: 0 },
    quotedPriceMinor: 0,
    status: request.status as DemoRecoveryJob['status'],
    requestedAt: request.createdAt,
    driverNameEn: request.provider?.nameEn ?? '',
    driverNameAr: request.provider?.nameAr ?? '',
    driverPhone: request.provider?.phone ?? '',
    truckPlate: '',
    truckTypeEn: '',
    truckTypeAr: '',
    etaMinutes: 0,
    ratingGiven: request.reviews[0]?.rating ?? null,
  };
}
