import { describe, expect, it, vi } from 'vitest';

import { deleteSecret, getSecret, setSecret } from '../src/lib/session-storage';

/**
 * The mobile client persists its refresh token through this module. A device
 * build uses the platform keychain; the web export (which the owner previews)
 * has no keychain backend, so it must fall back to `localStorage` instead of
 * throwing. These tests pin both branches.
 */

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  setItemAsync: vi.fn(async () => undefined),
  getItemAsync: vi.fn(async () => 'keychain-value'),
  deleteItemAsync: vi.fn(async () => undefined),
}));

const platform = vi.hoisted(() => ({ OS: 'web' as string }));
vi.mock('react-native', () => ({
  get Platform() {
    return platform;
  },
}));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});

describe('session storage on web', () => {
  it('round-trips a token through localStorage', async () => {
    platform.OS = 'web';
    await setSecret('oryx.test.token', 'token-1');
    expect(await getSecret('oryx.test.token')).toBe('token-1');
    expect(store.get('oryx.test.token')).toBe('token-1');
  });

  it('removes the token on delete', async () => {
    platform.OS = 'web';
    await setSecret('oryx.test.token', 'token-2');
    await deleteSecret('oryx.test.token');
    expect(await getSecret('oryx.test.token')).toBeNull();
  });
});

describe('session storage on a device', () => {
  it('uses the keychain instead of localStorage', async () => {
    platform.OS = 'ios';
    store.clear();
    await setSecret('oryx.test.native', 'native-token');
    expect(store.has('oryx.test.native')).toBe(false);
    expect(await getSecret('oryx.test.native')).toBe('keychain-value');
  });
});
