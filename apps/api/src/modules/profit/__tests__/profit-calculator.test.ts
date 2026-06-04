/**
 * Property-based tests for pure profit calculation functions.
 *
 * Uses fast-check with bun:test runner.
 * Each property runs with default iterations.
 *
 * Properties covered:
 * - Property 1: Net Profit Formula Arithmetic Identity
 * - Property 2: Deduction Breakdown Arithmetic Consistency
 * - Property 3: Item-to-Order Cost Aggregation
 * - Property 4: Unresolved HPP Flag Propagation
 * - Property 5: Multi-Order Aggregation Correctness
 * - Property 6: Shop Performance Sorting Invariant
 * - Property 7: Product Performance Average Profit Calculation
 * - Property 8: Profit Margin Percentage Calculation
 *
 * **Validates: Requirements 1.1, 2.2, 2.3, 1.4, 1.7, 3.2, 3.3, 3.6, 4.1, 4.2, 5.1, 5.2, 5.3, 6.4**
 */

import { describe, it, expect } from "bun:test";
import * as fc from "fast-check";
import {
  calculateOrderProfit,
  calculateProfitMargin,
  aggregateProfitSummary,
  aggregateShopPerformance,
  aggregateProductPerformance,
} from "../profit-calculator";
import {
  orderCostInputArbitrary,
  orderProfitResultArbitrary,
  shopOrderGroupArbitrary,
  productItemGroupArbitrary,
} from "./profit-calculator.arbitraries";
import type { GroupByLevel } from "../profit.types";

// ─── Property 1: Net Profit Formula Arithmetic Identity ──────────────────────

describe("Property 1: Net Profit Formula Arithmetic Identity", () => {
  // Feature: profit-analytics, Property 1: Net Profit Formula Arithmetic Identity
  // **Validates: Requirements 1.1**

  it("netProfit === revenue - totalShopeeDeductions - totalHpp - totalPackingCost - totalAdCost", () => {
    fc.assert(
      fc.property(orderCostInputArbitrary, (input) => {
        const result = calculateOrderProfit(input);

        expect(result.netProfit).toBe(
          result.revenue
          - result.totalShopeeDeductions
          - result.totalHpp
          - result.totalPackingCost
          - result.totalAdCost
        );
      })
    );
  });
});

// ─── Property 2: Deduction Breakdown Arithmetic Consistency ──────────────────

describe("Property 2: Deduction Breakdown Arithmetic Consistency", () => {
  // Feature: profit-analytics, Property 2: Deduction Breakdown Arithmetic Consistency
  // **Validates: Requirements 2.2, 6.4**

  it("sum of deduction breakdown components equals totalShopeeDeductions", () => {
    fc.assert(
      fc.property(orderCostInputArbitrary, (input) => {
        const result = calculateOrderProfit(input);
        const { commissionFee, serviceFee, sellerOrderProcessingFee, sellerShippingCost, sellerVoucher, amsCommissionFee } =
          result.deductionBreakdown;

        expect(
          commissionFee + serviceFee + sellerOrderProcessingFee + sellerShippingCost + sellerVoucher + amsCommissionFee
        ).toBe(result.totalShopeeDeductions);
      })
    );
  });

  it("sellerShippingCost === actualShippingFee - shopeeShippingRebate", () => {
    fc.assert(
      fc.property(orderCostInputArbitrary, (input) => {
        const result = calculateOrderProfit(input);

        expect(result.deductionBreakdown.sellerShippingCost).toBe(
          input.actualShippingFee - input.shopeeShippingRebate
        );
      })
    );
  });
});

// ─── Property 3: Item-to-Order Cost Aggregation ───────────────────────────────

describe("Property 3: Item-to-Order Cost Aggregation", () => {
  // Feature: profit-analytics, Property 3: Item-to-Order Cost Aggregation
  // **Validates: Requirements 2.3, 16.1, 16.2**

  it("totalHpp === sum of result.items[i].hppTotal", () => {
    fc.assert(
      fc.property(orderCostInputArbitrary, (input) => {
        const result = calculateOrderProfit(input);
        const sumHpp = result.items.reduce((sum, item) => sum + item.hppTotal, 0);

        expect(result.totalHpp).toBe(sumHpp);
      })
    );
  });

  it("totalPackingCost === input.packingCostPerOrder (per-order, not per-item × qty)", () => {
    // Requirements 16.1, 16.2: packing cost is a single per-order value
    fc.assert(
      fc.property(orderCostInputArbitrary, (input) => {
        const result = calculateOrderProfit(input);

        expect(result.totalPackingCost).toBe(input.packingCostPerOrder);
      })
    );
  });
});

// ─── Property 4: Unresolved HPP Flag Propagation ─────────────────────────────

describe("Property 4: Unresolved HPP Flag Propagation", () => {
  // Feature: profit-analytics, Property 4: Unresolved HPP Flag Propagation
  // **Validates: Requirements 1.4, 1.7**

  it("hasUnresolvedHpp === true when at least one item has hppFound === false", () => {
    // Generate inputs where at least one item has hppFound = false
    const inputWithUnresolved = orderCostInputArbitrary.filter((input) =>
      input.items.some((item) => !item.hppFound)
    );

    fc.assert(
      fc.property(inputWithUnresolved, (input) => {
        const result = calculateOrderProfit(input);
        expect(result.hasUnresolvedHpp).toBe(true);
      })
    );
  });

  it("hasUnresolvedHpp === false when all items have hppFound === true", () => {
    // Generate inputs where all items have hppFound = true
    const inputAllResolved = orderCostInputArbitrary.map((input) => ({
      ...input,
      items: input.items.map((item) => ({ ...item, hppFound: true })),
    }));

    fc.assert(
      fc.property(inputAllResolved, (input) => {
        const result = calculateOrderProfit(input);
        expect(result.hasUnresolvedHpp).toBe(false);
      })
    );
  });
});

// ─── Property 5: Multi-Order Aggregation Correctness ─────────────────────────

describe("Property 5: Multi-Order Aggregation Correctness", () => {
  // Feature: profit-analytics, Property 5: Multi-Order Aggregation Correctness
  // **Validates: Requirements 3.2, 3.3, 3.6, 16.3, 16.4**

  it("aggregated totals equal sums of individual order results", () => {
    fc.assert(
      fc.property(
        fc.array(orderCostInputArbitrary, { minLength: 0, maxLength: 20 }),
        (inputs) => {
          const results = inputs.map((input) => calculateOrderProfit(input));
          const summary = aggregateProfitSummary(results);

          const expectedTotalRevenue = results.reduce((sum, r) => sum + r.revenue, 0);
          const expectedTotalNetProfit = results.reduce((sum, r) => sum + r.netProfit, 0);
          const expectedTotalHpp = results.reduce((sum, r) => sum + r.totalHpp, 0);
          const expectedTotalPackingCost = results.reduce((sum, r) => sum + r.totalPackingCost, 0);
          const expectedTotalShopeeDeductions = results.reduce(
            (sum, r) => sum + r.totalShopeeDeductions,
            0
          );

          expect(summary.totalRevenue).toBe(expectedTotalRevenue);
          expect(summary.totalNetProfit).toBe(expectedTotalNetProfit);
          expect(summary.totalHpp).toBe(expectedTotalHpp);
          expect(summary.totalPackingCost).toBe(expectedTotalPackingCost);
          expect(summary.totalShopeeDeductions).toBe(expectedTotalShopeeDeductions);
          expect(summary.orderCount).toBe(results.length);
        }
      )
    );
  });

  it("aggregateProfitSummary([]) returns totalPackingCost = 0 (Req 16.3)", () => {
    // Requirements 16.3: empty array → totalPackingCost = 0
    const summary = aggregateProfitSummary([]);
    expect(summary.totalPackingCost).toBe(0);
    expect(summary.orderCount).toBe(0);
  });
});

// ─── Property 6: Shop Performance Sorting Invariant ──────────────────────────

describe("Property 6: Shop Performance Sorting Invariant", () => {
  // Feature: profit-analytics, Property 6: Shop Performance Sorting Invariant
  // **Validates: Requirements 4.1, 4.2**

  /**
   * Map from the sortBy API parameter to the actual field name on ShopPerformanceResult.
   * "revenue" and "netProfit" correspond to totalRevenue and totalNetProfit respectively.
   */
  const sortByToField = {
    revenue: "totalRevenue",
    netProfit: "totalNetProfit",
    profitMarginPercent: "profitMarginPercent",
    orderCount: "orderCount",
  } as const;

  it("output is sorted descending by the specified metric", () => {
    const sortByOptions = ["revenue", "netProfit", "profitMarginPercent", "orderCount"] as const;

    fc.assert(
      fc.property(
        fc.array(shopOrderGroupArbitrary, { minLength: 0, maxLength: 20 }),
        fc.constantFrom(...sortByOptions),
        (orders, sortBy) => {
          const results = aggregateShopPerformance(orders, sortBy);
          const field = sortByToField[sortBy];

          for (let i = 0; i < results.length - 1; i++) {
            const current = results[i]![field];
            const next = results[i + 1]![field];
            expect(current).toBeGreaterThanOrEqual(next);
          }
        }
      )
    );
  });
});

// ─── Property 7: Product Performance Average Profit Calculation ──────────────

describe("Property 7: Product Performance Average Profit Calculation", () => {
  // Feature: profit-analytics, Property 7: Product Performance Average Profit Calculation
  // **Validates: Requirements 5.1, 5.2, 5.3**

  it("avgProfitPerUnit === totalNetProfit / qtySold when qtySold > 0", () => {
    const groupByOptions: GroupByLevel[] = ["msku", "product_group", "variation"];

    fc.assert(
      fc.property(
        fc.array(productItemGroupArbitrary, { minLength: 1, maxLength: 20 }),
        fc.constantFrom(...groupByOptions),
        (items, groupBy) => {
          const results = aggregateProductPerformance(items, groupBy);

          for (const result of results) {
            if (result.qtySold > 0) {
              expect(Math.abs(result.avgProfitPerUnit - result.totalNetProfit / result.qtySold)).toBeLessThan(
                1e-10
              );
            } else {
              expect(result.avgProfitPerUnit).toBe(0);
            }
          }
        }
      )
    );
  });
});

// ─── Property 8: Profit Margin Percentage Calculation ────────────────────────

describe("Property 8: Profit Margin Percentage Calculation", () => {
  // Feature: profit-analytics, Property 8: Profit Margin Percentage Calculation
  // **Validates: Requirements 3.3, 4.3, 5.3**

  it("calculateProfitMargin(netProfit, revenue) === (netProfit / revenue) * 100 when revenue > 0", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }), // revenue > 0
        (netProfit, revenue) => {
          const result = calculateProfitMargin(netProfit, revenue);
          const expected = (netProfit / revenue) * 100;

          expect(Math.abs(result - expected)).toBeLessThan(1e-10);
        }
      )
    );
  });

  it("calculateProfitMargin(netProfit, revenue) === 0 when revenue <= 0", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: -1_000_000, max: 0 }), // revenue <= 0
        (netProfit, revenue) => {
          const result = calculateProfitMargin(netProfit, revenue);
          expect(result).toBe(0);
        }
      )
    );
  });
});
