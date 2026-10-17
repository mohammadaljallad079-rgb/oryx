'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@oryx/shared';

type Theme = 'dark' | 'light';

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

interface UiContextValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  theme: Theme;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  toggleLocale: () => void;
  t: Translator;
}

const UiContext = createContext<UiContextValue | null>(null);

const LOCALE_KEY = 'oryx.locale';
const THEME_KEY = 'oryx.theme';

export function UiProvider({
  children,
  dictionaries,
  initialLocale = DEFAULT_LOCALE,
  initialTheme = 'dark',
}: {
  children: ReactNode;
  dictionaries: Record<Locale, Record<string, string>>;
  initialLocale?: Locale;
  initialTheme?: Theme;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  // The layout's bootstrap script already put the stored preference on <html>
  // before the first paint, and the server rendered the defaults. The effects
  // below therefore skip their first (hydration) pass entirely, so they cannot
  // overwrite the already-correct attributes or persist the server defaults
  // over the stored values. From the second pass on they reflect real changes.
  const mounted = useRef(false);

  // Hydrate from persisted preference (localStorage), falling back to the
  // server-provided initial values.
  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_KEY);
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    if (storedLocale && isLocale(storedLocale)) setLocaleState(storedLocale);
    if (storedTheme === 'dark' || storedTheme === 'light') setThemeState(storedTheme);
  }, []);

  useEffect(() => {
    if (!mounted.current) return;
    const dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('data-dir', dir);
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.dir = dir;
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    if (!mounted.current) return;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Declared last so every effect above sees `mounted.current === false` on the
  // hydration pass.
  useEffect(() => {
    mounted.current = true;
  }, []);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(() => setThemeState((p) => (p === 'dark' ? 'light' : 'dark')), []);
  const toggleLocale = useCallback(() => setLocaleState((p) => (p === 'ar' ? 'en' : 'ar')), []);

  const t = useCallback<Translator>(
    (key, vars) => {
      const dict = dictionaries[locale] ?? {};
      const fallback = dictionaries.en ?? {};
      let value = dict[key] ?? fallback[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return value;
    },
    [dictionaries, locale],
  );

  const value = useMemo<UiContextValue>(
    () => ({
      locale,
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      theme,
      setLocale,
      setTheme,
      toggleTheme,
      toggleLocale,
      t,
    }),
    [locale, theme, setLocale, setTheme, toggleTheme, toggleLocale, t],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside UiProvider');
  return ctx;
}
