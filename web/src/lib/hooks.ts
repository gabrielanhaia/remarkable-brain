/** Small data-fetching primitive for the read-only API. No cache, no library — one request per view. */
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError } from '../api/client.js';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ApiRequestError | Error | null;
  /** Convenience: true when the failure is the friendly empty-index (503) state. */
  isEmptyIndex: boolean;
  reload: () => void;
}

/**
 * Run an async `fn` and track loading/error/data. Re-runs whenever any value in `deps` changes.
 * `fn` should be stable-ish; we intentionally key re-execution off `deps` (like useEffect).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiRequestError | Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fn()
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setData(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const isEmptyIndex = error instanceof ApiRequestError && error.isEmptyIndex;
  return { data, loading, error, isEmptyIndex, reload };
}

/** Debounce any changing value by `ms` (used for the live search box). */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
