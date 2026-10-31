/**
 * The real merchant session.
 *
 * A merchant is a *staff* account linked to a `MarketplaceProvider`, not a
 * consumer account. It therefore signs in through the staff `/auth/login` and
 * carries the staff access token (`setStaffAccessToken`), which the API's
 * provider-portal guards accept and a consumer token would not.
 *
 * The staff token is a separate slot from the consumer token on purpose: the two
 * identity planes are distinct on the server, and keeping one slot would mean a
 * merchant sign-in silently clobbered a customer session.
 *
 * As with the customer session, the access token is memory-only and the refresh
 * token lives in the keychain. A rejected refresh clears the token, so an
 * expired merchant session degrades to signed-out rather than a half state.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, providerApi, setStaffAccessToken, staffAuthApi, type ProviderProfile } from './api';
import { deleteSecret, getSecret, setSecret } from './session-storage';

const REFRESH_KEY = 'oryx.merchant.refresh';

export interface MerchantAccount {
  userId: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string;
  provider: ProviderProfile | null;
}

export type MerchantStatus = 'idle' | 'restoring' | 'signed-out' | 'signed-in';

interface MerchantSessionState {
  status: MerchantStatus;
  account: MerchantAccount | null;
  isSignedIn: boolean;
  busy: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  /** Re-reads the provider profile from the portal. */
  refreshProfile: () => Promise<void>;
}

const MerchantSessionContext = createContext<MerchantSessionState | null>(null);

function errorKeyFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'offline') return 'offlineBody';
    if (error.kind === 'unauthorized') return 'invalidCredentials';
    if (error.kind === 'forbidden') return 'notMerchantAccount';
    if (error.kind === 'validation') return 'validationFailed';
    if (error.kind === 'server') return 'serverError';
  }
  return 'invalidCredentials';
}

export function MerchantSessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<MerchantStatus>('idle');
  const [account, setAccount] = useState<MerchantAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  const adopt = useCallback(
    async (input: { accessToken: string; refreshToken?: string; user: { id: string; email: string; fullNameEn: string; fullNameAr: string } }) => {
      setStaffAccessToken(input.accessToken);
      if (input.refreshToken) await setSecret(REFRESH_KEY, input.refreshToken);
      // Resolve the provider membership. A staff account that is not linked to a
      // provider is not a merchant and is refused here rather than on every later
      // screen.
      let provider: ProviderProfile | null = null;
      try {
        provider = await providerApi.profile();
      } catch (err) {
        if (err instanceof ApiError && err.kind === 'forbidden') {
          setStaffAccessToken(null);
          await deleteSecret(REFRESH_KEY);
          setAccount(null);
          setStatus('signed-out');
          throw new ApiError('forbidden', 403, 'Not a provider account');
        }
      }
      setAccount({
        userId: input.user.id,
        email: input.user.email,
        fullNameEn: input.user.fullNameEn,
        fullNameAr: input.user.fullNameAr,
        provider,
      });
      setStatus('signed-in');
    },
    [],
  );

  const clear = useCallback(async () => {
    setStaffAccessToken(null);
    await deleteSecret(REFRESH_KEY);
    setAccount(null);
    setStatus('signed-out');
  }, []);

  const restore = useCallback(async () => {
    const stored = await getSecret(REFRESH_KEY);
    if (!stored) {
      setStatus('signed-out');
      return;
    }
    setStatus('restoring');
    try {
      const session = await staffAuthApi.refresh(stored);
      await adopt(session);
    } catch (err) {
      if (err instanceof ApiError && (err.kind === 'unauthorized' || err.kind === 'forbidden')) {
        await clear();
        return;
      }
      setStaffAccessToken(null);
      setAccount(null);
      setStatus('signed-out');
    }
  }, [adopt, clear]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void restore();
  }, [restore]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setError(null);
      try {
        const session = await staffAuthApi.login(email.trim(), password);
        await adopt(session);
        return { ok: true as const };
      } catch (err) {
        setError(errorKeyFor(err));
        return { ok: false as const, error: errorKeyFor(err) };
      } finally {
        setBusy(false);
      }
    },
    [adopt],
  );

  const signOut = useCallback(async () => {
    try {
      const stored = await getSecret(REFRESH_KEY);
      await staffAuthApi.logout(stored ?? undefined);
    } catch {
      /* the local clear is what matters */
    }
    await clear();
  }, [clear]);

  const refreshProfile = useCallback(async () => {
    if (status !== 'signed-in') return;
    try {
      const provider = await providerApi.profile();
      setAccount((prev) => (prev ? { ...prev, provider } : prev));
    } catch {
      /* leave the cached profile in place */
    }
  }, [status]);

  const value = useMemo<MerchantSessionState>(
    () => ({
      status,
      account,
      isSignedIn: status === 'signed-in' && account !== null,
      busy,
      error,
      signIn,
      signOut,
      refreshProfile,
    }),
    [status, account, busy, error, signIn, signOut, refreshProfile],
  );

  return <MerchantSessionContext.Provider value={value}>{children}</MerchantSessionContext.Provider>;
}

export function useMerchantSession(): MerchantSessionState {
  const value = useContext(MerchantSessionContext);
  if (!value) throw new Error('useMerchantSession must be used inside <MerchantSessionProvider>');
  return value;
}
