/**
 * Small async-data hook used by every screen.
 *
 * It deliberately exposes `reload` rather than a cache: the mobile app reads
 * live operational data (slots, booking status, payments), so a stale cache is
 * worse than a refetch.
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

  // Guards against a resolved request from a previous dependency set overwriting
  // the result of the current one (for example when the selected date changes).
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
