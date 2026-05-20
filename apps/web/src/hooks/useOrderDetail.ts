import { useState, useEffect, useCallback, useRef } from 'react';
import type { OrderDetailResponse } from '../types/order-detail';

const NETWORK_TIMEOUT_MS = 15_000; // 15 seconds per Requirement 10.5
const TIMEOUT_ERROR_MESSAGE = 'Permintaan timeout. Silakan coba lagi.';

export interface OrderDetailError {
  message: string;
  canRetry: boolean;
}

export interface UseOrderDetailResult {
  data: OrderDetailResponse | null;
  loading: boolean;
  error: OrderDetailError | null;
  refresh: () => void; // forces ?refresh=1
  retry: () => void;   // re-fetches without ?refresh=1
}

/**
 * Fetches order detail from GET /api/orders/:orderSn/detail.
 *
 * - Uses AbortController to cancel in-flight requests on orderSn change or unmount.
 * - Applies a 15s network-level timeout (Requirement 10.5).
 * - refresh() re-fetches with ?refresh=1 (bypasses server cache, Requirement 9.4).
 * - retry() re-fetches without ?refresh=1.
 * - When orderSn is null, returns idle state without issuing any request.
 */
export function useOrderDetail(orderSn: string | null): UseOrderDetailResult {
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<OrderDetailError | null>(null);

  // Tracks whether the current fetch should include ?refresh=1
  const refreshFlagRef = useRef<boolean>(false);

  // Increment to trigger a re-fetch without changing orderSn
  const [fetchTrigger, setFetchTrigger] = useState<number>(0);

  useEffect(() => {
    if (!orderSn) {
      // Reset to idle state when orderSn is null
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    // Build URL — include ?refresh=1 when the flag is set
    const url = refreshFlagRef.current
      ? `/api/orders/${encodeURIComponent(orderSn)}/detail?refresh=1`
      : `/api/orders/${encodeURIComponent(orderSn)}/detail`;

    // Reset the refresh flag after consuming it so subsequent retries don't carry it
    refreshFlagRef.current = false;

    setLoading(true);
    setError(null);

    // Set up a 15s timeout that aborts the fetch
    const timeoutId = setTimeout(() => {
      controller.abort('timeout');
    }, NETWORK_TIMEOUT_MS);

    (async () => {
      try {
        const response = await fetch(url, { signal });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // Parse error message from JSON body when available
          let message = `HTTP ${response.status}`;
          try {
            const body = await response.json();
            if (body && typeof body.error === 'string') {
              message = body.error;
            }
          } catch {
            // Ignore JSON parse failures; use the status-based message
          }
          setError({ message, canRetry: true });
          setData(null);
          setLoading(false);
          return;
        }

        const body = await response.json();
        setData(body.data as OrderDetailResponse);
        setError(null);
        setLoading(false);
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        if (signal.aborted) {
          // Distinguish timeout abort from orderSn-change / unmount abort
          if (signal.reason === 'timeout') {
            setError({ message: TIMEOUT_ERROR_MESSAGE, canRetry: true });
            setData(null);
            setLoading(false);
          }
          // For non-timeout aborts (orderSn change / unmount) we do nothing —
          // the next effect run (or cleanup) handles state.
          return;
        }

        // Unexpected network error
        const message =
          err instanceof Error ? err.message : 'Terjadi kesalahan jaringan.';
        setError({ message, canRetry: true });
        setData(null);
        setLoading(false);
      }
    })();

    return () => {
      clearTimeout(timeoutId);
      controller.abort('cancelled');
    };
    // fetchTrigger is intentionally included so that retry() / refresh() re-run this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSn, fetchTrigger]);

  /** Re-fetches with ?refresh=1 to bypass the server-side cache (Requirement 9.4). */
  const refresh = useCallback(() => {
    refreshFlagRef.current = true;
    setFetchTrigger(n => n + 1);
  }, []);

  /** Re-fetches without ?refresh=1 (plain retry after an error). */
  const retry = useCallback(() => {
    refreshFlagRef.current = false;
    setFetchTrigger(n => n + 1);
  }, []);

  return { data, loading, error, refresh, retry };
}
