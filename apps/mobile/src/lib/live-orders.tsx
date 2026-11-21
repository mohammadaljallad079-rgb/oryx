/**
 * The server-backed consumer orders.
 *
 * The same split as the cart, favourites and bookings: the demo orders live in
 * `demo/`, this store reads the real ones from the API. A screen reads `mode`
 * and says which it is showing, so a demo order is never presented as a real
 * one.
 *
 * ## Totals come from the server
 *
 * Every figure here — subtotal, tax, delivery, total — is the API's own. The
 * store never multiplies a price by a quantity to decide what an order cost.
 *
 * ## Ownership
 *
 * Every call carries the caller's own token and the API scopes by account, so
 * the store sends no account id and cannot read or cancel someone else's order.
 * A cross-account id is a 404 from the server, not a filtered-out row here.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, ordersApi, type OrderDetail, type OrderSummary } from './api';
import { useLiveSession } from './live-session';

export type OrdersMode = 'live' | 'demo';

interface LiveOrdersState {
  mode: OrdersMode;
  items: OrderSummary[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  busy: boolean;
  /** Re-reads the order list. */
  refresh: () => Promise<void>;
  /** One order with its lines and status trail. */
  detail: (id: string) => Promise<OrderDetail>;
  /**
   * Cancel an order. Resolves with the server's own decision: a status the
   * server will not cancel from comes back as a failure, never a local guess.
   */
  cancel: (id: string, reason?: string) => Promise<{ ok: boolean; error?: ApiError }>;
}

const LiveOrdersContext = createContext<LiveOrdersState | null>(null);

export function LiveOrdersProvider({ children }: { children: React.ReactNode }) {
  // The store follows the session rather than probing a token slot, so signing
  // in or out re-reads the right list without a screen having to ask it to.
  const { isLive } = useLiveSession();
  const [items, setItems] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  // A slow list response must not overwrite a newer one.
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!isLive) {
      setItems([]);
      setTotal(0);
      return;
    }
    const seq = (requestSeq.current += 1);
    setLoading(true);
    try {
      const page = await ordersApi.list({ page: 1, pageSize: 50 });
      if (seq === requestSeq.current) {
        setItems(page.items);
        setTotal(page.total);
        setError(null);
      }
    } catch (err) {
      if (seq === requestSeq.current) setError(err as ApiError);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [isLive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const detail = useCallback((id: string) => ordersApi.get(id), []);

  const cancel = useCallback(
    async (id: string, reason?: string) => {
      if (busy) return { ok: false };
      setBusy(true);
      try {
        await ordersApi.cancel(id, reason);
        await refresh();
        return { ok: true as const };
      } catch (err) {
        setError(err as ApiError);
        return { ok: false as const, error: err as ApiError };
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const value = useMemo<LiveOrdersState>(
    () => ({
      mode: isLive ? 'live' : 'demo',
      items: isLive ? items : [],
      total: isLive ? total : 0,
      loading,
      error,
      busy,
      refresh,
      detail,
      cancel,
    }),
    [isLive, items, total, loading, error, busy, refresh, detail, cancel],
  );

  return <LiveOrdersContext.Provider value={value}>{children}</LiveOrdersContext.Provider>;
}

export function useLiveOrders(): LiveOrdersState {
  const value = useContext(LiveOrdersContext);
  if (!value) throw new Error('useLiveOrders must be used inside <LiveOrdersProvider>');
  return value;
}
