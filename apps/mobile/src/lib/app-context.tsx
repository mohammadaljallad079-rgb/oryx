/**
 * Application state for the marketplace demo.
 *
 * This is the design-approval build, so there is no backend: the session is a
 * demo account held in memory and persisted with `session-storage`, which is the
 * platform keychain on a device and `localStorage` in the browser preview. When
 * the API is connected, `signIn` below swaps to a real call and nothing else in
 * the app changes.
 *
 * The provider also owns the small amount of state that must outlive a screen:
 * the cart, the favourites, the locale, the theme and the reset counter that
 * re-seeds demo data.
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

import { DEMO_FAVOURITES, demoAccountByEmail, type DemoAccount } from '../demo/activity';
import { deleteSecret, getSecret, setSecret } from './session-storage';
import { directionFor, translate, type Direction, type Locale, type TranslateKey } from './i18n';
import { themes, type Theme, type ThemeMode } from './theme';

/** A cart line. `productId` is the demo product id. */
export interface CartLine {
  productId: string;
  quantity: number;
}

interface AppState {
  ready: boolean;
  account: DemoAccount | null;
  isMerchant: boolean;
  locale: Locale;
  direction: Direction;
  theme: Theme;
  themeMode: ThemeMode;
  t: (key: TranslateKey) => string;
  /** Locale-aware picker for a `{ en, ar }` pair from demo data. */
  l: (pair: { en: string; ar: string }) => string;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signInAs: (role: 'customer' | 'merchant') => Promise<void>;
  signOut: () => Promise<void>;
  /** Flips between the customer and merchant demo accounts, keeping the session. */
  switchRole: () => void;
  cart: CartLine[];
  cartCount: number;
  addToCart: (productId: string, quantity?: number) => void;
  setCartQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  favourites: string[];
  isFavourite: (key: string) => boolean;
  toggleFavourite: (key: string) => void;
  /** Bumped by "reset demo data" so list screens re-read the repository. */
  dataVersion: number;
  resetDemoData: () => void;
}

const AppContext = createContext<AppState | null>(null);

const SESSION_KEY = 'oryx.marketplace.session';
const CART_KEY = 'oryx.marketplace.cart';
const FAVOURITES_KEY = 'oryx.marketplace.favourites';
const LOCALE_KEY = 'oryx.marketplace.locale';
const THEME_KEY = 'oryx.marketplace.theme';

function deviceLocale(): Locale {
  const tag = Localization.getLocales()[0]?.languageCode ?? 'ar';
  return tag === 'en' ? 'en' : 'ar';
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [favourites, setFavourites] = useState<string[]>(DEMO_FAVOURITES);
  const [dataVersion, setDataVersion] = useState(0);

  const persist = useCallback((key: string, value: unknown) => {
    void setSecret(key, JSON.stringify(value));
  }, []);

  // Restore the persisted session and preferences once, at start-up.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        const [sessionRaw, cartRaw, favRaw, localeRaw, themeRaw] = await Promise.all([
          getSecret(SESSION_KEY),
          getSecret(CART_KEY),
          getSecret(FAVOURITES_KEY),
          getSecret(LOCALE_KEY),
          getSecret(THEME_KEY),
        ]);
        if (sessionRaw) {
          const saved = JSON.parse(sessionRaw) as { email: string };
          const found = demoAccountByEmail(saved.email);
          if (found) setAccount(found);
        }
        if (cartRaw) setCart(JSON.parse(cartRaw) as CartLine[]);
        if (favRaw) setFavourites(JSON.parse(favRaw) as string[]);
        if (localeRaw) setLocaleState(JSON.parse(localeRaw) as Locale);
        if (themeRaw) setThemeModeState(JSON.parse(themeRaw) as ThemeMode);
      } catch {
        // A corrupt entry is not a reason to block the app; fall back to defaults.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      persist(LOCALE_KEY, next);
    },
    [persist],
  );

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeModeState(mode);
      persist(THEME_KEY, mode);
    },
    [persist],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const found = demoAccountByEmail(email);
      if (!found || found.password !== password) {
        return { ok: false, error: 'invalidCredentials' as const };
      }
      setAccount(found);
      persist(SESSION_KEY, { email: found.email });
      return { ok: true as const };
    },
    [persist],
  );

  const signInAs = useCallback(
    async (role: 'customer' | 'merchant') => {
      const found = demoAccountByEmail(
        role === 'merchant' ? 'merchant@oryx.demo' : 'customer@oryx.demo',
      );
      if (!found) return;
      setAccount(found);
      persist(SESSION_KEY, { email: found.email });
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    setAccount(null);
    await deleteSecret(SESSION_KEY);
  }, []);

  const switchRole = useCallback(() => {
    setAccount((prev) => {
      const next = demoAccountByEmail(prev?.role === 'merchant' ? 'customer@oryx.demo' : 'merchant@oryx.demo');
      if (next) persist(SESSION_KEY, { email: next.email });
      return next ?? prev;
    });
  }, [persist]);

  const addToCart = useCallback(
    (productId: string, quantity = 1) => {
      setCart((prev) => {
        const existing = prev.find((l) => l.productId === productId);
        const next = existing
          ? prev.map((l) =>
              l.productId === productId ? { ...l, quantity: l.quantity + quantity } : l,
            )
          : [...prev, { productId, quantity }];
        persist(CART_KEY, next);
        return next;
      });
    },
    [persist],
  );

  const setCartQuantity = useCallback(
    (productId: string, quantity: number) => {
      setCart((prev) => {
        const next =
          quantity <= 0
            ? prev.filter((l) => l.productId !== productId)
            : prev.map((l) => (l.productId === productId ? { ...l, quantity } : l));
        persist(CART_KEY, next);
        return next;
      });
    },
    [persist],
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      setCart((prev) => {
        const next = prev.filter((l) => l.productId !== productId);
        persist(CART_KEY, next);
        return next;
      });
    },
    [persist],
  );

  const clearCart = useCallback(() => {
    setCart([]);
    persist(CART_KEY, []);
  }, [persist]);

  const toggleFavourite = useCallback(
    (key: string) => {
      setFavourites((prev) => {
        const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
        persist(FAVOURITES_KEY, next);
        return next;
      });
    },
    [persist],
  );

  const resetDemoData = useCallback(() => {
    setFavourites(DEMO_FAVOURITES);
    persist(FAVOURITES_KEY, DEMO_FAVOURITES);
    setCart([]);
    persist(CART_KEY, []);
    setDataVersion((v) => v + 1);
  }, [persist]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      account,
      isMerchant: account?.role === 'merchant',
      locale,
      direction: directionFor(locale),
      theme: themes[themeMode],
      themeMode,
      t: (key: TranslateKey) => translate(locale, key),
      l: (pair: { en: string; ar: string }) => (locale === 'ar' ? pair.ar : pair.en),
      setLocale,
      setThemeMode,
      signIn,
      signInAs,
      signOut,
      switchRole,
      cart,
      cartCount: cart.reduce((sum, l) => sum + l.quantity, 0),
      addToCart,
      setCartQuantity,
      removeFromCart,
      clearCart,
      favourites,
      isFavourite: (key: string) => favourites.includes(key),
      toggleFavourite,
      dataVersion,
      resetDemoData,
    }),
    [
      ready,
      account,
      locale,
      themeMode,
      setLocale,
      setThemeMode,
      signIn,
      signInAs,
      signOut,
      switchRole,
      cart,
      addToCart,
      setCartQuantity,
      removeFromCart,
      clearCart,
      favourites,
      toggleFavourite,
      dataVersion,
      resetDemoData,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
