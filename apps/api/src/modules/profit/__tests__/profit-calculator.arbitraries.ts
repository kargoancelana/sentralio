/**
 * Shared fast-check arbitraries for Profit Calculator property tests.
 *
 * Generates valid-shaped inputs for OrderItemCostInput, OrderCostInput,
 * OrderProfitResult, ShopOrderGroup, and ProductItemGroup.
 *
 * All monetary values are non-negative integers (Rupiah).
 */

import * as fc from "fast-check";
import {
  calculateOrderProfit,
  type OrderItemCostInput,
  type OrderCostInput,
  type OrderProfitResult,
} from "../profit-calculator";
import type { ShopOrderGroup, ProductItemGroup } from "../profit.types";

// ─── OrderItemCostInput ───────────────────────────────────────────────────────

/**
 * Generates a valid OrderItemCostInput with:
 * - itemPrice: 0..100000
 * - qty: 1..10
 * - hppPerUnit: 0..50000
 * - hppFound: random boolean
 *
 * Note: packingCostPerUnit removed — packing cost is now per-order (packingCostPerOrder).
 */
export const orderItemCostInputArbitrary: fc.Arbitrary<OrderItemCostInput> = fc.record({
  itemPrice: fc.integer({ min: 0, max: 100_000 }),
  qty: fc.integer({ min: 1, max: 10 }),
  hppPerUnit: fc.integer({ min: 0, max: 50_000 }),
  hppFound: fc.boolean(),
});

// ─── OrderCostInput ───────────────────────────────────────────────────────────

/**
 * Generates a valid OrderCostInput with:
 * - 1–5 items using orderItemCostInputArbitrary
 * - packingCostPerOrder: 0..50000 (single per-order packing cost)
 * - commissionFee, serviceFee, sellerOrderProcessingFee,
 *   actualShippingFee, shopeeShippingRebate, sellerVoucher, adCost: 0..50000
 */
export const orderCostInputArbitrary: fc.Arbitrary<OrderCostInput> = fc.record({
  items: fc.array(orderItemCostInputArbitrary, { minLength: 1, maxLength: 5 }),
  packingCostPerOrder: fc.integer({ min: 0, max: 50_000 }),
  commissionFee: fc.integer({ min: 0, max: 50_000 }),
  serviceFee: fc.integer({ min: 0, max: 50_000 }),
  sellerOrderProcessingFee: fc.integer({ min: 0, max: 50_000 }),
  actualShippingFee: fc.integer({ min: 0, max: 50_000 }),
  shopeeShippingRebate: fc.integer({ min: 0, max: 50_000 }),
  sellerVoucher: fc.integer({ min: 0, max: 50_000 }),
  amsCommissionFee: fc.integer({ min: 0, max: 50_000 }),
  adCost: fc.integer({ min: 0, max: 50_000 }),
});

// ─── OrderProfitResult ────────────────────────────────────────────────────────

/**
 * Generates an OrderProfitResult by calling calculateOrderProfit on
 * a generated OrderCostInput. This ensures the result is always
 * consistent with the calculator logic.
 */
export const orderProfitResultArbitrary: fc.Arbitrary<OrderProfitResult> =
  orderCostInputArbitrary.map((input) => calculateOrderProfit(input));

// ─── ShopOrderGroup ───────────────────────────────────────────────────────────

/**
 * Generates a valid ShopOrderGroup with:
 * - shopId: 1..10
 * - shopName: arbitrary string
 * - profitResult from orderProfitResultArbitrary
 */
export const shopOrderGroupArbitrary: fc.Arbitrary<ShopOrderGroup> = fc.record({
  shopId: fc.integer({ min: 1, max: 10 }),
  shopName: fc.string({ minLength: 1, maxLength: 50 }),
  profitResult: orderProfitResultArbitrary,
});

// ─── ProductItemGroup ─────────────────────────────────────────────────────────

/**
 * Generates a valid ProductItemGroup with:
 * - productName: arbitrary string
 * - variantName: optional string or null
 * - modelSku: optional string or null
 * - productGroupId: optional 1..5 or null
 * - totalRevenue: 0..500000
 * - netProfit: -100000..200000
 * - qty: 1..20
 */
export const productItemGroupArbitrary: fc.Arbitrary<ProductItemGroup> = fc.record({
  productName: fc.string({ minLength: 1, maxLength: 100 }),
  variantName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  modelSku: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  productGroupId: fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }),
  totalRevenue: fc.integer({ min: 0, max: 500_000 }),
  netProfit: fc.integer({ min: -100_000, max: 200_000 }),
  qty: fc.integer({ min: 1, max: 20 }),
});
