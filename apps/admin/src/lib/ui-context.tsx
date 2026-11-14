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
import { DEFAULT_LOCALE, FONT_SCALES, isLocale, type FontScale, type Locale } from '@oryx/shared';

type Theme = 'dark' | 'light';

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

interface UiContextValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  theme: Theme;
  fontScale: FontScale;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  setFontScale: (scale: FontScale) => void;
  toggleTheme: () => void;
  toggleLocale: () => void;
  t: Translator;
}

const UiContext = createContext<UiContextValue | null>(null);

const LOCALE_KEY = 'oryx.locale';
const THEME_KEY = 'oryx.theme';
const FONT_SCALE_KEY = 'oryx.fontScale';

/** The root font-size each scale maps to; the UI is authored against 14px. */
export const FONT_SCALE_PX: Record<FontScale, string> = { SM: '12.5px', MD: '14px', LG: '16px' };

function isFontScale(value: string): value is FontScale {
  return (FONT_SCALES as readonly string[]).includes(value);
}

export function UiProvider({
  children,
  dictionaries,
  initialLocale = DEFAULT_LOCALE,
  initialTheme = 'dark',
  initialFontScale = 'MD',
}: {
  children: ReactNode;
  dictionaries: Record<Locale, Record<string, string>>;
  initialLocale?: Locale;
  initialTheme?: Theme;
  initialFontScale?: FontScale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [fontScale, setFontScaleState] = useState<FontScale>(initialFontScale);
  // The layout's bootstrap script already put the stored preference on <html>
  // before the first paint, and the server rendered the defaults. The effects
  // below therefore skip their first (hydration) pass entirely, so they cannot
  // overwrite the already-correct attributes or persist the server defaults
  // over the stored values. From the second pass on they reflect real changes.
  const mounted = useRef(false);

  // Hydrate from persisted preference (localStorage), falling back to the
  // server-provided initial values. When nothing is stored yet, the server
  // default is written back so the bootstrap script and the next reload agree.
  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_KEY);
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const storedFontScale = window.localStorage.getItem(FONT_SCALE_KEY);
    if (storedLocale && isLocale(storedLocale)) setLocaleState(storedLocale);
    else window.localStorage.setItem(LOCALE_KEY, initialLocale);
    if (storedTheme === 'dark' || storedTheme === 'light') setThemeState(storedTheme);
    else window.localStorage.setItem(THEME_KEY, initialTheme);
    if (storedFontScale && isFontScale(storedFontScale)) setFontScaleState(storedFontScale);
    else window.localStorage.setItem(FONT_SCALE_KEY, initialFontScale);
  }, [initialLocale, initialTheme, initialFontScale]);

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

  useEffect(() => {
    if (!mounted.current) return;
    document.documentElement.setAttribute('data-font-scale', fontScale);
    document.documentElement.style.fontSize = FONT_SCALE_PX[fontScale];
    window.localStorage.setItem(FONT_SCALE_KEY, fontScale);
  }, [fontScale]);

  // Declared last so every effect above sees `mounted.current === false` on the
  // hydration pass.
  useEffect(() => {
    mounted.current = true;
  }, []);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const setFontScale = useCallback((next: FontScale) => setFontScaleState(next), []);
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
      fontScale,
      setLocale,
      setTheme,
      setFontScale,
      toggleTheme,
      toggleLocale,
      t,
    }),
    [locale, theme, fontScale, setLocale, setTheme, setFontScale, toggleTheme, toggleLocale, t],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside UiProvider');
  return ctx;
}
