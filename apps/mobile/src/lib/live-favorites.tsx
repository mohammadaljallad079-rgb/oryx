/**
 * The server-backed favourites.
 *
 * The same split as the cart, for the same reason: the demo favourites live in
 * storage and this one lives on the server. A screen reads `mode` and says which
 * it is showing, so a demo favourite is never presented as a saved marketplace
 * record.
 *
 * Ownership is the server's to enforce — every call carries the caller's own
 * token and the API scopes the query to that account, so this store never sends
 * an account id and cannot ask for someone else's list.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { api, ApiError, getAccessToken, type FavoriteResponse } from './api';

export type FavoritesMode = 'live' | 'demo';

interface LiveFavoritesState {
  mode: FavoritesMode;
  items: FavoriteResponse[];
  loading: boolean;
  error: ApiError | null;
  /** True while a write is in flight, so a heart cannot be double-tapped. */
  busy: boolean;
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const LiveFavoritesContext = createContext<LiveFavoritesState | null>(null);

export function LiveFavoritesProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<FavoriteResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState<boolean>(() => getAccessToken() !== null);

  // Keeps a slow response from overwriting a newer list when the user taps
  // several hearts in quick succession.
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (getAccessToken() === null) {
      setHasSession(false);
      setItems([]);
      return;
    }
    setHasSession(true);
    const seq = (requestSeq.current += 1);
    setLoading(true);
    try {
      const next = await api.favorites.list();
      if (seq === requestSeq.current) {
        setItems(next);
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

  const ids = useMemo(() => new Set(items.map((f) => f.productId)), [items]);

  const toggle = useCallback(
    async (productId: string) => {
      if (busy) return;
      setBusy(true);
      try {
        if (ids.has(productId)) {
          await api.favorites.remove(productId);
        } else {
          await api.favorites.add(productId);
        }
        // Re-read rather than patching locally: the server's list is the
        // authority, and this keeps the heart and the list from disagreeing.
        await refresh();
        setError(null);
      } catch (err) {
        setError(err as ApiError);
      } finally {
        setBusy(false);
      }
    },
    [busy, ids, refresh],
  );

  const value = useMemo<LiveFavoritesState>(
    () => ({
      mode: hasSession ? 'live' : 'demo',
      items: hasSession ? items : [],
      loading,
      error,
      busy,
      isFavorite: (productId: string) => hasSession && ids.has(productId),
      toggle,
      refresh,
    }),
    [hasSession, items, loading, error, busy, ids, toggle, refresh],
  );

  return <LiveFavoritesContext.Provider value={value}>{children}</LiveFavoritesContext.Provider>;
}

export function useLiveFavorites(): LiveFavoritesState {
  const value = useContext(LiveFavoritesContext);
  if (!value) throw new Error('useLiveFavorites must be used inside <LiveFavoritesProvider>');
  return value;
}
