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

/**
 * Client-side shopping cart.
 *
 * The cart holds only product ids and quantities in `localStorage`; every price
 * is fetched from the API at quote time, so a stale or edited cart cannot change
 * what an order costs. Prices are never persisted client-side.
 */
export interface CartEntry {
  productId: string;
  quantity: number;
}

interface CartValue {
  entries: CartEntry[];
  count: number;
  ready: boolean;
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartValue | null>(null);

const STORAGE_KEY = 'oryx.customer.cart';

export function CartProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartEntry[];
        if (Array.isArray(parsed)) {
          setEntries(
            parsed
              .filter((e) => e && typeof e.productId === 'string')
              .map((e) => ({ productId: e.productId, quantity: Math.max(1, Number(e.quantity) || 1) })),
          );
        }
      }
    } catch {
      /* corrupt storage is discarded rather than shown */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries, ready]);

  const add = useCallback((productId: string, quantity = 1) => {
    setEntries((prev) => {
      const existing = prev.find((e) => e.productId === productId);
      if (existing) {
        return prev.map((e) =>
          e.productId === productId
            ? { ...e, quantity: Math.min(99, e.quantity + quantity) }
            : e,
        );
      }
      return [...prev, { productId, quantity: Math.min(99, Math.max(1, quantity)) }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setEntries((prev) =>
      quantity <= 0
        ? prev.filter((e) => e.productId !== productId)
        : prev.map((e) =>
            e.productId === productId ? { ...e, quantity: Math.min(99, quantity) } : e,
          ),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setEntries((prev) => prev.filter((e) => e.productId !== productId));
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const value = useMemo<CartValue>(
    () => ({
      entries,
      count: entries.reduce((sum, e) => sum + e.quantity, 0),
      ready,
      add,
      setQuantity,
      remove,
      clear,
    }),
    [entries, ready, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider.');
  return ctx;
}
