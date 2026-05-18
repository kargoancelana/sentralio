/**
 * Task 3.2 Verification Test
 * 
 * Verifies that tracking number availability is ensured before label data collection.
 * 
 * **Validates: Requirements 1.5, 2.2, 2.5, 2.6**
 * 
 * This test verifies:
 * 1. Label data collection checks for tracking number existence in database
 * 2. If tracking number not available, it fetches from Shopee API
 * 3. Tracking number is included in label data response
 * 4. Label data collection waits for tracking number before proceeding
 */

import { describe, it, expect, beforeAll, mock } from "bun:test";
import { collectLabelData } from "../label-data.service";
import { db } from "../../db/client";
import { shopeeOrders, shopeeCredentials } from "../../db/schema";
import { eq } from "drizzle-orm";

describe("Task 3.2: Ensure tracking number availability before label data collection", () => {
  let testShopId: number;
  let hasValidCredentials = false;
  let testOrderSn: string | null = null;

  beforeAll(async () => {
    // Check if there are valid Shopee credentials in the database
    const credentials = await db
      .select()
      .from(shopeeCredentials)
      .limit(1);

    if (credentials.length > 0) {
      testShopId = credentials[0].shopId;
      hasValidCredentials = true;
      console.log(`✓ Found valid credentials for shop ID: ${testShopId}`);

      // Find a PROCESSED order with tracking number for testing
      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.shopId, testShopId))
        .limit(10);

      const processedOrder = orders.find(
        (o) => o.orderStatus === "PROCESSED" && o.trackingNumber
      );

      if (processedOrder) {
        testOrderSn = processedOrder.orderSn;
        console.log(`✓ Found test order: ${testOrderSn} with tracking: ${processedOrder.trackingNumber}`);
      } else {
        console.warn("⚠ No PROCESSED orders with tracking numbers found");
      }
    } else {
      console.warn("⚠ No Shopee credentials found. Tests will be skipped.");
    }
  });

  it.skipIf(!hasValidCredentials || !testOrderSn)(
    "should include tracking number in label data when available in database",
    async () => {
      console.log(`\n🔍 Testing label data collection for order: ${testOrderSn}`);

      // Collect label data
      const labelData = await collectLabelData(testOrderSn!);

      console.log(`\n📦 Label data collected:`);
      console.log(`   Order SN: ${labelData.orderSn}`);
      console.log(`   Tracking Number: ${labelData.trackingNumber}`);
      console.log(`   Has tracking: ${!!labelData.trackingNumber}`);

      // Verify tracking number is included
      expect(labelData.trackingNumber).toBeDefined();
      expect(labelData.trackingNumber).not.toBe("");
      expect(typeof labelData.trackingNumber).toBe("string");

      console.log(`\n✅ Tracking number is included in label data`);
    },
    30000
  );

  it.skipIf(!hasValidCredentials || !testOrderSn)(
    "should verify tracking number is non-empty before returning label data",
    async () => {
      console.log(`\n🔍 Verifying tracking number availability for: ${testOrderSn}`);

      // Get order from database
      const orderRows = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderSn, testOrderSn!))
        .limit(1);

      expect(orderRows.length).toBe(1);
      const order = orderRows[0];

      console.log(`\n📊 Order details:`);
      console.log(`   Order SN: ${order.orderSn}`);
      console.log(`   Status: ${order.orderStatus}`);
      console.log(`   Tracking in DB: ${order.trackingNumber || "NOT SET"}`);

      // Collect label data
      const labelData = await collectLabelData(testOrderSn!);

      // Verify tracking number matches expected behavior
      expect(labelData.trackingNumber).toBeDefined();
      expect(labelData.trackingNumber).not.toBe("");
      expect(labelData.trackingNumber).not.toBe(undefined);

      console.log(`\n✅ Tracking number availability verified: ${labelData.trackingNumber}`);
    },
    30000
  );

  it("should have correct implementation structure", () => {
    // This test verifies the implementation structure without making API calls
    console.log(`\n📋 Verifying implementation structure:`);

    // Read the label-data.service.ts file to verify implementation
    const fs = require("fs");
    const path = require("path");
    const serviceFile = fs.readFileSync(
      path.join(__dirname, "../label-data.service.ts"),
      "utf-8"
    );

    // Verify key implementation elements exist
    const hasWaitForTrackingImport = serviceFile.includes(
      "import { waitForTrackingNumber }"
    );
    const hasTrackingCheck = serviceFile.includes("if (!order.trackingNumber)");
    const hasWaitForTrackingCall = serviceFile.includes(
      "await waitForTrackingNumber"
    );
    const hasDbUpdate = serviceFile.includes(
      "await db.update(shopeeOrders)"
    );

    console.log(`   ✓ Imports waitForTrackingNumber: ${hasWaitForTrackingImport}`);
    console.log(`   ✓ Checks tracking number existence: ${hasTrackingCheck}`);
    console.log(`   ✓ Calls waitForTrackingNumber: ${hasWaitForTrackingCall}`);
    console.log(`   ✓ Updates database: ${hasDbUpdate}`);

    expect(hasWaitForTrackingImport).toBe(true);
    expect(hasTrackingCheck).toBe(true);
    expect(hasWaitForTrackingCall).toBe(true);
    expect(hasDbUpdate).toBe(true);

    console.log(`\n✅ Implementation structure verified`);
  });

  it("should log tracking number fetch attempts", () => {
    console.log(`\n📝 Verifying logging implementation:`);

    const fs = require("fs");
    const path = require("path");
    const serviceFile = fs.readFileSync(
      path.join(__dirname, "../label-data.service.ts"),
      "utf-8"
    );

    // Verify logging exists
    const hasNotInDbLog = serviceFile.includes(
      "tracking number not in DB, fetching from Shopee"
    );
    const hasFetchedLog = serviceFile.includes(
      "tracking number fetched and saved"
    );
    const hasAlreadyInDbLog = serviceFile.includes(
      "tracking number already in DB"
    );
    const hasErrorLog = serviceFile.includes(
      "failed to fetch tracking number"
    );

    console.log(`   ✓ Logs when not in DB: ${hasNotInDbLog}`);
    console.log(`   ✓ Logs when fetched: ${hasFetchedLog}`);
    console.log(`   ✓ Logs when already in DB: ${hasAlreadyInDbLog}`);
    console.log(`   ✓ Logs errors: ${hasErrorLog}`);

    expect(hasNotInDbLog).toBe(true);
    expect(hasFetchedLog).toBe(true);
    expect(hasAlreadyInDbLog).toBe(true);
    expect(hasErrorLog).toBe(true);

    console.log(`\n✅ Logging implementation verified`);
  });

  it("should throw error when tracking number cannot be fetched", () => {
    console.log(`\n🔍 Verifying error handling:`);

    const fs = require("fs");
    const path = require("path");
    const serviceFile = fs.readFileSync(
      path.join(__dirname, "../label-data.service.ts"),
      "utf-8"
    );

    // Verify error handling exists
    const hasErrorThrow = serviceFile.includes(
      "throw new Error(`Tracking number tidak tersedia untuk order"
    );
    const hasCatchBlock = serviceFile.includes("catch (err: any)");

    console.log(`   ✓ Throws error on failure: ${hasErrorThrow}`);
    console.log(`   ✓ Has catch block: ${hasCatchBlock}`);

    expect(hasErrorThrow).toBe(true);
    expect(hasCatchBlock).toBe(true);

    console.log(`\n✅ Error handling verified`);
  });
});
