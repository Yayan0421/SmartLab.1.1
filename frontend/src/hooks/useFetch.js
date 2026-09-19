import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async fetcher and tracks loading/error/data.
 *
 * `deps` controls when it re-runs. A ref guards against setting state after
 * unmount, and against an older response overwriting a newer one when
 * filters change quickly.
 */
export default function useFetch(fetcher, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const mounted = useRef(true);
  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (mounted.current && id === requestId.current) setData(result);
      return result;
    } catch (err) {
      if (mounted.current && id === requestId.current) setError(err.message);
      return null;
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (immediate) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: run, setData };
}
