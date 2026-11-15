'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { customerApi } from './api';
import { useCustomerAuth } from './auth-context';

/**
 * Wishlist.
 *
 * A signed-in customer's list is stored server-side against their account. A
 * visitor who is not signed in keeps a device-local list so the button still
 * responds; on the next sign-in the local ids are merged into the account.
 */
interface WishlistValue {
  ids: string[];
  ready: boolean;
  isSaved: (productId: string) => boolean;
  toggle: (productId: string) => Promise<void>;
  remove: (productId: string) => Promise<void>;
}

const WishlistContext = createContext<WishlistValue | null>(null);
const LOCAL_KEY = 'oryx.customer.wishlist';

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useCustomerAuth();
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  const readLocal = useCallback((): string[] => {
    try {
      const raw = window.localStorage.getItem(LOCAL_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isAuthenticated) {
        if (active) {
          setIds(readLocal());
          setReady(true);
        }
        return;
      }
      try {
        const local = readLocal();
        for (const productId of local) {
          await customerApi.toggleWishlist(productId).catch(() => undefined);
        }
        if (local.length) window.localStorage.removeItem(LOCAL_KEY);
        const server = await customerApi.wishlistIds();
        if (active) setIds(server);
      } catch {
        if (active) setIds([]);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [isAuthenticated, readLocal]);

  const isSaved = useCallback((productId: string) => ids.includes(productId), [ids]);

  const toggle = useCallback(
    async (productId: string) => {
      if (!isAuthenticated) {
        const next = ids.includes(productId)
          ? ids.filter((id) => id !== productId)
          : [...ids, productId];
        setIds(next);
        window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        return;
      }
      const result = await customerApi.toggleWishlist(productId);
      setIds((prev) => (result.saved ? [...prev, productId] : prev.filter((id) => id !== productId)));
    },
    [isAuthenticated, ids],
  );

  const remove = useCallback(
    async (productId: string) => {
      if (!isAuthenticated) {
        const next = ids.filter((id) => id !== productId);
        setIds(next);
        window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        return;
      }
      await customerApi.removeWishlist(productId);
      setIds((prev) => prev.filter((id) => id !== productId));
    },
    [isAuthenticated, ids],
  );

  const value = useMemo<WishlistValue>(
    () => ({ ids, ready, isSaved, toggle, remove }),
    [ids, ready, isSaved, toggle, remove],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider.');
  return ctx;
}
