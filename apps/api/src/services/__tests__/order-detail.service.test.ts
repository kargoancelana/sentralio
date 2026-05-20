/**
 * Unit tests for order-detail.service.ts pure transformation helpers.
 *
 * Tests cover:
 * - formatRp: id-ID currency formatting
 * - asAmount: null/undefined/NaN normalization
 * - buildIncomeBreakdown: escrow income mapping
 * - buildBuyerPayment: buyer payment info mapping
 * - buildAdjustments: adjustment list mapping
 * - assembleOrderDetailResponse: full response assembly
 */

import { describe, it, expect } from "bun:test";
import {
  formatRp,
  asAmount,
  buildIncomeBreakdown,
  buildBuyerPayment,
  buildAdjustments,
  assembleOrderDetailResponse,
} from "../order-detail.service";

// ---------------------------------------------------------------------------
// formatRp
// ---------------------------------------------------------------------------

describe("formatRp", () => {
  it("returns 'Rp 0' for null", () => {
    expect(formatRp(null)).toBe("Rp 0");
  });

  it("returns 'Rp 0' for undefined", () => {
    expect(formatRp(undefined)).toBe("Rp 0");
  });

  it("returns 'Rp 0' for NaN", () => {
    expect(formatRp(NaN)).toBe("Rp 0");
  });

  it("returns 'Rp 0' for 0", () => {
    expect(formatRp(0)).toBe("Rp 0");
  });

  it("formats 1000 as 'Rp 1.000'", () => {
    expect(formatRp(1000)).toBe("Rp 1.000");
  });

  it("formats 1500000 as 'Rp 1.500.000'", () => {
    expect(formatRp(1500000)).toBe("Rp 1.500.000");
  });

  it("formats negative -500 as '-Rp 500'", () => {
    expect(formatRp(-500)).toBe("-Rp 500");
  });

  it("formats negative -1000 as '-Rp 1.000'", () => {
    expect(formatRp(-1000)).toBe("-Rp 1.000");
  });

  it("formats positive 1 as 'Rp 1'", () => {
    expect(formatRp(1)).toBe("Rp 1");
  });

  it("starts with 'Rp ' for positive numbers", () => {
    expect(formatRp(12345).startsWith("Rp ")).toBe(true);
  });

  it("starts with '-Rp ' for negative numbers", () => {
    expect(formatRp(-12345).startsWith("-Rp ")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// asAmount
// ---------------------------------------------------------------------------

describe("asAmount", () => {
  it("returns 0 for null", () => {
    expect(asAmount(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(asAmount(undefined)).toBe(0);
  });

  it("returns 0 for NaN", () => {
    expect(asAmount(NaN)).toBe(0);
  });

  it("returns the value for a positive number", () => {
    expect(asAmount(1500)).toBe(1500);
  });

  it("returns the value for a negative number", () => {
    expect(asAmount(-500)).toBe(-500);
  });

  it("returns 0 for 0", () => {
    expect(asAmount(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildIncomeBreakdown
// ---------------------------------------------------------------------------

describe("buildIncomeBreakdown", () => {
  it("returns zero values for empty/null income", () => {
    const result = buildIncomeBreakdown(null);
    expect(result.productSubtotal).toBe(0);
    expect(result.shipping.buyerPaid).toBe(0);
    expect(result.shipping.actualToCarrier).toBe(0);
    expect(result.shipping.shopeeRebate).toBe(0);
    expect(result.shipping.rollup).toBe(0);
    expect(result.fees.adminFee).toBe(0);
    expect(result.fees.serviceFee).toBe(0);
    expect(result.fees.processingFee).toBe(0);
    expect(result.totalEstimatedIncome).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("computes productSubtotal as sum of discounted_price * quantity_purchased", () => {
    const income = {
      items: [
        { item_id: "1", model_id: "m1", item_name: "A", discounted_price: 10000, quantity_purchased: 2 },
        { item_id: "2", model_id: "m2", item_name: "B", discounted_price: 5000, quantity_purchased: 3 },
      ],
    };
    const result = buildIncomeBreakdown(income);
    // 10000*2 + 5000*3 = 20000 + 15000 = 35000
    expect(result.productSubtotal).toBe(35000);
  });

  it("computes shipping rollup as buyerPaid - actualToCarrier + shopeeRebate", () => {
    const income = {
      buyer_paid_shipping_fee: 20000,
      actual_shipping_fee: 15000,
      shopee_shipping_rebate: 5000,
    };
    const result = buildIncomeBreakdown(income);
    // 20000 - 15000 + 5000 = 10000
    expect(result.shipping.rollup).toBe(10000);
    expect(result.shipping.buyerPaid).toBe(20000);
    expect(result.shipping.actualToCarrier).toBe(15000);
    expect(result.shipping.shopeeRebate).toBe(5000);
  });

  it("maps fee fields correctly", () => {
    const income = {
      commission_fee: 1000,
      service_fee: 2000,
      seller_order_processing_fee: 500,
      escrow_amount: 50000,
    };
    const result = buildIncomeBreakdown(income);
    expect(result.fees.adminFee).toBe(1000);
    expect(result.fees.serviceFee).toBe(2000);
    expect(result.fees.processingFee).toBe(500);
    expect(result.totalEstimatedIncome).toBe(50000);
  });

  it("normalizes null fee fields to 0", () => {
    const income = {
      commission_fee: null,
      service_fee: undefined,
      seller_order_processing_fee: null,
      escrow_amount: null,
    };
    const result = buildIncomeBreakdown(income);
    expect(result.fees.adminFee).toBe(0);
    expect(result.fees.serviceFee).toBe(0);
    expect(result.fees.processingFee).toBe(0);
    expect(result.totalEstimatedIncome).toBe(0);
  });

  it("maps item fields correctly", () => {
    const income = {
      items: [
        {
          item_id: "123",
          model_id: "456",
          item_name: "Test Product",
          model_name: "Red / L",
          model_sku: "SKU-001",
          discounted_price: 25000,
          quantity_purchased: 2,
        },
      ],
    };
    const result = buildIncomeBreakdown(income);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.itemId).toBe("123");
    expect(item.modelId).toBe("456");
    expect(item.itemName).toBe("Test Product");
    expect(item.modelName).toBe("Red / L");
    expect(item.modelSku).toBe("SKU-001");
    expect(item.unitPrice).toBe(25000);
    expect(item.quantity).toBe(2);
    expect(item.subtotal).toBe(50000);
    expect(item.imageUrl).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildBuyerPayment
// ---------------------------------------------------------------------------

describe("buildBuyerPayment", () => {
  it("returns zero values for null input", () => {
    const result = buildBuyerPayment(null);
    expect(result.productSubtotal).toBe(0);
    expect(result.shippingFee).toBe(0);
    expect(result.shopeeVoucher).toBe(0);
    expect(result.sellerVoucher).toBe(0);
    expect(result.serviceFee).toBe(0);
    expect(result.total).toBe(0);
  });

  it("maps all fields correctly", () => {
    const bp = {
      merchant_subtotal: 100000,
      shipping_fee: 20000,
      shopee_voucher: 5000,
      seller_voucher: 2000,
      buyer_service_fee: 1000,
      buyer_total_amount: 114000,
    };
    const result = buildBuyerPayment(bp);
    expect(result.productSubtotal).toBe(100000);
    expect(result.shippingFee).toBe(20000);
    expect(result.shopeeVoucher).toBe(5000);
    expect(result.sellerVoucher).toBe(2000);
    expect(result.serviceFee).toBe(1000);
    expect(result.total).toBe(114000);
  });

  it("normalizes null fields to 0", () => {
    const bp = {
      merchant_subtotal: null,
      shipping_fee: null,
      shopee_voucher: null,
      seller_voucher: null,
      buyer_service_fee: null,
      buyer_total_amount: null,
    };
    const result = buildBuyerPayment(bp);
    expect(result.productSubtotal).toBe(0);
    expect(result.shippingFee).toBe(0);
    expect(result.shopeeVoucher).toBe(0);
    expect(result.sellerVoucher).toBe(0);
    expect(result.serviceFee).toBe(0);
    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildAdjustments
// ---------------------------------------------------------------------------

describe("buildAdjustments", () => {
  it("returns empty array for null", () => {
    expect(buildAdjustments(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(buildAdjustments(undefined)).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(buildAdjustments([])).toEqual([]);
  });

  it("maps adjustment entries correctly", () => {
    const adj = [
      { adjustment_reason: "Return fee", amount: -5000 },
      { adjustment_reason: "Bonus", amount: 1000 },
    ];
    const result = buildAdjustments(adj);
    expect(result).toHaveLength(2);
    expect(result[0].reason).toBe("Return fee");
    expect(result[0].amount).toBe(-5000);
    expect(result[1].reason).toBe("Bonus");
    expect(result[1].amount).toBe(1000);
  });

  it("normalizes null amount to 0", () => {
    const adj = [{ adjustment_reason: "Test", amount: null }];
    const result = buildAdjustments(adj);
    expect(result[0].amount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// assembleOrderDetailResponse
// ---------------------------------------------------------------------------

describe("assembleOrderDetailResponse", () => {
  const baseInput = {
    orderSn: "ORD123456",
    orderStatus: "READY_TO_SHIP",
    marketplace: "shopee" as const,
    orderDetail: {
      order_sn: "ORD123456",
      buyer_username: "buyer_test",
      recipient_address: {
        name: "John D***",
        phone: "+62812****",
        full_address: "Jl. Test No. 1",
        town: "Kebayoran",
        district: "Jakarta Selatan",
        city: "Jakarta",
        state: "DKI Jakarta",
        region: "Indonesia",
        zipcode: "12345",
      },
      package_list: [
        {
          shipping_carrier: "SPX Standard",
          item_list: [
            { item_id: "111", model_id: "222", item_name: "Product A", model_name: "Red", model_quantity_purchased: 1 },
          ],
        },
      ],
    },
    escrowDetail: {
      buyer_user_name: "buyer_escrow",
      order_income: {
        items: [
          {
            item_id: "111",
            model_id: "222",
            item_name: "Product A",
            model_name: "Red",
            model_sku: "SKU-A",
            discounted_price: 50000,
            quantity_purchased: 1,
          },
        ],
        buyer_paid_shipping_fee: 20000,
        actual_shipping_fee: 15000,
        shopee_shipping_rebate: 5000,
        commission_fee: 2500,
        service_fee: 1000,
        seller_order_processing_fee: 500,
        escrow_amount: 56500,
        escrow_amount_after_adjustment: 56000,
        order_adjustment: [
          { adjustment_reason: "Adjustment 1", amount: -500 },
        ],
      },
      buyer_payment_info: {
        merchant_subtotal: 50000,
        shipping_fee: 20000,
        shopee_voucher: 0,
        seller_voucher: 0,
        buyer_service_fee: 1000,
        buyer_total_amount: 71000,
      },
    },
    imageMap: new Map<string, string | null>([["111:222", "https://example.com/img.jpg"]]),
  };

  it("sets marketplace, orderSn, orderStatus correctly", () => {
    const result = assembleOrderDetailResponse(baseInput);
    expect(result.marketplace).toBe("shopee");
    expect(result.orderSn).toBe("ORD123456");
    expect(result.orderStatus).toBe("READY_TO_SHIP");
  });

  it("prefers escrow buyer_user_name over orderDetail buyer_username", () => {
    const result = assembleOrderDetailResponse(baseInput);
    expect(result.buyerUsername).toBe("buyer_escrow");
  });

  it("falls back to orderDetail buyer_username when escrow has none", () => {
    const input = {
      ...baseInput,
      escrowDetail: { ...baseInput.escrowDetail, buyer_user_name: null },
    };
    const result = assembleOrderDetailResponse(input);
    expect(result.buyerUsername).toBe("buyer_test");
  });

  it("maps recipient address fields correctly", () => {
    const result = assembleOrderDetailResponse(baseInput);
    const ra = result.recipientAddress;
    expect(ra.name).toBe("John D***");
    expect(ra.phone).toBe("+62812****");
    expect(ra.fullAddress).toBe("Jl. Test No. 1");
    expect(ra.city).toBe("Jakarta");
    expect(ra.state).toBe("DKI Jakarta");
    expect(ra.zipcode).toBe("12345");
  });

  it("generates package labels as 'Paket N' (1-based)", () => {
    const result = assembleOrderDetailResponse(baseInput);
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].label).toBe("Paket 1");
    expect(result.packages[0].courierService).toBe("SPX Standard");
  });

  it("injects imageUrl into income breakdown items", () => {
    const result = assembleOrderDetailResponse(baseInput);
    expect(result.incomeBreakdown.items[0].imageUrl).toBe("https://example.com/img.jpg");
  });

  it("injects imageUrl into package items", () => {
    const result = assembleOrderDetailResponse(baseInput);
    expect(result.packages[0].items[0].imageUrl).toBe("https://example.com/img.jpg");
  });

  it("uses escrow_amount_after_adjustment for finalEarnings when present", () => {
    const result = assembleOrderDetailResponse(baseInput);
    expect(result.finalEarnings.amount).toBe(56000);
    expect(result.finalEarnings.isFallback).toBe(false);
  });

  it("falls back to escrow_amount when escrow_amount_after_adjustment is null", () => {
    const input = {
      ...baseInput,
      escrowDetail: {
        ...baseInput.escrowDetail,
        order_income: {
          ...baseInput.escrowDetail.order_income,
          escrow_amount_after_adjustment: null,
          escrow_amount: 56500,
        },
      },
    };
    const result = assembleOrderDetailResponse(input);
    expect(result.finalEarnings.amount).toBe(56500);
    expect(result.finalEarnings.isFallback).toBe(true);
  });

  it("maps adjustments correctly", () => {
    const result = assembleOrderDetailResponse(baseInput);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].reason).toBe("Adjustment 1");
    expect(result.adjustments[0].amount).toBe(-500);
  });

  it("maps buyer payment fields correctly", () => {
    const result = assembleOrderDetailResponse(baseInput);
    const bp = result.buyerPayment;
    expect(bp.productSubtotal).toBe(50000);
    expect(bp.shippingFee).toBe(20000);
    expect(bp.total).toBe(71000);
  });

  it("handles missing package_list gracefully", () => {
    const input = {
      ...baseInput,
      orderDetail: { ...baseInput.orderDetail, package_list: undefined },
    };
    const result = assembleOrderDetailResponse(input);
    expect(result.packages).toHaveLength(0);
  });

  it("handles missing escrow order_income gracefully", () => {
    const input = {
      ...baseInput,
      escrowDetail: { buyer_user_name: "test" },
    };
    const result = assembleOrderDetailResponse(input);
    expect(result.incomeBreakdown.productSubtotal).toBe(0);
    expect(result.adjustments).toHaveLength(0);
    expect(result.finalEarnings.isFallback).toBe(true);
  });
});
