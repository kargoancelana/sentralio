/**
 * Unit tests for `useOrderDetail` hook.
 *
 * Covers:
 *   - Loading state on initial fetch
 *   - Successful data return
 *   - Error handling for 4xx/5xx responses
 *   - 15s network timeout with correct error message
 *   - retry() re-fetches without ?refresh=1
 *   - refresh() re-fetches with ?refresh=1
 *   - Abort on unmount (no state update after unmount)
 *   - Abort on orderSn change (cancels previous in-flight request)
 *   - Idle state when orderSn is null
 *
 * Requirements: 10.1, 10.3, 10.4, 10.5, 9.4
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOrderDetail } from '../useOrderDetail';
import type { OrderDetailResponse } from '../../types/order-detail';

// ── Minimal fixture ──────────────────────────────────────────────────────────

const MOCK_ORDER_SN = 'ORDER123456';

const MOCK_RESPONSE: OrderDetailResponse = {
  marketplace: 'shopee',
  orderSn: MOCK_ORDER_SN,
  orderStatus: 'READY_TO_SHIP',
  buyerUsername: 'buyer_test',
  recipientAddress: {
    name: 'J*** D***',
    phone: '+62***1234',
    fullAddress: 'Jl. Test No. 1',
    town: null,
    district: 'Kec. Test',
    city: 'Jakarta',
    state: 'DKI Jakarta',
    region: null,
    zipcode: '12345',
  },
  packages: [],
  incomeBreakdown: {
    items: [],
    productSubtotal: 100_000,
    shipping: { buyerPaid: 10_000, actualToCarrier: 8_000, shopeeRebate: 0, rollup: 2_000 },
    fees: { adminFee: 2_000, serviceFee: 1_000, processingFee: 500 },
    totalEstimatedIncome: 96_500,
  },
  adjustments: [],
  finalEarnings: { amount: 96_500, isFallback: false },
  buyerPayment: {
    productSubtotal: 100_000,
    shippingFee: 10_000,
    shopeeVoucher: 0,
    sellerVoucher: 0,
    serviceFee: 1_000,
    total: 111_000,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a fetch mock that resolves immediately with a JSON body.
 * Respects AbortSignal so abort-related tests work correctly.
 */
function makeFetchMock(status: number, body: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((_url: string, opts?: { signal?: AbortSignal }) => {
    return new Promise<Response>((resolve, reject) => {
      // If already aborted before we even start, reject immediately
      if (opts?.signal?.aborted) {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
        return;
      }
      const response = {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response;
      // Resolve on next microtask so React state updates are batched properly
      Promise.resolve().then(() => resolve(response));
      opts?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
  });
}

/**
 * Creates a fetch mock that never resolves but can be aborted.
 */
function makeHangingFetchMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((_url: string, opts?: { signal?: AbortSignal }) => {
    return new Promise<Response>((_resolve, reject) => {
      opts?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useOrderDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Idle state ─────────────────────────────────────────────────────────────

  it('returns idle state when orderSn is null', () => {
    vi.stubGlobal('fetch', vi.fn());

    const { result } = renderHook(() => useOrderDetail(null));

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('sets loading=true immediately after orderSn is provided', async () => {
    vi.stubGlobal('fetch', makeHangingFetchMock());

    const { result, unmount } = renderHook(() => useOrderDetail(MOCK_ORDER_SN));

    // loading should be true synchronously after the effect fires
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    unmount();
  });

  // ── Successful data return ─────────────────────────────────────────────────

  it('populates data and clears loading/error on a successful 200 response', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, { success: true, data: MOCK_RESPONSE }));

    const { result } = renderHook(() => useOrderDetail(MOCK_ORDER_SN));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(MOCK_RESPONSE);
    expect(result.current.error).toBeNull();
  });

  it('calls the correct URL for a given orderSn', async () => {
    const fetchMock = makeFetchMock(200, { success: true, data: MOCK_RESPONSE });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useOrderDetail(MOCK_ORDER_SN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe(`/api/orders/${MOCK_ORDER_SN}/detail`);
    expect(calledUrl).not.toContain('refresh');
  });

  // ── Error handling for 4xx/5xx ─────────────────────────────────────────────

  it('sets error with server message on a 404 response', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock(404, { success: false, error: 'Order tidak ditemukan' }),
    );

    const { result } = renderHook(() => useOrderDetail(MOCK_ORDER_SN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toEqual({
      message: 'Order tidak ditemukan',
      canRetry: true,
    });
  });

  it('sets error with server message on a 502 response', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock(502, { success: false, error: 'Upstream Shopee error' }),
    );

    const { result } = renderHook(() => useOrderDetail(MOCK_ORDER_SN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toEqual({
      message: 'Upstream Shopee error',
      canRetry: true,
    });
  });

  it('falls back to "HTTP <status>" when error body is not parseable JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => { throw new SyntaxError('bad json'); },
      } as unknown as Response),
    );

    const { result } = renderHook(() => useOrderDetail(MOCK_ORDER_SN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error?.message).toBe('HTTP 500');
    expect(result.current.error?.canRetry).toBe(true);
  });

  // ── 15s network timeout ────────────────────────────────────────────────────

  it('sets timeout error message after 15 seconds with canRetry=true', async () => {
    vi.useFakeTimers();

    vi.stubGlobal('fetch', makeHangingFetchMock());

    const { result } = renderHook(() => useOrderDetail(MOCK_ORDER_SN));

    // Advance fake timers past the 15s timeout
    await act(async () => {
      vi.advanceTimersByTime(15_001);
      // Flush microtasks so the abort handler and state updates run
      await Promise.resolve();
      await Promise.resolve();
    });

    // Restore real timers before waitFor so its polling works
    vi.useRealTimers();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toEqual({
      message: 'Permintaan timeout. Silakan coba lagi.',
      canRetry: true,
    });
    expect(result.current.data).toBeNull();
  });

  // ── retry() ───────────────────────────────────────────────────────────────

  it('retry() re-fetches without ?refresh=1 and clears the previous error', async () => {
    const fetchMock = vi
      .fn()
      // First call: error
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ success: false, error: 'Service unavailable' }),
      } as unknown as Response)
      // Second call (retry): success
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: MOCK_RESPONSE }),
      } as unknown as Response);

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useOrderDetail(MOCK_ORDER_SN));

    // Wait for first (error) response
    await waitFor(() => expect(result.current.error).not.toBeNull());

    // Trigger retry
    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.data).toEqual(MOCK_RESPONSE));

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);

    // Verify the retry URL does NOT include ?refresh=1
    const retryUrl = fetchMock.mock.calls[1][0] as string;
    expect(retryUrl).not.toContain('refresh');
  });

  // ── refresh() ─────────────────────────────────────────────────────────────

  it('refresh() re-fetches with ?refresh=1', async () => {
    const fetchMock = vi
      .fn()
      // First call: success
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: MOCK_RESPONSE }),
      } as unknown as Response)
      // Second call (refresh): success
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: MOCK_RESPONSE }),
      } as unknown as Response);

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useOrderDetail(MOCK_ORDER_SN));

    // Wait for initial load
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Trigger refresh
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Verify the refresh URL includes ?refresh=1
    const refreshUrl = fetchMock.mock.calls[1][0] as string;
    expect(refreshUrl).toContain('?refresh=1');
  });

  it('refresh() does not carry ?refresh=1 into a subsequent retry()', async () => {
    const fetchMock = vi
      .fn()
      // Initial load
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: MOCK_RESPONSE }),
      } as unknown as Response)
      // refresh() call — returns error so we can then retry
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ success: false, error: 'err' }),
      } as unknown as Response)
      // retry() call after the refresh error
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: MOCK_RESPONSE }),
      } as unknown as Response);

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useOrderDetail(MOCK_ORDER_SN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.refresh(); });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => { result.current.retry(); });
    await waitFor(() => expect(result.current.data).toEqual(MOCK_RESPONSE));

    const retryUrl = fetchMock.mock.calls[2][0] as string;
    expect(retryUrl).not.toContain('refresh');
  });

  // ── Abort on unmount ───────────────────────────────────────────────────────

  it('does not update state after unmount (abort on unmount)', async () => {
    // Slow fetch — resolves after a delay via a controllable promise
    let resolveFetch!: (r: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => { resolveFetch = resolve; });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts?: { signal?: AbortSignal }) => {
        return new Promise<Response>((resolve, reject) => {
          fetchPromise.then(resolve);
          opts?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }),
    );

    const { result, unmount } = renderHook(() => useOrderDetail(MOCK_ORDER_SN));

    // Confirm loading started
    await waitFor(() => expect(result.current.loading).toBe(true));

    // Unmount before the fetch resolves
    unmount();

    // Now resolve the fetch — should not cause any state update
    await act(async () => {
      resolveFetch({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: MOCK_RESPONSE }),
      } as Response);
      await Promise.resolve();
    });

    // State should remain at the values captured at unmount time (loading=true, data=null)
    // The key assertion is that no error is thrown and data stays null.
    expect(result.current.data).toBeNull();
  });

  // ── Abort on orderSn change ────────────────────────────────────────────────

  it('cancels the previous in-flight request when orderSn changes', async () => {
    const ORDER_SN_2 = 'ORDER_NEW_999';
    const MOCK_RESPONSE_2 = { ...MOCK_RESPONSE, orderSn: ORDER_SN_2 };

    // First call: slow (controllable)
    let resolveFirst!: (r: Response) => void;
    const firstFetchPromise = new Promise<Response>((resolve) => { resolveFirst = resolve; });

    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, opts?: { signal?: AbortSignal }) => {
        return new Promise<Response>((resolve, reject) => {
          firstFetchPromise.then(resolve);
          opts?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      })
      // Second call (ORDER_NEW_999): fast
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: MOCK_RESPONSE_2 }),
      } as unknown as Response);

    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ sn }: { sn: string }) => useOrderDetail(sn),
      { initialProps: { sn: MOCK_ORDER_SN } },
    );

    // Confirm first fetch started
    await waitFor(() => expect(result.current.loading).toBe(true));

    // Change orderSn before the first fetch resolves
    rerender({ sn: ORDER_SN_2 });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should have the data from the second (new) orderSn, not the first
    expect(result.current.data?.orderSn).toBe(ORDER_SN_2);

    // Resolve the first fetch after the fact — should not overwrite state
    await act(async () => {
      resolveFirst({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: MOCK_RESPONSE }),
      } as Response);
      await Promise.resolve();
    });

    // Data should still be from the second orderSn
    expect(result.current.data?.orderSn).toBe(ORDER_SN_2);
  });

  // ── Transition from null to a real orderSn ─────────────────────────────────

  it('starts fetching when orderSn transitions from null to a value', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, { success: true, data: MOCK_RESPONSE }));

    const { result, rerender } = renderHook(
      ({ sn }: { sn: string | null }) => useOrderDetail(sn),
      { initialProps: { sn: null } },
    );

    // Initially idle
    expect(result.current.loading).toBe(false);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();

    // Provide a real orderSn
    rerender({ sn: MOCK_ORDER_SN });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(MOCK_RESPONSE);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  // ── Transition from a real orderSn back to null ────────────────────────────

  it('resets to idle state when orderSn transitions back to null', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, { success: true, data: MOCK_RESPONSE }));

    const { result, rerender } = renderHook(
      ({ sn }: { sn: string | null }) => useOrderDetail(sn),
      { initialProps: { sn: MOCK_ORDER_SN } },
    );

    await waitFor(() => expect(result.current.data).toEqual(MOCK_RESPONSE));

    // Reset orderSn to null
    rerender({ sn: null });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
