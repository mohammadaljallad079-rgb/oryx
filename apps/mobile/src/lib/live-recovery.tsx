/**
 * The server-backed roadside recovery requests (P5).
 *
 * A recovery request is a distinct record from the generic service request: it
 * carries a mandatory pickup point, an urgency, a vehicle and an append-only
 * tracking trail the client polls. This store is the live counterpart to the
 * demo recovery jobs, and the recovery screens read it inside a live session.
 *
 * ## Ownership
 *
 * Every call carries the caller's own token and the API scopes by account, so the
 * store sends no account id and cannot read or cancel someone else's request. A
 * cross-account id is a 404 from the server, not a filtered-out row here.
 *
 * ## Tracking
 *
 * `refresh` re-reads the list; `track` re-reads one request so the timeline can
 * be polled while a job is open. The timeline is the server's own append-only
 * trail — the client never invents a status the record does not carry.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, recoveryApi } from './api';
import { useLiveSession } from './live-session';
import type { RecoveryRequestDto } from '@oryx/shared';

interface LiveRecoveryState {
  /** True when a real session is active and these rows come from the API. */
  live: boolean;
  items: RecoveryRequestDto[];
  loading: boolean;
  error: ApiError | null;
  busy: boolean;
  refresh: () => Promise<void>;
  /** Reads one request, for the tracking screen to poll. */
  track: (id: string) => Promise<RecoveryRequestDto | null>;
  create: (input: {
    pickupLatitude: number;
    pickupLongitude: number;
    pickupLabel?: string;
    contactPhone: string;
    issue: string;
    urgency?: 'STANDARD' | 'URGENT' | 'CRITICAL';
    vehicleId?: string;
  }) => Promise<{ ok: boolean; error?: ApiError; request?: RecoveryRequestDto }>;
  cancel: (id: string, reason: string) => Promise<{ ok: boolean; error?: ApiError }>;
}

const LiveRecoveryContext = createContext<LiveRecoveryState | null>(null);

export function LiveRecoveryProvider({ children }: { children: React.ReactNode }) {
  const { isLive } = useLiveSession();
  const [items, setItems] = useState<RecoveryRequestDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  // A slow list response must not overwrite a newer one.
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!isLive) {
      setItems([]);
      return;
    }
    const seq = (requestSeq.current += 1);
    setLoading(true);
    try {
      const rows = await recoveryApi.list();
      if (seq === requestSeq.current) {
        setItems(rows);
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

  const track = useCallback(
    async (id: string) => {
      if (!isLive) return null;
      try {
        return await recoveryApi.get(id);
      } catch (err) {
        setError(err as ApiError);
        return null;
      }
    },
    [isLive],
  );

  const create = useCallback<LiveRecoveryState['create']>(
    async (input) => {
      if (busy) return { ok: false };
      setBusy(true);
      try {
        const request = await recoveryApi.create(input);
        await refresh();
        return { ok: true, request };
      } catch (err) {
        setError(err as ApiError);
        return { ok: false, error: err as ApiError };
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const cancel = useCallback(
    async (id: string, reason: string) => {
      if (busy) return { ok: false };
      setBusy(true);
      try {
        await recoveryApi.cancel(id, reason);
        await refresh();
        return { ok: true };
      } catch (err) {
        setError(err as ApiError);
        return { ok: false, error: err as ApiError };
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const value = useMemo<LiveRecoveryState>(
    () => ({ live: isLive, items: isLive ? items : [], loading, error, busy, refresh, track, create, cancel }),
    [isLive, items, loading, error, busy, refresh, track, create, cancel],
  );

  return <LiveRecoveryContext.Provider value={value}>{children}</LiveRecoveryContext.Provider>;
}

export function useLiveRecovery(): LiveRecoveryState {
  const value = useContext(LiveRecoveryContext);
  if (!value) throw new Error('useLiveRecovery must be used inside <LiveRecoveryProvider>');
  return value;
}
