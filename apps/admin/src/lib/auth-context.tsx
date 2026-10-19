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
import {
  resolveEffectivePermissions,
  type LoginResponse,
  type MembershipSummary,
  type SessionUser,
} from '@oryx/shared';
import { api, ApiError, restoreSession, tokenStore } from './api';

interface AuthState {
  user: SessionUser | null;
  memberships: MembershipSummary[];
  /** Effective permissions for the current company selection (entitlement-gated). */
  permissions: string[];
  licensedModules: string[];
  companyId: string | null;
  branchId: string | null;
  supportSessionCompanyId: string | null;
  ready: boolean;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  isPlatform: boolean;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  hasModule: (moduleKey: string) => boolean;
  /**
   * Password step. Resolves to an MFA challenge when the account requires a
   * second factor, in which case no session exists until `completeMfaLogin`.
   */
  login: (email: string, password: string) => Promise<{ mfaRequired: true; challengeToken: string } | void>;
  completeMfaLogin: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  setCompanyContext: (companyId: string | null, branchId?: string | null) => void;
  refreshSession: () => Promise<void>;
  updatePreferences: (patch: { preferredLocale?: 'ar' | 'en'; preferredTheme?: 'dark' | 'light' }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    memberships: [],
    permissions: [],
    licensedModules: [],
    companyId: null,
    branchId: null,
    supportSessionCompanyId: null,
    ready: false,
  });

  /**
   * Resolve the current session.
   *
   * The access token is in memory only, so after a reload it is absent. In that
   * case we attempt one cookie-based restore before concluding there is no
   * session. `api.me()` itself also retries through the refresh cookie on a 401,
   * so a stale in-memory token is recovered transparently.
   *
   * A transient failure (`unavailable`) is NOT a lost session. Only an explicit
   * `expired` outcome, or a 401/403 from `me`, ends the session; anything else
   * leaves the user signed in and retries on the next request. Treating an
   * outage as a sign-out is what logged the iPad out.
   */
  const loadSession = useCallback(async () => {
    try {
      if (!tokenStore.access) {
        const outcome = await restoreSession();
        if (outcome === 'expired') {
          setState((p) => ({ ...p, ready: true, user: null, permissions: [], memberships: [] }));
          return;
        }
        if (outcome === 'unavailable') {
          // Keep whatever session state we already had; do not sign out.
          setState((p) => ({ ...p, ready: true }));
          return;
        }
      }
      const me = await api.me();
      setState((p) => ({
        ...p,
        ready: true,
        user: {
          id: me.user.id,
          email: me.user.email,
          fullNameEn: me.user.fullNameEn,
          fullNameAr: me.user.fullNameAr,
          status: me.user.status as SessionUser['status'],
          kind: me.user.isSuperAdmin ? 'PLATFORM' : 'COMPANY',
          preferredLocale: me.user.preferredLocale,
          preferredTheme: me.user.preferredTheme,
          isSuperAdmin: me.user.isSuperAdmin,
        },
        memberships: me.memberships as MembershipSummary[],
        permissions: me.permissions,
        licensedModules: me.context.licensedModules,
        companyId: me.context.companyId ?? p.companyId,
        branchId: me.context.branchId ?? p.branchId,
        supportSessionCompanyId: me.context.supportSessionCompanyId,
      }));
    } catch (error) {
      // A transient API failure must not end the session. Only an explicit
      // authentication rejection does.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        tokenStore.clear();
        setState((p) => ({ ...p, ready: true, user: null, permissions: [], memberships: [] }));
        return;
      }
      if (error instanceof ApiError && error.code === 'network.unavailable') {
        setState((p) => ({ ...p, ready: true }));
        return;
      }
      tokenStore.clear();
      setState((p) => ({ ...p, ready: true, user: null, permissions: [], memberships: [] }));
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // When a request proves the session is gone (refresh failed), drop local state
  // so the shell redirects to sign-in rather than showing a broken screen.
  useEffect(() => {
    return tokenStore.onSessionLost(() => {
      setState((p) => ({ ...p, user: null, permissions: [], memberships: [], ready: true }));
    });
  }, []);

  /**
   * Keep tabs in step.
   *
   * A refresh token is single-use, so two tabs refreshing at once is exactly the
   * race the server's rotation grace window handles. Within a tab the refresh is
   * single-flight. Across tabs we additionally react to a sign-out performed in
   * another tab, and drop the in-memory token when storage changes so the next
   * request restores from the cookie instead of presenting a token another tab
   * may have already rotated.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'oryx.sessionEnded') {
        tokenStore.clear();
        setState((p) => ({ ...p, user: null, permissions: [], memberships: [], ready: true }));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const applySession = useCallback(
    (res: LoginResponse) => {
      // Only the short-lived access token is stored client-side; the refresh
      // token stays in the API's HttpOnly cookie.
      tokenStore.setAccessToken(res.accessToken);
      const firstCompany = res.user.kind === 'COMPANY' ? (res.memberships[0]?.companyId ?? null) : null;
      tokenStore.setContext(firstCompany, null);
      setState({
        ready: true,
        user: res.user,
        memberships: res.memberships,
        permissions: res.permissions,
        licensedModules: [],
        companyId: firstCompany,
        branchId: null,
        supportSessionCompanyId: null,
      });
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      // Drop any leftover session first. A stale in-memory token or a stale
      // `oryx_csrf` cookie from a previous session must not be presented to the
      // login endpoint; the API clears its own cookies on a successful login.
      tokenStore.clear();
      const res = await api.login(email, password);
      if ('mfaRequired' in res && res.mfaRequired) {
        // Password accepted but a second factor is required: no session yet.
        return { mfaRequired: true as const, challengeToken: res.challengeToken };
      }
      applySession(res as LoginResponse);
      await loadSession();
      return undefined;
    },
    [applySession, loadSession],
  );

  const completeMfaLogin = useCallback(
    async (challengeToken: string, code: string) => {
      const res = await api.verifyMfaLogin(challengeToken, code);
      applySession(res);
      await loadSession();
    },
    [applySession, loadSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* best effort: the cookies are cleared server-side on success */
    }
    tokenStore.clear();
    // Tell other tabs the session ended. The key is written then removed so a
    // repeated sign-out still fires a storage event.
    try {
      window.localStorage.setItem('oryx.sessionEnded', String(Date.now()));
      window.localStorage.removeItem('oryx.sessionEnded');
    } catch {
      /* storage may be unavailable in private modes; sign-out still applies here */
    }
    setState({
      ready: true,
      user: null,
      memberships: [],
      permissions: [],
      licensedModules: [],
      companyId: null,
      branchId: null,
      supportSessionCompanyId: null,
    });
  }, []);

  const setCompanyContext = useCallback(
    (companyId: string | null, branchId: string | null = null) => {
      tokenStore.setContext(companyId, branchId);
      setState((p) => ({ ...p, companyId, branchId }));
      void loadSession();
    },
    [loadSession],
  );

  const updatePreferences = useCallback(
    async (patch: { preferredLocale?: 'ar' | 'en'; preferredTheme?: 'dark' | 'light' }) => {
      await api.updateProfile(patch);
      setState((p) =>
        p.user
          ? {
              ...p,
              user: {
                ...p.user,
                preferredLocale: patch.preferredLocale ?? p.user.preferredLocale,
                preferredTheme: patch.preferredTheme ?? p.user.preferredTheme,
              },
            }
          : p,
      );
    },
    [],
  );

  const isPlatform = state.user?.kind === 'PLATFORM';

  const can = useCallback(
    (permission: string) => state.permissions.includes(permission),
    [state.permissions],
  );
  const canAny = useCallback(
    (...permissions: string[]) => permissions.some((p) => state.permissions.includes(p)),
    [state.permissions],
  );
  const hasModule = useCallback(
    (moduleKey: string) => isPlatform && !state.companyId ? true : state.licensedModules.includes(moduleKey),
    [isPlatform, state.companyId, state.licensedModules],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: Boolean(state.user),
      isPlatform: Boolean(isPlatform),
      can,
      canAny,
      hasModule,
      login,
      completeMfaLogin,
      logout,
      setCompanyContext,
      refreshSession: loadSession,
      updatePreferences,
    }),
    [
      state,
      isPlatform,
      can,
      canAny,
      hasModule,
      login,
      completeMfaLogin,
      logout,
      setCompanyContext,
      loadSession,
      updatePreferences,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Maps an API error to a localized message key. */
export function errorMessageKey(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'authz.cross_tenant_denied':
        return 'error.crossTenant';
      case 'authz.branch_out_of_scope':
        return 'error.branchScope';
      case 'authz.module_not_licensed':
        return 'error.moduleNotLicensed';
      case 'authz.delegation_exceeds_scope':
        return 'error.delegation';
      case 'plan.limit_exceeded':
        return 'error.planLimit';
      case 'resource.not_found':
        return 'error.notFound';
      case 'resource.conflict':
        return 'error.conflict';
      case 'authz.permission_denied':
      case 'authz.platform_only':
      case 'authz.support_session_required':
        return 'error.forbidden';
      default:
        return 'common.error';
    }
  }
  return 'common.error';
}

export { resolveEffectivePermissions };
