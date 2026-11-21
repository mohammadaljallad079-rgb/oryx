import { createHmac, timingSafeEqual } from 'node:crypto';
import { haversineMeters } from './attendance-calculator';

/**
 * Attendance location verification.
 *
 * A self-service punch may carry a GPS fix, the connected Wi-Fi SSID/BSSID and a
 * rotating QR token. None of these is proof of identity on its own — a client can
 * report any coordinate or SSID — so this module only answers "does the reported
 * evidence match a configured worksite?", records which evidence was used and how
 * accurate it was, and lets the policy decide whether a fallback is permitted.
 * The decision to trust the punch is never made here alone.
 */

export type VerificationSource = 'GPS' | 'WIFI' | 'QR' | 'MANUAL' | 'FALLBACK';

export interface WorkSiteInput {
  id: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  wifiSsids: string | null;
  wifiBssids: string | null;
  qrSecret: string | null;
}

export interface PunchLocation {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  wifiSsid?: string;
  wifiBssid?: string;
  qrToken?: string;
  fallbackReason?: string;
}

export interface VerificationResult {
  verified: boolean;
  source: VerificationSource;
  siteId: string | null;
  distanceM: number | null;
  detail: string;
}

/** Parse a comma-separated allow-list into trimmed, non-empty, lower-case values. */
function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * A rotating QR token for a site: HMAC(siteSecret, floor(epoch/periodSeconds)).
 *
 * The token changes every `periodSeconds`, so a photographed screen is useless
 * after the window closes, and it can be recomputed by the API without storing a
 * per-token row. A short window keeps the replay surface small.
 */
export function qrTokenFor(siteSecret: string, at: Date, periodSeconds = 60): string {
  const counter = Math.floor(at.getTime() / 1000 / periodSeconds);
  return createHmac('sha256', siteSecret).update(String(counter)).digest('base64url').slice(0, 12);
}

/** Verify a presented QR token against the current and previous window. */
export function verifyQrToken(siteSecret: string, token: string, at: Date, periodSeconds = 60): boolean {
  const expected = [qrTokenFor(siteSecret, at, periodSeconds), qrTokenFor(siteSecret, new Date(at.getTime() - periodSeconds * 1000), periodSeconds)];
  const a = Buffer.from(token);
  return expected.some((e) => {
    const b = Buffer.from(e);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/**
 * Decide whether the presented evidence matches one of the company's worksites.
 *
 * The first site whose GPS radius contains the fix, whose Wi-Fi is allow-listed,
 * or whose QR token verifies wins. GPS is preferred for the recorded distance;
 * Wi-Fi and QR are accepted as alternatives when GPS is unavailable.
 */
export function verifyPunch(
  sites: WorkSiteInput[],
  location: PunchLocation | undefined,
  at: Date,
): VerificationResult {
  if (!location || (location.latitude === undefined && location.longitude === undefined && !location.wifiSsid && !location.qrToken)) {
    return { verified: false, source: 'FALLBACK', siteId: null, distanceM: null, detail: 'No location evidence supplied.' };
  }

  for (const site of sites) {
    if (location.qrToken && site.qrSecret && verifyQrToken(site.qrSecret, location.qrToken, at)) {
      return { verified: true, source: 'QR', siteId: site.id, distanceM: null, detail: 'QR token matched.' };
    }
  }

  if (location.wifiSsid || location.wifiBssid) {
    const ssid = location.wifiSsid?.toLowerCase();
    const bssid = location.wifiBssid?.toLowerCase();
    for (const site of sites) {
      const ssids = parseList(site.wifiSsids);
      const bssids = parseList(site.wifiBssids);
      if ((ssid && ssids.includes(ssid)) || (bssid && bssids.includes(bssid))) {
        return { verified: true, source: 'WIFI', siteId: site.id, distanceM: null, detail: 'Wi-Fi network matched.' };
      }
    }
  }

  if (location.latitude !== undefined && location.longitude !== undefined) {
    let best: { site: WorkSiteInput; distance: number } | null = null;
    for (const site of sites) {
      const distance = haversineMeters(
        { lat: location.latitude, lng: location.longitude },
        { lat: site.latitude, lng: site.longitude },
      );
      if (distance <= site.radiusMeters && (!best || distance < best.distance)) {
        best = { site, distance };
      }
    }
    if (best) {
      return { verified: true, source: 'GPS', siteId: best.site.id, distanceM: best.distance, detail: `Within ${best.site.radiusMeters} m of the worksite.` };
    }
    // Report the nearest site's distance so an operator can see how far off it was.
    const nearest = sites
      .map((site) => ({ site, distance: haversineMeters({ lat: location.latitude!, lng: location.longitude! }, { lat: site.latitude, lng: site.longitude }) }))
      .sort((a, b) => a.distance - b.distance)[0];
    return {
      verified: false,
      source: 'GPS',
      siteId: nearest?.site.id ?? null,
      distanceM: nearest?.distance ?? null,
      detail: 'GPS fix is outside every worksite radius.',
    };
  }

  return { verified: false, source: 'FALLBACK', siteId: null, distanceM: null, detail: 'Location evidence did not match a worksite.' };
}
