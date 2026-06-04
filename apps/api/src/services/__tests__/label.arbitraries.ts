/**
 * Shared fast-check arbitraries for label print flow optimization property tests.
 *
 * All arbitraries in this file are pure generators — no test cases, no side effects.
 * Import these into property test files to get well-shaped, domain-constrained inputs.
 *
 * Shapes are documented in design.md § "Arbitraries".
 */

import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Re-declare OrderRecord shape locally to avoid importing from label.service.ts
// (which has DB-level side effects at module load time).
// The shape must match the interface in label.service.ts exactly.
// ---------------------------------------------------------------------------

export interface OrderRecord {
  id: number;
  shopId: number;
  orderSn: string;
  orderStatus: string;
  totalAmount: number;
  buyerUsername: string | null;
  shippingCarrier: string | null;
  trackingNumber: string | null; // explicit declaration (design.md Data Models)
  payTime: Date | null;
  createTime: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// ShopeeDownloadResponse shape (used by Background_Cache_Populate tests)
// ---------------------------------------------------------------------------

export type ShopeeDownloadResponseKind =
  | { kind: "success"; pageCount: number }
  | { kind: "failure"; errorMsg: string }
  | { kind: "empty"; base64: "" }
  | { kind: "garbage"; bytes: Uint8Array }
  | { kind: "timeout" };

// ---------------------------------------------------------------------------
// Primitive character sets
// ---------------------------------------------------------------------------

const DIGITS = "0123456789";
const ALPHANUMERIC_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// ---------------------------------------------------------------------------
// arbOrderSn
//
// Shopee order SN: 14-char numeric string (matches real Shopee SN format).
// ---------------------------------------------------------------------------

export const arbOrderSn = (): fc.Arbitrary<string> =>
  fc.string({
    minLength: 14,
    maxLength: 14,
    unit: fc.constantFrom(...DIGITS),
  });

// ---------------------------------------------------------------------------
// arbPackageNumber
//
// Shopee package number: 8–32 uppercase-alphanumeric characters.
// ---------------------------------------------------------------------------

export const arbPackageNumber = (): fc.Arbitrary<string> =>
  fc.string({
    minLength: 8,
    maxLength: 32,
    unit: fc.constantFrom(...ALPHANUMERIC_UPPER),
  });

// ---------------------------------------------------------------------------
// arbTrackingNumber
//
// Tracking number: null | empty | whitespace-only | valid non-empty string.
// Tests must handle all four cases for skip-tracking and validation logic.
// ---------------------------------------------------------------------------

export const arbTrackingNumber = (): fc.Arbitrary<string | null> =>
  fc.oneof(
    fc.constant(null),
    fc.constant(""),
    fc.constant("   "),
    fc.string({ minLength: 5, maxLength: 24 }),
  );

// ---------------------------------------------------------------------------
// arbUpdatedAt(now)
//
// Returns a Date that is either:
//   - "fresh":  within the last 23 hours of `now` (≤ STALE_SHIP_THRESHOLD_MS = 24h)
//   - "stale":  between 25 hours and 30 days ago
//
// This distribution exercises both branches of classifyChunkFreshness.
// ---------------------------------------------------------------------------

export const arbUpdatedAt = (now: number): fc.Arbitrary<Date> =>
  fc
    .oneof(
      // fresh: within last 23 hours
      fc.integer({ min: now - 23 * 3_600_000, max: now }),
      // stale: between 25 hours and 30 days ago
      fc.integer({ min: now - 30 * 24 * 3_600_000, max: now - 25 * 3_600_000 }),
    )
    .map((ms) => new Date(ms));

// ---------------------------------------------------------------------------
// arbOrderStatus
//
// All known Shopee order statuses — covers both eligible and ineligible.
// Eligible:   PROCESSED, SHIPPED, TO_CONFIRM_RECEIVE
// Ineligible: UNPAID, READY_TO_SHIP, CANCELLED, COMPLETED, IN_CANCEL
// ---------------------------------------------------------------------------

export const arbOrderStatus = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    "PROCESSED",
    "SHIPPED",
    "TO_CONFIRM_RECEIVE", // eligible
    "UNPAID",
    "READY_TO_SHIP",
    "CANCELLED",
    "COMPLETED",
    "IN_CANCEL", // ineligible
  );

// ---------------------------------------------------------------------------
// arbPdfPageCount
//
// Integer number of pages in a PDF: 1–5.
// Used to drive mock multi-page PDF generation in property tests.
// ---------------------------------------------------------------------------

export const arbPdfPageCount = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: 5 });

// ---------------------------------------------------------------------------
// arbShopeeDownloadResponse
//
// Mock Shopee download_shipping_document response covering:
//   - success:  valid PDF (caller uses pageCount to build a real PDF buffer)
//   - failure:  error response from Shopee API
//   - empty:    base64 = "" (empty PDF, Requirement 1.6)
//   - garbage:  non-PDF bytes (missing %PDF- magic header, Requirement 6.6)
//   - timeout:  simulates > 30 s elapsed (BG_DOWNLOAD_TIMEOUT_MS, Requirement 1.11)
// ---------------------------------------------------------------------------

export const arbShopeeDownloadResponse = (): fc.Arbitrary<ShopeeDownloadResponseKind> =>
  fc.oneof(
    fc.record({
      kind: fc.constant("success" as const),
      pageCount: arbPdfPageCount(),
    }),
    fc.record({
      kind: fc.constant("failure" as const),
      errorMsg: fc.string({ minLength: 1, maxLength: 50 }),
    }),
    fc.constant({ kind: "empty" as const, base64: "" as const }),
    fc.record({
      kind: fc.constant("garbage" as const),
      bytes: fc.uint8Array({ minLength: 10, maxLength: 100 }),
    }),
    fc.constant({ kind: "timeout" as const }),
  );

// ---------------------------------------------------------------------------
// arbOrderRecord(now)
//
// Full OrderRecord shape as stored in the shopee_orders table.
// Covers the fields used by:
//   - batchValidateLabelEligibility (orderStatus, orderSn)
//   - classifyChunkFreshness (updatedAt)
//   - trackingSkip pre-query (trackingNumber)
//   - Background_Cache_Populate (shopId, orderSn)
// ---------------------------------------------------------------------------

export const arbOrderRecord = (now: number): fc.Arbitrary<OrderRecord> =>
  fc.record({
    id: fc.integer({ min: 1, max: 2_147_483_647 }),
    shopId: fc.integer({ min: 1, max: 1_000_000 }),
    orderSn: arbOrderSn(),
    orderStatus: arbOrderStatus(),
    totalAmount: fc.integer({ min: 0, max: 2_147_483_647 }),
    buyerUsername: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
    shippingCarrier: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: null }),
    trackingNumber: arbTrackingNumber(),
    payTime: fc.option(
      fc.integer({ min: 0, max: now }).map((ms) => new Date(ms)),
      { nil: null },
    ),
    createTime: fc.integer({ min: 0, max: now }).map((ms) => new Date(ms)),
    updatedAt: arbUpdatedAt(now),
  });
