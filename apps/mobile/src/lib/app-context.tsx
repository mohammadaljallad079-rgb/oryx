/**
 * Application state shared by every screen: the session, the theme and the
 * locale.
 *
 * The session is intentionally thin — `api.ts` owns the tokens and this provider
 * only mirrors whether a session exists and exposes the profile. Locale and theme
 * are persisted on the account (`preferredLocale`/`preferredTheme`) so the website
 * and the app show the same account in the same language, and are applied locally
 * first so the UI does not flash the wrong direction while the profile loads.
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

import { api, session, type CustomerProfile } from './api';
import { directionFor, translate, type Direction, type Locale, type TranslateKey } from './i18n';
import { themes, type Theme, type ThemeMode } from './theme';

interface AppState {
  ready: boolean;
  profile: CustomerProfile | null;
  locale: Locale;
  direction: Direction;
  theme: Theme;
  t: (key: TranslateKey) => string;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
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
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');

  /**
   * Switching language also switches direction. React Native's `I18nManager`
   * only applies a direction change on the next app launch, so the direction is
   * carried in React state and applied explicitly by `Screen`; `allowRTL` is still
   * called so the native layer agrees with the chosen direction.
   */
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => setThemeModeState(mode), []);

  const refreshProfile = useCallback(async () => {
    const me = await api.me();
    setProfile(me);
    setLocale(me.preferredLocale);
    setThemeModeState(me.preferredTheme);
  }, [setLocale]);

  const signOut = useCallback(async () => {
    await api.logout();
    setProfile(null);
  }, []);

  // Restore a session once, at start-up.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        if (await api.restore()) await refreshProfile();
      } catch {
        // A stale profile is not a reason to block the app; stay signed out.
      } finally {
        setReady(true);
      }
    })();
  }, [refreshProfile]);

  // Keep `profile` in step when the client loses the session on a failed refresh.
  useEffect(
    () =>
      session.subscribe(() => {
        if (!session.authenticated) setProfile(null);
      }),
    [],
  );

  const value = useMemo<AppState>(
    () => ({
      ready,
      profile,
      locale,
      direction: directionFor(locale),
      theme: themes[themeMode],
      t: (key: TranslateKey) => translate(locale, key),
      setLocale,
      setThemeMode,
      refreshProfile,
      signOut,
    }),
    [ready, profile, locale, themeMode, setLocale, setThemeMode, refreshProfile, signOut],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
