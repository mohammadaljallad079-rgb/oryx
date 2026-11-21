/**
 * Storage for the rotating refresh token.
 *
 * On Android and iOS the token goes to the platform keychain through
 * `expo-secure-store`, pinned with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` so a device
 * backup never carries a live session to another handset. That module ships no
 * web backend, and the web export of this app is what the owner previews, so a
 * browser falls back to `localStorage`; a native build never reaches that branch.
 *
 * Only the refresh token is persisted. The access token stays in memory, so a
 * process restart cannot resurrect a short-lived credential.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEYCHAIN_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const isWeb = () => Platform.OS === 'web';

export async function setSecret(key: string, value: string): Promise<void> {
  if (isWeb()) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS);
}

export async function getSecret(key: string): Promise<string | null> {
  if (isWeb()) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function deleteSecret(key: string): Promise<void> {
  if (isWeb()) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/**
 * Read the readable CSRF cookie the API sets alongside the staff session.
 *
 * A native build has no ambient cookie, so this returns `null` and the request
 * is unchanged. In a browser the API's `CsrfGuard` rejects an unsafe request
 * that presents the refresh cookie without a matching `x-oryx-csrf` header, and
 * the web export is served from the API origin — so echoing the cookie keeps the
 * preview usable. Native builds never reach this branch.
 */
export function readCsrfToken(): string | null {
  if (!isWeb()) return null;
  const match = globalThis.document?.cookie?.match(/(?:^|;\s*)oryx_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
