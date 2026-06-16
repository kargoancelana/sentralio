import { useState, useEffect, useCallback, useRef } from 'react';

// Simple in-memory cache
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30_000; // 30 seconds stale-while-revalidate

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T>(fetcher: () => Promise<T>, deps: any[] = [], cacheKey?: string) {
  const [state, setState] = useState<UseApiState<T>>(() => {
    // Initialize from cache if available
    if (cacheKey) {
      const cached = apiCache.get(cacheKey);
      if (cached) {
        return { data: cached.data as T, loading: false, error: null };
      }
    }
    return { data: null, loading: true, error: null };
  });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const hasCachedData = cacheKeyRef.current && apiCache.has(cacheKeyRef.current);
      if (!hasCachedData) {
        setState(prev => ({ ...prev, loading: true, error: null }));
      }
      try {
        const data = await fetcherRef.current();
        if (!cancelled) {
          setState({ data, loading: false, error: null });
          if (cacheKeyRef.current) {
            apiCache.set(cacheKeyRef.current, { data, timestamp: Date.now() });
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setState(prev => ({
            data: prev.data,
            loading: false,
            error: err.message || 'Unknown error'
          }));
        }
      }
    };
    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refetch = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      setState({ data, loading: false, error: null });
      if (cacheKeyRef.current) {
        apiCache.set(cacheKeyRef.current, { data, timestamp: Date.now() });
      }
    } catch (err: any) {
      setState(prev => ({
        data: prev.data,
        loading: false,
        error: err.message || 'Unknown error'
      }));
    }
  }, []);

  return { ...state, refetch };
}

export function useApiMutation<TArgs extends any[], TResult>(
  mutator: (...args: TArgs) => Promise<TResult>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async (...args: TArgs): Promise<TResult> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mutator(...args);
      setLoading(false);
      return result;
    } catch (err: any) {
      setError(err.message || 'Unknown error');
      setLoading(false);
      throw err;
    }
  };

  return { execute, loading, error };
}
