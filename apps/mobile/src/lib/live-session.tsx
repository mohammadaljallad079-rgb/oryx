/**
 * The real customer session.
 *
 * A separate store from the demo account in `app-context`, and deliberately so.
 * The demo account is local and offline; this one is a real consumer identity
 * issued by the API. Keeping them apart means a demo session can never be
 * mistaken for an authenticated one, and a failed API call can never silently
 * fall back to a local account.
 *
 * ## Token handling
 *
 * The access token is held in memory only (`api.setAccessToken`), because a
 * stored access token outlives the session and is readable by anything with
 * access to the store. The refresh token is the one long-lived secret and it
 * lives in the platform keychain through `session-storage`. On start-up the app
 * restores a session by presenting the stored refresh token; a rejected refresh
 * clears it, so an expired session becomes a guest session rather than a
 * half-broken one.
 *
 * ## Guest browsing
 *
 * A guest is a first-class state, not an error. The app is fully browsable
 * without an account; only the endpoints that need an identity are refused, and
 * a screen that needs one sends the user to sign-in.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, authApi, setAccessToken, type CustomerSession } from './api';
import { deleteSecret, getSecret, setSecret } from './session-storage';

/** Where the refresh token is sealed. Distinct from the demo session key. */
const REFRESH_KEY = 'oryx.customer.refresh';

export interface CustomerAccount {
  id: string;
  email: string;
  fullName: string;
  preferredLocale: 'ar' | 'en';
  preferredTheme: 'dark' | 'light';
  defaultCompanyId: string | null;
}

export type SessionStatus = 'restoring' | 'guest' | 'live';

interface LiveSessionState {
  /** `restoring` until the stored session has been checked, then `guest` or `live`. */
  status: SessionStatus;
  account: CustomerAccount | null;
  /** True when a real, server-issued session is active. */
  isLive: boolean;
  /** The last failure from a sign-in, register or restore, if any. */
  error: ApiError | null;
  busy: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    preferredLocale?: 'ar' | 'en';
  }) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  /** Re-reads the account from the API. Used after a profile change. */
  refreshAccount: () => Promise<void>;
  /** A human-readable message for the last error, keyed for the i18n layer. */
  errorKey: string | null;
}

const LiveSessionContext = createContext<LiveSessionState | null>(null);

/** Maps an API failure to an i18n key the sign-in screen already knows. */
function errorKeyFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'offline') return 'offlineBody';
    if (error.kind === 'unauthorized') return 'invalidCredentials';
    if (error.kind === 'validation') return 'validationFailed';
    if (error.kind === 'server') return 'serverError';
  }
  return 'invalidCredentials';
}

export function LiveSessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('restoring');
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  /** Guards a restore that races an unmount or a second restore. */
  const bootstrapped = useRef(false);

  const adopt = useCallback(async (session: CustomerSession) => {
    setAccessToken(session.accessToken);
    // The native client asks for the refresh token in the body; the API only
    // returns it when `x-oryx-client: mobile` is present.
    if (session.refreshToken) await setSecret(REFRESH_KEY, session.refreshToken);
    setAccount(session.account);
    setStatus('live');
  }, []);

  const clear = useCallback(async () => {
    setAccessToken(null);
    await deleteSecret(REFRESH_KEY);
    setAccount(null);
    setStatus('guest');
  }, []);

  /**
   * Restores a session at start-up.
   *
   * The stored refresh token is exchanged for a fresh access token. If the
   * server refuses it — expired, revoked, rotated elsewhere — the token is
   * cleared and the app becomes a guest. A network failure is different: the
   * token is kept, because an offline start must not destroy a valid session,
   * and the status becomes `guest` for this run so the app is still usable.
   */
  const restore = useCallback(async () => {
    const stored = await getSecret(REFRESH_KEY);
    if (!stored) {
      setStatus('guest');
      return;
    }
    try {
      const session = await authApi.refresh(stored);
      await adopt(session);
    } catch (err) {
      if (err instanceof ApiError && (err.kind === 'unauthorized' || err.kind === 'forbidden')) {
        await clear();
        return;
      }
      // Offline or a server error: keep the token, but do not claim a live
      // session we could not verify.
      setAccessToken(null);
      setAccount(null);
      setStatus('guest');
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
        const session = await authApi.login(email.trim(), password);
        await adopt(session);
        return { ok: true as const };
      } catch (err) {
        setError(err as ApiError);
        return { ok: false as const, error: errorKeyFor(err) };
      } finally {
        setBusy(false);
      }
    },
    [adopt],
  );

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      fullName: string;
      phone?: string;
      preferredLocale?: 'ar' | 'en';
    }) => {
      setBusy(true);
      setError(null);
      try {
        const session = await authApi.register(
          input.email.trim(),
          input.password,
          input.fullName.trim(),
          input.preferredLocale ?? 'ar',
          input.phone?.trim() || undefined,
        );
        await adopt(session);
        return { ok: true as const };
      } catch (err) {
        setError(err as ApiError);
        return { ok: false as const, error: errorKeyFor(err) };
      } finally {
        setBusy(false);
      }
    },
    [adopt],
  );

  const signOut = useCallback(async () => {
    // Best-effort server revoke; the local session is cleared regardless, so a
    // failed call cannot leave the device holding a token. The refresh token is
    // read and sent in the body so the server actually revokes it — a native
    // client presents no cookie, and an unrevoked token stays valid until it
    // expires.
    try {
      const stored = await getSecret(REFRESH_KEY);
      await authApi.logout(stored ?? undefined);
    } catch {
      /* the local clear below is what matters */
    }
    await clear();
  }, [clear]);

  const refreshAccount = useCallback(async () => {
    if (status !== 'live') return;
    try {
      const me = await authApi.me();
      setAccount(me);
    } catch {
      /* a transient failure leaves the cached account in place */
    }
  }, [status]);

  const value = useMemo<LiveSessionState>(
    () => ({
      status,
      account,
      isLive: status === 'live' && account !== null,
      error,
      busy,
      signIn,
      register,
      signOut,
      refreshAccount,
      errorKey: error ? errorKeyFor(error) : null,
    }),
    [status, account, error, busy, signIn, register, signOut, refreshAccount],
  );

  return <LiveSessionContext.Provider value={value}>{children}</LiveSessionContext.Provider>;
}

/** Reads the live session. Throws outside the provider, which is a programming error. */
export function useLiveSession(): LiveSessionState {
  const value = useContext(LiveSessionContext);
  if (!value) throw new Error('useLiveSession must be used inside <LiveSessionProvider>');
  return value;
}
