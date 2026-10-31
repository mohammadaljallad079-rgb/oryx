/**
 * The server-backed cart.
 *
 * A separate store from the demo cart in `app-context`, and deliberately so. The
 * demo cart lives in storage and is what Offline Demo Mode uses; this one is the
 * real thing, read from and written to the API. Keeping them apart means a demo
 * cart can never be mistaken for a server cart, and a failed API call can never
 * silently fall back to a local line item that the server has never seen.
 *
 * ## Which one a screen uses
 *
 * `useCart()` returns the live cart when a session exists and the demo cart
 * otherwise, with a `mode` field saying which. A screen renders `mode` so the
 * user is told where the contents came from.
 *
 * ## Prices
 *
 * Every total here comes from the server. The client never multiplies a price by
 * a quantity to decide what something costs; it displays what the API returned.
 * That is the difference between a cart and an invoice.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { api, ApiError, getAccessToken, type CartResponse } from './api';

export type CartMode = 'live' | 'demo';

interface LiveCartState {
  mode: CartMode;
  items: CartResponse['items'];
  /** The server's own total, in minor units. Never computed on the device. */
  totalMinor: number;
  itemCount: number;
  loading: boolean;
  /** The last failure, so a screen can show a retry rather than an empty cart. */
  error: ApiError | null;
  refresh: () => Promise<void>;
  add: (productId: string, quantity?: number) => Promise<void>;
  setQuantity: (productId: string, quantity: number) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  clear: () => Promise<void>;
  /** True while a write is in flight, so a button can be disabled against double taps. */
  busy: boolean;
}

const LiveCartContext = createContext<LiveCartState | null>(null);

const EMPTY: CartResponse = { items: [], totalMinor: 0, itemCount: 0 };

export function LiveCartProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<CartResponse>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  // A live cart only exists when there is a session. Without one the provider
  // stays inert and `mode` is 'demo', so a guest never issues a cart request.
  const [hasSession, setHasSession] = useState<boolean>(() => getAccessToken() !== null);

  // Guards against a stale response overwriting a newer one when two requests
  // are in flight — a real risk with a stepper the user taps quickly.
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (getAccessToken() === null) {
      setHasSession(false);
      setData(EMPTY);
      return;
    }
    setHasSession(true);
    const seq = (requestSeq.current += 1);
    setLoading(true);
    try {
      const next = await api.cart.get();
      if (seq === requestSeq.current) {
        setData(next);
        setError(null);
      }
    } catch (err) {
      if (seq === requestSeq.current) setError(err as ApiError);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Runs a write, then re-reads the cart from the server.
   *
   * The re-read is what keeps the badge and the total authoritative: rather than
   * patching local state from the request we hoped succeeded, the server's own
   * view is fetched. `busy` blocks a second write while one is in flight, which
   * is what stops a double tap becoming two increments.
   */
  const write = useCallback(
    async (action: () => Promise<unknown>) => {
      if (busy) return;
      setBusy(true);
      try {
        await action();
        await refresh();
        setError(null);
      } catch (err) {
        setError(err as ApiError);
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const value = useMemo<LiveCartState>(
    () => ({
      mode: hasSession ? 'live' : 'demo',
      items: hasSession ? data.items : [],
      totalMinor: hasSession ? data.totalMinor : 0,
      itemCount: hasSession ? data.itemCount : 0,
      loading,
      error,
      busy,
      refresh,
      add: (productId, quantity = 1) => write(() => api.cart.add(productId, quantity)),
      setQuantity: (productId, quantity) => write(() => api.cart.setQuantity(productId, quantity)),
      remove: (productId) => write(() => api.cart.remove(productId)),
      clear: () => write(() => api.cart.clear()),
    }),
    [hasSession, data, loading, error, busy, refresh, write],
  );

  return <LiveCartContext.Provider value={value}>{children}</LiveCartContext.Provider>;
}

/** Reads the live cart. Throws outside the provider, which is a programming error. */
export function useLiveCart(): LiveCartState {
  const value = useContext(LiveCartContext);
  if (!value) throw new Error('useLiveCart must be used inside <LiveCartProvider>');
  return value;
}
