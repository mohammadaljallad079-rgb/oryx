/**
 * The server-backed bookings.
 *
 * Same split as the cart and favourites: the demo bookings live in storage, this
 * one lives on the API. A screen reads `mode` and says which it is showing, so a
 * demo appointment is never presented as a real one.
 *
 * ## Availability is never invented
 *
 * `slots` come from `GET /customer/bookings/availability`, which merges the
 * provider's real working hours and subtracts the intervals already taken. The
 * store does not synthesise a default grid: an empty day is shown as empty,
 * because a fabricated slot would let a customer book a time the workshop is
 * closed.
 *
 * ## Ownership
 *
 * Every call carries the caller's own token and the API scopes by account, so
 * the store never sends an account id and cannot read or cancel someone else's
 * booking.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, bookingsApi, type AvailabilitySlot, type BookingSummary } from './api';
import { useLiveSession } from './live-session';

export type BookingsMode = 'live' | 'demo';

interface LiveBookingsState {
  mode: BookingsMode;
  items: BookingSummary[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  busy: boolean;
  /** Real bookable slots for a day. Empty means genuinely closed or fully booked. */
  slots: AvailabilitySlot[];
  slotsLoading: boolean;
  loadSlots: (params: { date: string; durationMinutes?: number; serviceRef?: string }) => Promise<void>;
  clearSlots: () => void;
  refresh: () => Promise<void>;
  create: (input: {
    bookingType: string;
    startsAt: string;
    durationMinutes: number;
    vehicleId?: string;
    serviceRef?: string;
    resourceId?: string;
    notes?: string;
  }) => Promise<{ ok: true; booking: BookingSummary } | { ok: false; error: ApiError }>;
  cancel: (id: string, reason?: string) => Promise<{ ok: boolean; error?: ApiError }>;
  /** Confirm a held booking, so it becomes a real appointment. */
  confirmBooking: (id: string) => Promise<{ ok: boolean; error?: ApiError }>;
}

const LiveBookingsContext = createContext<LiveBookingsState | null>(null);

export function LiveBookingsProvider({ children }: { children: React.ReactNode }) {
  // The store follows the session rather than probing a token slot, so signing
  // in or out re-reads the right list without a screen having to ask it to.
  const { isLive } = useLiveSession();
  const [items, setItems] = useState<BookingSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

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
      const page = await bookingsApi.list(1, 50);
      if (seq === requestSeq.current) {
        setItems(page.items);
        setTotal(page.total ?? page.items.length);
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

  const loadSlots = useCallback(
    async (params: { date: string; durationMinutes?: number; serviceRef?: string }) => {
      if (!isLive) {
        setSlots([]);
        return;
      }
      setSlotsLoading(true);
      try {
        const next = await bookingsApi.availability({
          date: params.date,
          durationMinutes: params.durationMinutes ?? 60,
          serviceRef: params.serviceRef,
        });
        setSlots(next);
        setError(null);
      } catch (err) {
        setSlots([]);
        setError(err as ApiError);
      } finally {
        setSlotsLoading(false);
      }
    },
    [isLive],
  );

  const clearSlots = useCallback(() => setSlots([]), []);

  const create = useCallback<LiveBookingsState['create']>(
    async (input) => {
      if (busy) return { ok: false, error: new ApiError('unknown', null, 'A booking is already in progress') };
      setBusy(true);
      try {
        const booking = await bookingsApi.create(input);
        // Re-read rather than appending locally: the server's list is the
        // authority on the booking's reference and status.
        await refresh();
        return { ok: true as const, booking };
      } catch (err) {
        return { ok: false as const, error: err as ApiError };
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const cancel = useCallback(
    async (id: string, reason?: string) => {
      if (busy) return { ok: false };
      setBusy(true);
      try {
        await bookingsApi.cancel(id, reason);
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

  const confirmBooking = useCallback(
    async (id: string) => {
      if (busy) return { ok: false };
      setBusy(true);
      try {
        await bookingsApi.confirm(id);
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

  const value = useMemo<LiveBookingsState>(
    () => ({
      mode: isLive ? 'live' : 'demo',
      items: isLive ? items : [],
      total: isLive ? total : 0,
      loading,
      error,
      busy,
      slots,
      slotsLoading,
      loadSlots,
      clearSlots,
      refresh,
      create,
      cancel,
      confirmBooking,
    }),
    [
      isLive,
      items,
      total,
      loading,
      error,
      busy,
      slots,
      slotsLoading,
      loadSlots,
      clearSlots,
      refresh,
      create,
      cancel,
      confirmBooking,
    ],
  );

  return <LiveBookingsContext.Provider value={value}>{children}</LiveBookingsContext.Provider>;
}

export function useLiveBookings(): LiveBookingsState {
  const value = useContext(LiveBookingsContext);
  if (!value) throw new Error('useLiveBookings must be used inside <LiveBookingsProvider>');
  return value;
}
