/**
 * A tiny data-loading hook.
 *
 * Every screen that reads from `repository` needs the same three states, and the
 * brief asks for real loading, empty and error states rather than a spinner that
 * never appears. This hook owns that shape so a screen cannot forget one.
 *
 * The `deps` array re-runs the loader, which is how a filter change or a demo
 * reset refreshes a list.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

export function useAsync<T>(loader: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  // A slow loader that resolves after the screen unmounts must not set state.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The loader identity changes every render, so it is held in a ref and the
  // effect is keyed on the caller's deps instead.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((value) => {
        if (alive.current) setData(value);
      })
      .catch((err: unknown) => {
        if (alive.current) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}
