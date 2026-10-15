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

const LOCALE_KEY = 'oryx.customer.locale';
const THEME_KEY = 'oryx.customer.theme';

/**
 * Locale and theme for the customer site.
 *
 * Arabic RTL is the default and the server renders it that way, so the first
 * paint is correct without a flash; the client then hydrates the visitor's
 * stored preference.
 */
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

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_KEY);
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    if (storedLocale && isLocale(storedLocale)) setLocaleState(storedLocale);
    if (storedTheme === 'dark' || storedTheme === 'light') setThemeState(storedTheme);
  }, []);

  useEffect(() => {
    const dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('data-dir', dir);
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.dir = dir;
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((p) => (p === 'dark' ? 'light' : 'dark')),
    [],
  );
  const toggleLocale = useCallback(() => setLocaleState((p) => (p === 'ar' ? 'en' : 'ar')), []);

  const t = useCallback<Translator>(
    (key, vars) => {
      const dict = dictionaries[locale] ?? {};
      let value = dict[key] ?? dictionaries.en[key] ?? key;
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
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
  if (!ctx) throw new Error('useUi must be used inside UiProvider.');
  return ctx;
}
