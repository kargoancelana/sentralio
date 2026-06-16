/**
 * label-validation.service.ts
 *
 * Validates order eligibility for label printing.
 * Handles both single-order and batch validation with a single DB query.
 *
 * **Validates: Requirements 2.2, 5.1–5.10, 7.1, 7.6, 11.6**
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { shopeeOrders } from "../db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderRecord {
  id: number;
  shopId: number;
  orderSn: string;
  orderStatus: string;
  totalAmount: number;
  buyerUsername: string | null;
  shippingCarrier: string | null;
  trackingNumber: string | null;
  payTime: Date | null;
  createTime: Date;
  updatedAt: Date;
}

export const LABEL_ELIGIBLE_STATUSES = ['PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE'] as const;

// ─── validateLabelEligibility ─────────────────────────────────────────────────

/**
 * Validate order eligibility for label printing (single order).
 *
 * Checks:
 * 1. Order exists in database
 * 2. Order status is in LABEL_ELIGIBLE_STATUSES
 *
 * **Validates: Requirements 2.2, 11.6**
 */
export async function validateLabelEligibility(orderSn: string): Promise<{
  valid: boolean;
  order?: OrderRecord;
  error?: string;
}> {
  try {
    const orderRows = await db.select()
      .from(shopeeOrders)
      .where(eq(shopeeOrders.orderSn, orderSn))
      .limit(1);

    if (orderRows.length === 0) {
      return {
        valid: false,
        error: `Order ${orderSn} tidak ditemukan dalam database`,
      };
    }

    const order = orderRows[0];
    if (!order) {
      return { valid: false, error: `Order ${orderSn} tidak ditemukan dalam database` };
    }

    if (!LABEL_ELIGIBLE_STATUSES.includes(order.orderStatus as any)) {
      return {
        valid: false,
        error: `Order ${orderSn} tidak dapat dicetak labelnya: status saat ini adalah ${order.orderStatus}`,
      };
    }

    return { valid: true, order: order as OrderRecord };
  } catch (error: any) {
    console.error('[label-validation] validateLabelEligibility error:', {
      timestamp: new Date().toISOString(),
      orderSn,
      errorType: 'validation',
      message: error.message,
      stack: error.stack,
    });
    return { valid: false, error: `Gagal memvalidasi order: ${error.message}` };
  }
}

// ─── batchValidateLabelEligibility ───────────────────────────────────────────

/**
 * Batch validate label eligibility with ONE DB query instead of N sequential queries.
 *
 * - Empty input fast-path: returns [] without a DB query.
 * - On DB exception: falls back to per-order validateLabelEligibility.
 * - Output order mirrors input order (output[i] ↔ input[i]).
 *
 * **Validates: Requirements 5.1–5.10, 7.1, 7.6**
 */
export async function batchValidateLabelEligibility(orderSns: string[]): Promise<Array<{
  valid: boolean;
  order?: OrderRecord;
  error?: string;
}>> {
  if (orderSns.length === 0) return [];

  try {
    const uniqueSns = [...new Set(orderSns)];

    const rows = await db.select()
      .from(shopeeOrders)
      .where(inArray(shopeeOrders.orderSn, uniqueSns));

    const byOrderSn = new Map<string, OrderRecord>();
    for (const r of rows) byOrderSn.set(r.orderSn, r as OrderRecord);

    return orderSns.map((orderSn) => {
      const order = byOrderSn.get(orderSn);

      if (!order) {
        return {
          valid: false,
          error: `Order ${orderSn} tidak ditemukan dalam database`,
        };
      }

      if (!LABEL_ELIGIBLE_STATUSES.includes(order.orderStatus as any)) {
        return {
          valid: false,
          error: `Order ${orderSn} tidak dapat dicetak labelnya: status saat ini adalah ${order.orderStatus}`,
        };
      }

      return { valid: true, order };
    });
  } catch (err: any) {
    console.warn('[label-validation] batchValidateLabelEligibility failed, falling back per-order:', err.message);
    return Promise.all(orderSns.map(sn => validateLabelEligibility(sn)));
  }
}
