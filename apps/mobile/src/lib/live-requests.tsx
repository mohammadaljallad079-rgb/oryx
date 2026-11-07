/**
 * The server-backed consumer service requests.
 *
 * A service request is the generic "I need a service" record — a tow, a wash, a
 * repair — raised against a company and routed to an approved provider. It is the
 * live counterpart to the demo recovery jobs, and it is what the recovery screen
 * reads inside a live session.
 *
 * The same split as the cart, orders and bookings: the demo records live in
 * `demo/`, this store reads the real ones. A screen reads `mode` and says which it
 * is showing, so a demo record is never presented as a real one.
 *
 * ## Ownership
 *
 * Every call carries the caller's own token and the API scopes by account, so the
 * store sends no account id and cannot read or cancel someone else's request. A
 * cross-account id is a 404 from the server, not a filtered-out row here.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, serviceRequestsApi, type CustomerServiceRequest } from './api';
import { useLiveSession } from './live-session';

export type RequestsMode = 'live' | 'demo';

interface LiveRequestsState {
  mode: RequestsMode;
  items: CustomerServiceRequest[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  busy: boolean;
  /** Re-reads the request list. */
  refresh: () => Promise<void>;
  /** Raises a new request. Resolves with the server's own decision. */
  create: (input: {
    categoryKey: string;
    description?: string;
    vehicleId?: string;
  }) => Promise<{ ok: boolean; error?: ApiError; request?: CustomerServiceRequest }>;
  /** Cancels one of the caller's own requests. */
  cancel: (id: string, reason: string) => Promise<{ ok: boolean; error?: ApiError }>;
}

const LiveRequestsContext = createContext<LiveRequestsState | null>(null);

export function LiveRequestsProvider({ children }: { children: React.ReactNode }) {
  const { isLive } = useLiveSession();
  const [items, setItems] = useState<CustomerServiceRequest[]>([]);
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
      const page = await serviceRequestsApi.list({ page: 1, pageSize: 50 });
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

  const create = useCallback(
    async (input: { categoryKey: string; description?: string; vehicleId?: string }) => {
      if (busy) return { ok: false as const };
      setBusy(true);
      try {
        const request = await serviceRequestsApi.create(input);
        await refresh();
        return { ok: true as const, request };
      } catch (err) {
        setError(err as ApiError);
        return { ok: false as const, error: err as ApiError };
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const cancel = useCallback(
    async (id: string, reason: string) => {
      if (busy) return { ok: false as const };
      setBusy(true);
      try {
        await serviceRequestsApi.cancel(id, reason);
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

  const value = useMemo<LiveRequestsState>(
    () => ({
      mode: isLive ? 'live' : 'demo',
      items: isLive ? items : [],
      total: isLive ? total : 0,
      loading,
      error,
      busy,
      refresh,
      create,
      cancel,
    }),
    [isLive, items, total, loading, error, busy, refresh, create, cancel],
  );

  return <LiveRequestsContext.Provider value={value}>{children}</LiveRequestsContext.Provider>;
}

export function useLiveRequests(): LiveRequestsState {
  const value = useContext(LiveRequestsContext);
  if (!value) throw new Error('useLiveRequests must be used inside <LiveRequestsProvider>');
  return value;
}
