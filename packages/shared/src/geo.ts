/**
 * Geo helpers for the Auto Map (P3).
 *
 * The discovery queries need one thing only: given a point and a set of
 * provider coordinates, how far away is each provider, and which ones fall
 * inside a radius. That is a haversine over a handful of rows, so it lives here
 * as a pure function rather than pulling a spatial extension into the database.
 *
 * If the provider table ever grows past a few thousand rows the filter should
 * move into Postgres (`earthdistance` or PostGIS) — but the *contract* stays the
 * same, which is why the shape below is shared by the API and the clients.
 */

/** Mean Earth radius in kilometres. */
const EARTH_RADIUS_KM = 6371.0088;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** A provider with a known location and its computed distance. */
export interface NearbyProvider<T> {
  provider: T;
  distanceKm: number;
}

/** A latitude is valid when it is a finite number in [-90, 90]. */
export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

/** A longitude is valid when it is a finite number in [-180, 180]. */
export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidGeoPoint(value: { latitude?: unknown; longitude?: unknown }): boolean {
  return isValidLatitude(value.latitude) && isValidLongitude(value.longitude);
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in kilometres.
 *
 * The haversine form is used rather than the spherical law of cosines because it
 * stays numerically stable for the very small distances a "near me" search
 * produces, where the cosine form loses precision.
 */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Order providers by distance from an origin and keep those inside a radius.
 *
 * A provider without coordinates is dropped rather than placed at a default
 * point: showing a garage at the centre of the map when its real location is
 * unknown would be a lie the user acts on. The caller is expected to have
 * filtered for `latitude != null` already; the guard here is belt and braces.
 */
export function rankByDistance<T>(
  origin: GeoPoint,
  items: readonly T[],
  coordinatesOf: (item: T) => { latitude: number | null; longitude: number | null },
  radiusKm?: number,
): Array<NearbyProvider<T>> {
  const ranked: Array<NearbyProvider<T>> = [];
  for (const item of items) {
    const point = coordinatesOf(item);
    if (point.latitude === null || point.longitude === null) continue;
    const distance = distanceKm(origin, {
      latitude: point.latitude,
      longitude: point.longitude,
    });
    if (radiusKm !== undefined && distance > radiusKm) continue;
    ranked.push({ provider: item, distanceKm: Number(distance.toFixed(2)) });
  }
  ranked.sort((a, b) => a.distanceKm - b.distanceKm);
  return ranked;
}
