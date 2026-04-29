import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { validateLabelEligibility } from "../label.service";
import { db } from "../../db/client";
import { shopeeOrders } from "../../db/schema";
import { eq } from "drizzle-orm";

/**
 * Unit Tests: Label Validation Edge Cases
 * 
 * **Validates: Requirements 2.2, 2.5**
 * 
 * These example-based unit tests complement the property-based tests by testing
 * specific scenarios with known inputs and expected outputs.
 */

describe("Label Validation Edge Cases", () => {
  const testOrders: string[] = [];

  afterEach(async () => {
    // Cleanup all test orders
    for (const orderSn of testOrders) {
      await db.delete(shopeeOrders).where(eq(shopeeOrders.orderSn, orderSn));
    }
    testOrders.length = 0;
  });

  describe("Order Not Found Scenarios", () => {
    it("should reject non-existent order with specific error message", async () => {
      const nonExistentOrderSn = "NONEXISTENT123456";
      
      const result = await validateLabelEligibility(nonExistentOrderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("tidak ditemukan");
      expect(result.error).toContain(nonExistentOrderSn);
    });

    it("should reject empty order_sn", async () => {
      const result = await validateLabelEligibility("");
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("tidak ditemukan");
    });

    it("should reject order_sn with special characters", async () => {
      const specialOrderSn = "ORDER@#$%^&*()";
      
      const result = await validateLabelEligibility(specialOrderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("tidak ditemukan");
    });

    it("should reject very long order_sn that doesn't exist", async () => {
      const longOrderSn = "A".repeat(150);
      
      const result = await validateLabelEligibility(longOrderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
    });
  });

  describe("Order with Wrong Status", () => {
    it("should reject UNPAID order", async () => {
      const orderSn = "UNPAID_ORDER_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "UNPAID",
        totalAmount: 100000,
        buyerUsername: "buyer1",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("status saat ini adalah");
      expect(result.error).toContain("UNPAID");
    });

    it("should reject READY_TO_SHIP order", async () => {
      const orderSn = "READY_TO_SHIP_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "READY_TO_SHIP",
        totalAmount: 100000,
        buyerUsername: "buyer2",
        shippingCarrier: "JNE987654321",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("status saat ini adalah");
      expect(result.error).toContain("READY_TO_SHIP");
    });

    it("should reject SHIPPED order", async () => {
      const orderSn = "SHIPPED_ORDER_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "SHIPPED",
        totalAmount: 100000,
        buyerUsername: "buyer3",
        shippingCarrier: "JNT123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("status saat ini adalah");
      expect(result.error).toContain("SHIPPED");
    });

    it("should reject COMPLETED order", async () => {
      const orderSn = "COMPLETED_ORDER_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "COMPLETED",
        totalAmount: 100000,
        buyerUsername: "buyer4",
        shippingCarrier: "SICEPAT123456",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("status saat ini adalah");
      expect(result.error).toContain("COMPLETED");
    });

    it("should reject CANCELLED order", async () => {
      const orderSn = "CANCELLED_ORDER_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "CANCELLED",
        totalAmount: 100000,
        buyerUsername: "buyer5",
        shippingCarrier: "ANTERAJA123456",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("status saat ini adalah");
      expect(result.error).toContain("CANCELLED");
    });

    it("should reject INVOICE_PENDING order", async () => {
      const orderSn = "INVOICE_PENDING_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "INVOICE_PENDING",
        totalAmount: 100000,
        buyerUsername: "buyer6",
        shippingCarrier: "SPX987654321",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("status saat ini adalah");
      expect(result.error).toContain("INVOICE_PENDING");
    });

    it("should reject order with unknown status", async () => {
      const orderSn = "UNKNOWN_STATUS_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "UNKNOWN_STATUS",
        totalAmount: 100000,
        buyerUsername: "buyer7",
        shippingCarrier: "JNE111111111",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("status saat ini adalah");
      expect(result.error).toContain("UNKNOWN_STATUS");
    });
  });

  describe("Order Without Tracking Number", () => {
    it("should reject PROCESSED order with null tracking number", async () => {
      const orderSn = "PROCESSED_NO_TRACKING_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer8",
        shippingCarrier: null,
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Label pengiriman belum tersedia");
      expect(result.error).toContain(orderSn);
    });

    it("should reject PROCESSED order with empty string tracking number", async () => {
      const orderSn = "PROCESSED_EMPTY_TRACKING_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer9",
        shippingCarrier: "",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(false);
      expect(result.order).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Label pengiriman belum tersedia");
    });

    it("should accept PROCESSED order with whitespace-only tracking number (JavaScript truthy behavior)", async () => {
      const orderSn = "PROCESSED_WHITESPACE_TRACKING_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer10",
        shippingCarrier: "   ",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      // Note: Whitespace strings are truthy in JavaScript, so they pass validation
      expect(result.valid).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order?.shippingCarrier).toBe("   ");
    });
  });

  describe("Valid PROCESSED Orders", () => {
    it("should accept PROCESSED order with valid tracking number", async () => {
      const orderSn = "VALID_PROCESSED_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer11",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.order).toBeDefined();
      expect(result.order?.orderSn).toBe(orderSn);
      expect(result.order?.orderStatus).toBe("PROCESSED");
      expect(result.order?.shippingCarrier).toBe("SPX123456789");
    });

    it("should accept PROCESSED order with short tracking number", async () => {
      const orderSn = "VALID_PROCESSED_002";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer12",
        shippingCarrier: "T",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order?.shippingCarrier).toBe("T");
    });

    it("should accept PROCESSED order with long tracking number", async () => {
      const orderSn = "VALID_PROCESSED_003";
      const longTracking = "TRACKING-NUMBER-WITH-MANY-SEGMENTS-AND-DASHES-123456789";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer13",
        shippingCarrier: longTracking,
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order?.shippingCarrier).toBe(longTracking);
    });

    it("should return complete order data for valid order", async () => {
      const orderSn = "VALID_PROCESSED_004";
      const createTime = new Date("2024-01-15T10:30:00Z");
      await db.insert(shopeeOrders).values({
        shopId: 67890,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 250000,
        buyerUsername: "buyer14",
        shippingCarrier: "JNE987654321",
        payTime: new Date("2024-01-15T09:00:00Z"),
        createTime: createTime,
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order?.id).toBeDefined();
      expect(result.order?.shopId).toBe(67890);
      expect(result.order?.orderSn).toBe(orderSn);
      expect(result.order?.orderStatus).toBe("PROCESSED");
      expect(result.order?.totalAmount).toBe(250000);
      expect(result.order?.buyerUsername).toBe("buyer14");
      expect(result.order?.shippingCarrier).toBe("JNE987654321");
      expect(result.order?.payTime).toBeDefined();
      expect(result.order?.createTime).toBeDefined();
      expect(result.order?.updatedAt).toBeDefined();
    });
  });

  describe("Database Query Errors", () => {
    it("should handle database errors gracefully", async () => {
      // Test with an invalid order_sn that might cause database issues
      // This is a simulation - in real scenarios, database errors would be
      // caught by the try-catch in validateLabelEligibility
      
      // Using a very long string that exceeds VARCHAR(100) limit
      const invalidOrderSn = "A".repeat(200);
      
      const result = await validateLabelEligibility(invalidOrderSn);
      
      // Should either return not found or handle error gracefully
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle null order_sn gracefully", async () => {
      // TypeScript would prevent this, but testing runtime behavior
      const result = await validateLabelEligibility(null as any);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle undefined order_sn gracefully", async () => {
      // TypeScript would prevent this, but testing runtime behavior
      const result = await validateLabelEligibility(undefined as any);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Edge Cases in Order Data", () => {
    it("should accept order with null buyer username", async () => {
      const orderSn = "NULL_BUYER_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: null,
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order?.buyerUsername).toBeNull();
    });

    it("should accept order with null pay time", async () => {
      const orderSn = "NULL_PAYTIME_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer15",
        shippingCarrier: "SPX123456789",
        payTime: null,
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order?.payTime).toBeNull();
    });

    it("should accept order with zero total amount", async () => {
      const orderSn = "ZERO_AMOUNT_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 0,
        buyerUsername: "buyer16",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order?.totalAmount).toBe(0);
    });

    it("should accept order with very large total amount", async () => {
      const orderSn = "LARGE_AMOUNT_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 999999999,
        buyerUsername: "buyer17",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order?.totalAmount).toBe(999999999);
    });
  });

  describe("Validation Order of Checks", () => {
    it("should check existence before status", async () => {
      // Non-existent order should return "not found" error, not status error
      const result = await validateLabelEligibility("NONEXISTENT_ORDER");
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain("tidak ditemukan");
      expect(result.error).not.toContain("status saat ini adalah");
    });

    it("should check status before tracking number", async () => {
      // Order with wrong status should return status error, not tracking error
      const orderSn = "WRONG_STATUS_NO_TRACKING";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "READY_TO_SHIP",
        totalAmount: 100000,
        buyerUsername: "buyer18",
        shippingCarrier: null,
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain("status saat ini adalah");
      expect(result.error).not.toContain("Label pengiriman belum tersedia");
    });

    it("should check tracking number last", async () => {
      // Order with correct status but no tracking should return tracking error
      const orderSn = "CORRECT_STATUS_NO_TRACKING";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer19",
        shippingCarrier: null,
        createTime: new Date(),
      });
      testOrders.push(orderSn);
      
      const result = await validateLabelEligibility(orderSn);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Label pengiriman belum tersedia");
      expect(result.error).not.toContain("tidak ditemukan");
      expect(result.error).not.toContain("status saat ini adalah");
    });
  });
});
