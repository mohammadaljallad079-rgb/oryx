'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiError,
  customerApi,
  customerSession,
  restoreCustomerSession,
  type CustomerProfile,
} from './api';

export type SignInResult = { status: 'ok' } | { status: 'mfa'; challengeToken: string };

interface CustomerAuthValue {
  profile: CustomerProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  verifyMfa: (challengeToken: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

/**
 * Consumer session for the customer site.
 *
 * The access token lives in memory only; on mount the session is restored from
 * the HttpOnly refresh cookie. When the API reports the session is gone the
 * profile is cleared so guarded screens redirect instead of showing a stale UI.
 */
export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadProfile = useCallback(async () => {
    try {
      const me = await customerApi.me();
      setProfile(me);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      // A session may exist even though this tab has no token yet.
      customerSession.markHint();
      const restored = await restoreCustomerSession();
      if (!active) return;
      if (restored) await loadProfile();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadProfile]);

  useEffect(
    () =>
      customerSession.onSessionLost(() => {
        setProfile(null);
      }),
    [],
  );

  const signIn = useCallback<CustomerAuthValue['signIn']>(async (email, password) => {
    const result = await customerApi.login(email, password);
    if ('mfaRequired' in result) return { status: 'mfa', challengeToken: result.challengeToken };
    customerSession.setAccessToken(result.accessToken);
    const me = await customerApi.me();
    setProfile(me);
    return { status: 'ok' };
  }, []);

  const verifyMfa = useCallback<CustomerAuthValue['verifyMfa']>(
    async (challengeToken, code) => {
      const result = await customerApi.verifyMfaLogin(challengeToken, code);
      customerSession.setAccessToken(result.accessToken);
      const me = await customerApi.me();
      setProfile(me);
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await customerApi.logout();
    } catch (error) {
      // A already-expired session is not an error the visitor needs to see.
      if (!(error instanceof ApiError)) throw error;
    }
    customerSession.clear();
    setProfile(null);
    router.push('/');
  }, [router]);

  const value = useMemo<CustomerAuthValue>(
    () => ({
      profile,
      loading,
      isAuthenticated: profile !== null,
      signIn,
      verifyMfa,
      signOut,
      refreshProfile: loadProfile,
    }),
    [profile, loading, signIn, verifyMfa, signOut, loadProfile],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used inside CustomerAuthProvider.');
  return ctx;
}
