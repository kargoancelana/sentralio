/**
 * Order Detail Cache Service
 *
 * In-memory cache for Order Detail API responses, keyed by `orderSn`.
 * TTL defaults to 300 seconds (5 minutes) — short enough to reflect
 * changing estimative values before an order reaches COMPLETED status,
 * long enough to make repeated modal opens feel instant.
 *
 * The cache is intentionally NOT database-backed: the data is estimative,
 * the cardinality of active orders per seller is small, and a server
 * restart naturally clears stale estimates.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3**
 */

// ---------------------------------------------------------------------------
// Inline type definition for OrderDetailResponse
// The full interface is defined in apps/web/src/types/order-detail.ts (frontend).
// The backend uses this minimal structural type to avoid a cross-package import.
// When order-detail.service.ts is implemented it will import OrderDetailResponse
// from its own types file and pass it here; the cache is generic over the shape.
// ---------------------------------------------------------------------------

export interface OrderDetailResponse {
  marketplace: string;
  orderSn: string;
  orderStatus: string;
  buyerUsername: string | null;
  recipientAddress: {
    name: string;
    phone: string;
    fullAddress: string;
    town: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    region: string | null;
    zipcode: string | null;
  };
  packages: Array<{
    label: string;
    courierService: string;
    items: Array<{
      itemId: string;
      modelId: string;
      itemName: string;
      modelName: string | null;
      quantity: number;
      imageUrl: string | null;
    }>;
  }>;
  incomeBreakdown: {
    items: Array<{
      itemId: string;
      modelId: string;
      itemName: string;
      modelName: string | null;
      modelSku: string | null;
      unitPrice: number;
      quantity: number;
      subtotal: number;
      imageUrl: string | null;
    }>;
    productSubtotal: number;
    shipping: {
      buyerPaid: number;
      actualToCarrier: number;
      shopeeRebate: number;
      rollup: number;
    };
    fees: {
      adminFee: number;
      serviceFee: number;
      processingFee: number;
    };
    totalEstimatedIncome: number;
  };
  adjustments: Array<{
    reason: string;
    amount: number;
  }>;
  finalEarnings: {
    amount: number;
    isFallback: boolean;
  };
  buyerPayment: {
    productSubtotal: number;
    shippingFee: number;
    shopeeVoucher: number;
    sellerVoucher: number;
    serviceFee: number;
    total: number;
  };
}

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

export interface OrderDetailCacheEntry {
  data: OrderDetailResponse;
  /** Epoch milliseconds at which this entry expires. */
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Cache class
// ---------------------------------------------------------------------------

/**
 * In-memory TTL cache for `OrderDetailResponse` objects.
 *
 * @example
 * ```ts
 * const cache = new OrderDetailCache();
 * cache.set("ORD123", responseData);
 * const hit = cache.get("ORD123"); // returns data or null if expired/missing
 * cache.invalidate("ORD123");
 * ```
 */
export class OrderDetailCache {
  private store = new Map<string, OrderDetailCacheEntry>();

  /**
   * @param ttlMs  Time-to-live in milliseconds. Defaults to 300 000 ms (5 min).
   * @param now    Injectable clock function — defaults to `Date.now`.
   *               Inject a controlled clock in tests to avoid real-time waits.
   */
  constructor(
    private readonly ttlMs: number = 5 * 60 * 1000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Retrieve a cached response for the given `orderSn`.
   *
   * Returns `null` when:
   * - No entry exists for `orderSn`.
   * - The entry exists but has expired (i.e. `now() >= entry.expiresAt`).
   *   Expired entries are lazily evicted on access.
   *
   * **Validates: Requirements 9.1, 9.2**
   */
  get(orderSn: string): OrderDetailResponse | null {
    const entry = this.store.get(orderSn);
    if (!entry) {
      return null;
    }

    if (this.now() >= entry.expiresAt) {
      // Lazy eviction of expired entry
      this.store.delete(orderSn);
      return null;
    }

    return entry.data;
  }

  /**
   * Store a response in the cache under `orderSn`.
   *
   * If an entry already exists for `orderSn` it is overwritten and the TTL
   * is reset from the current clock value.
   *
   * **Validates: Requirements 9.3**
   */
  set(orderSn: string, data: OrderDetailResponse): void {
    this.store.set(orderSn, {
      data,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  /**
   * Remove the cached entry for `orderSn`, if any.
   *
   * Calling `invalidate` on a key that does not exist is a no-op.
   *
   * **Validates: Requirements 9.3**
   */
  invalidate(orderSn: string): void {
    this.store.delete(orderSn);
  }

  /**
   * Return the number of entries currently in the store, including entries
   * that may have expired but have not yet been lazily evicted.
   *
   * Useful for monitoring and tests.
   */
  size(): number {
    return this.store.size;
  }
}
