/**
 * Application state shared by every screen: the session, the tenant scope, the
 * theme and the locale.
 *
 * The session itself lives in `api.ts`; this provider mirrors whether one exists,
 * exposes the profile, and owns the selected company and branch. The scope is
 * applied to the API client so every request carries the same tenant context the
 * control plane sends, and the server still enforces it.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Localization from 'expo-localization';

import { api, session, type ErpBranch, type ErpMembership, type ErpUser } from './api';
import { directionFor, translate, type Direction, type Locale, type TranslateKey } from './i18n';
import { themes, type Theme, type ThemeMode } from './theme';
import { DEFAULT_CURRENCY } from '@oryx/shared';

interface AppState {
  ready: boolean;
  user: ErpUser | null;
  memberships: ErpMembership[];
  permissions: string[];
  licensedModules: string[];
  companyId: string | null;
  branchId: string | null;
  branches: ErpBranch[];
  /** The tenant's currency, used to format every amount. */
  currency: string;
  locale: Locale;
  direction: Direction;
  theme: Theme;
  t: (key: TranslateKey) => string;
  can: (permission: string) => boolean;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  selectCompany: (companyId: string) => Promise<void>;
  selectBranch: (branchId: string | null) => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

function deviceLocale(): Locale {
  const tag = Localization.getLocales()[0]?.languageCode ?? 'ar';
  return tag === 'en' ? 'en' : 'ar';
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<ErpUser | null>(null);
  const [memberships, setMemberships] = useState<ErpMembership[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [licensedModules, setLicensedModules] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<ErpBranch[]>([]);
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const setThemeMode = useCallback((mode: ThemeMode) => setThemeModeState(mode), []);

  /** Load the branches of a company and select the first one by default. */
  const loadBranches = useCallback(async (id: string) => {
    try {
      // The tenant's currency drives every amount the app renders, so it is read
      // from the company record rather than assumed to be the launch market's.
      const company = await api.company(id);
      setCurrency(company.currency ?? DEFAULT_CURRENCY);
    } catch {
      setCurrency(DEFAULT_CURRENCY);
    }
    try {
      const res = await api.branches(id);
      setBranches(res.items);
      setBranchId(res.items[0]?.id ?? null);
      session.setScope(id, res.items[0]?.id ?? null);
    } catch {
      // A company with no branches is valid; the scope simply stays company-wide.
      setBranches([]);
      setBranchId(null);
      session.setScope(id, null);
    }
  }, []);

  const selectCompany = useCallback(
    async (id: string) => {
      setCompanyId(id);
      await loadBranches(id);
    },
    [loadBranches],
  );

  const selectBranch = useCallback((id: string | null) => {
    setBranchId(id);
    session.setScope(companyId, id);
  }, [companyId]);

  const refreshProfile = useCallback(async () => {
    const me = await api.me();
    setUser(me.user);
    setMemberships(me.memberships);
    setPermissions(me.permissions);
    setLicensedModules(me.context.licensedModules);
    setLocaleState(me.user.preferredLocale);
    setThemeModeState(me.user.preferredTheme);
    // The control plane records the last company the user worked in; honour it
    // so the app opens where the admin left off rather than on an arbitrary one.
    const active = me.context.companyId ?? me.memberships[0]?.companyId ?? null;
    if (active) {
      setCompanyId(active);
      await loadBranches(active);
    }
  }, [loadBranches]);

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
    setMemberships([]);
    setPermissions([]);
    setLicensedModules([]);
    setCompanyId(null);
    setBranchId(null);
    setBranches([]);
    setCurrency(DEFAULT_CURRENCY);
  }, []);

  // Restore a session once, at start-up.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        // Only a confirmed session loads the profile. `unavailable` means the
        // network was down, not that the session ended, so the user stays signed
        // in for the next successful request.
        if ((await api.restore()) === 'ok') await refreshProfile();
      } catch {
        // A stale profile is not a reason to block the app; stay signed out.
      } finally {
        setReady(true);
      }
    })();
  }, [refreshProfile]);

  // Drop the profile when the client loses the session on a failed refresh.
  useEffect(
    () =>
      session.subscribe(() => {
        if (!session.authenticated) {
          setUser(null);
          setMemberships([]);
          setPermissions([]);
          setCompanyId(null);
          setBranchId(null);
          setBranches([]);
          setCurrency(DEFAULT_CURRENCY);
        }
      }),
    [],
  );

  const value = useMemo<AppState>(
    () => ({
      ready,
      user,
      memberships,
      permissions,
      licensedModules,
      companyId,
      branchId,
      branches,
      currency,
      locale,
      direction: directionFor(locale),
      theme: themes[themeMode],
      t: (key: TranslateKey) => translate(locale, key),
      can: (permission: string) => permissions.includes(permission),
      setLocale,
      setThemeMode,
      selectCompany,
      selectBranch,
      refreshProfile,
      signOut,
    }),
    [
      ready,
      user,
      memberships,
      permissions,
      licensedModules,
      companyId,
      branchId,
      branches,
      currency,
      locale,
      themeMode,
      setLocale,
      setThemeMode,
      selectCompany,
      selectBranch,
      refreshProfile,
      signOut,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
