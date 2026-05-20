import { useState, useEffect, useCallback } from 'react';

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

  const execute = useCallback(async () => {
    // If we have cached data, don't show loading spinner (stale-while-revalidate)
    const hasCachedData = cacheKey && apiCache.has(cacheKey);
    if (!hasCachedData) {
      setState(prev => ({ ...prev, loading: true, error: null }));
    }

    try {
      const data = await fetcher();
      setState({ data, loading: false, error: null });

      // Store in cache
      if (cacheKey) {
        apiCache.set(cacheKey, { data, timestamp: Date.now() });
      }
    } catch (err: any) {
      setState(prev => ({
        data: prev.data, // Keep stale data on error
        loading: false,
        error: err.message || 'Unknown error'
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  return { ...state, refetch: execute };
}

export function useApiMutation<TArgs extends any[], TResult>(
  mutator: (...args: TArgs) => Promise<TResult>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async (...args: TArgs): Promise<TResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mutator(...args);
      setLoading(false);
      return result;
    } catch (err: any) {
      setError(err.message || 'Unknown error');
      setLoading(false);
      return null;
    }
  };

  return { execute, loading, error };
}
