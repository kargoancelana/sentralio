/**
 * Shared fast-check arbitraries for Order Detail Modal property tests.
 *
 * These generators produce valid-shaped Shopee API payloads for use in
 * property-based tests. They are designed to cover edge cases including:
 * - Empty arrays, null/undefined fee fields
 * - Zero-quantity items
 * - Integer values capped at 2^31 - 1 (MySQL int range)
 * - Unicode strings (Indonesian + emoji) for item names
 * - "Drift" cases where escrow_amount + Σ adjustments ≠ escrow_amount_after_adjustment
 */

import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum safe integer for MySQL INT column */
const MAX_INT = 2_147_483_647;

// ---------------------------------------------------------------------------
// Primitive arbitraries
// ---------------------------------------------------------------------------

/** Non-negative integer up to MySQL INT max */
export const arbNonNegInt = fc.integer({ min: 0, max: MAX_INT });

/** Integer (positive or negative) within MySQL INT range */
export const arbInt = fc.integer({ min: -MAX_INT, max: MAX_INT });

/** Nullable non-negative integer (null represents missing field from Shopee) */
export const arbNullableNonNegInt = fc.option(arbNonNegInt, { nil: null });

/** Nullable integer (null represents missing field from Shopee) */
export const arbNullableInt = fc.option(arbInt, { nil: null });

/** Indonesian-flavored string including Unicode and emoji */
export const arbIndonesianString = fc.oneof(
  fc.string({ minLength: 1, maxLength: 100 }),
  fc.constantFrom(
    "Kaos Polos Putih",
    "Celana Jeans Biru 🎉",
    "Sepatu Sneakers",
    "Tas Ransel Kulit",
    "Baju Batik Motif Parang",
    "Produk dengan nama sangat panjang yang melebihi batas normal untuk pengujian",
    "A",
    "123",
    "",
  )
);

/** Nullable string */
export const arbNullableString = fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: null });

// ---------------------------------------------------------------------------
// ShopeeOrderIncomeItem arbitrary
// ---------------------------------------------------------------------------

export interface ArbitraryIncomeItem {
  item_id: string;
  model_id: string;
  item_name: string;
  model_name: string | null;
  model_sku: string | null;
  discounted_price: number;
  quantity_purchased: number;
}

export const arbIncomeItem: fc.Arbitrary<ArbitraryIncomeItem> = fc.record({
  item_id: fc.string({ minLength: 1, maxLength: 20 }),
  model_id: fc.string({ minLength: 1, maxLength: 20 }),
  item_name: arbIndonesianString,
  model_name: arbNullableString,
  model_sku: arbNullableString,
  discounted_price: arbNonNegInt,
  quantity_purchased: fc.integer({ min: 0, max: 100 }),
});

// ---------------------------------------------------------------------------
// ShopeeOrderAdjustment arbitrary
// ---------------------------------------------------------------------------

export interface ArbitraryAdjustment {
  adjustment_reason: string;
  amount: number;
}

export const arbAdjustment: fc.Arbitrary<ArbitraryAdjustment> = fc.record({
  adjustment_reason: arbIndonesianString,
  amount: arbInt,
});

// ---------------------------------------------------------------------------
// ShopeeOrderIncome arbitrary
// ---------------------------------------------------------------------------

export interface ArbitraryOrderIncome {
  items: ArbitraryIncomeItem[];
  buyer_paid_shipping_fee: number | null;
  actual_shipping_fee: number | null;
  shopee_shipping_rebate: number | null;
  commission_fee: number | null;
  service_fee: number | null;
  seller_order_processing_fee: number | null;
  escrow_amount: number | null;
  escrow_amount_after_adjustment: number | null;
  order_adjustment: ArbitraryAdjustment[] | null;
}

export const arbOrderIncome: fc.Arbitrary<ArbitraryOrderIncome> = fc.record({
  items: fc.array(arbIncomeItem, { minLength: 0, maxLength: 10 }),
  buyer_paid_shipping_fee: arbNullableNonNegInt,
  actual_shipping_fee: arbNullableNonNegInt,
  shopee_shipping_rebate: arbNullableNonNegInt,
  commission_fee: arbNullableNonNegInt,
  service_fee: arbNullableNonNegInt,
  seller_order_processing_fee: arbNullableNonNegInt,
  escrow_amount: arbNullableInt,
  escrow_amount_after_adjustment: arbNullableInt,
  order_adjustment: fc.option(
    fc.array(arbAdjustment, { minLength: 0, maxLength: 5 }),
    { nil: null }
  ),
});

// ---------------------------------------------------------------------------
// ShopeeBuyerPaymentInfo arbitrary
// ---------------------------------------------------------------------------

export interface ArbitraryBuyerPaymentInfo {
  merchant_subtotal: number | null;
  shipping_fee: number | null;
  shopee_voucher: number | null;
  seller_voucher: number | null;
  buyer_service_fee: number | null;
  buyer_total_amount: number | null;
}

export const arbBuyerPaymentInfo: fc.Arbitrary<ArbitraryBuyerPaymentInfo> = fc.record({
  merchant_subtotal: arbNullableNonNegInt,
  shipping_fee: arbNullableNonNegInt,
  shopee_voucher: arbNullableNonNegInt,
  seller_voucher: arbNullableNonNegInt,
  buyer_service_fee: arbNullableNonNegInt,
  buyer_total_amount: arbNullableNonNegInt,
});

// ---------------------------------------------------------------------------
// Nullable-field variant of OrderIncome (all fee fields null/undefined)
// ---------------------------------------------------------------------------

/** OrderIncome where all fee fields are null — tests null normalization */
export const arbAllNullOrderIncome: fc.Arbitrary<Partial<ArbitraryOrderIncome>> = fc.constant({
  items: [],
  buyer_paid_shipping_fee: null,
  actual_shipping_fee: null,
  shopee_shipping_rebate: null,
  commission_fee: null,
  service_fee: null,
  seller_order_processing_fee: null,
  escrow_amount: null,
  escrow_amount_after_adjustment: null,
  order_adjustment: null,
});

/** OrderIncome with a random subset of fee fields set to null */
export const arbPartiallyNullOrderIncome: fc.Arbitrary<Partial<ArbitraryOrderIncome>> = fc.record({
  items: fc.array(arbIncomeItem, { minLength: 0, maxLength: 5 }),
  buyer_paid_shipping_fee: arbNullableNonNegInt,
  actual_shipping_fee: arbNullableNonNegInt,
  shopee_shipping_rebate: arbNullableNonNegInt,
  commission_fee: arbNullableNonNegInt,
  service_fee: arbNullableNonNegInt,
  seller_order_processing_fee: arbNullableNonNegInt,
  escrow_amount: arbNullableInt,
  escrow_amount_after_adjustment: arbNullableInt,
  order_adjustment: fc.option(
    fc.array(arbAdjustment, { minLength: 0, maxLength: 5 }),
    { nil: null }
  ),
});

// ---------------------------------------------------------------------------
// Adjustment array variants
// ---------------------------------------------------------------------------

/** Null adjustment input */
export const arbNullAdjustments = fc.constant(null as null);

/** Undefined adjustment input */
export const arbUndefinedAdjustments = fc.constant(undefined as undefined);

/** Empty array adjustment input */
export const arbEmptyAdjustments = fc.constant([] as ArbitraryAdjustment[]);

/** Non-empty adjustment array */
export const arbNonEmptyAdjustments = fc.array(arbAdjustment, { minLength: 1, maxLength: 10 });

/** Any valid adjustment input (null | undefined | [] | non-empty) */
export const arbAnyAdjustments: fc.Arbitrary<ArbitraryAdjustment[] | null | undefined> = fc.oneof(
  arbNullAdjustments,
  arbUndefinedAdjustments,
  arbEmptyAdjustments,
  arbNonEmptyAdjustments,
);
