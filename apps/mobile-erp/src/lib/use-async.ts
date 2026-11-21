/**
 * Small async-data hook used by every screen.
 *
 * It exposes `reload` rather than a cache: the ERP reads live operational data
 * (stock levels, invoice totals, dashboard figures), so a stale cache is worse
 * than a refetch. A monotonic generation counter stops a resolved request from a
 * previous dependency set overwriting the current one — the failure mode when a
 * user types a new search term before the previous one answers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from './api';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    let active = true;
    setLoading(true);
    setError(null);

    loader()
      .then((result) => {
        if (active && current === generation.current) setData(result);
      })
      .catch((err: unknown) => {
        if (!active || current !== generation.current) return;
        setError(err instanceof ApiError ? err.message : 'Network request failed');
      })
      .finally(() => {
        if (active && current === generation.current) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, loading, error, reload };
}

/**
 * Debounce a rapidly changing value, used by the search boxes so a keystroke
 * does not fire a request per character.
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
