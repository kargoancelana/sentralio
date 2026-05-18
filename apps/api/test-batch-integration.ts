import { db } from "./src/db/client";
import { shopeeOrders } from "./src/db/schema";
import { eq } from "drizzle-orm";
import { shipBatchOrders } from "./src/services/shipment.service";

async function testBatchIntegration() {
  console.log("🧪 Integration Test: Batch Dropoff Performance Fix\n");
  console.log("=" .repeat(60));

  // Get READY_TO_SHIP orders
  const readyOrders = await db
    .select()
    .from(shopeeOrders)
    .where(eq(shopeeOrders.orderStatus, "READY_TO_SHIP"))
    .limit(10);

  if (readyOrders.length === 0) {
    console.log("❌ No READY_TO_SHIP orders found for testing");
    process.exit(1);
  }

  console.log(`\n📋 Found ${readyOrders.length} READY_TO_SHIP orders for testing\n`);

  readyOrders.forEach((order, index) => {
    console.log(`${index + 1}. ${order.orderSn} - ${order.buyerUsername} - Rp${order.totalAmount}`);
  });

  console.log("\n" + "=".repeat(60));
  console.log("🚀 Starting batch shipment processing...\n");

  const startTime = Date.now();

  try {
    const orderSnList = readyOrders.map((o) => o.orderSn);

    const results = await shipBatchOrders(orderSnList, "dropoff");

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log("\n" + "=".repeat(60));
    console.log("✅ Batch processing completed!\n");

    console.log(`⏱️  Total Processing Time: ${duration}s`);
    console.log(`📦 Orders Processed: ${results.length}`);

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);

    console.log("\n📊 Performance Analysis:");
    console.log(`   - Expected time (old): ~${(readyOrders.length * 1.8).toFixed(1)}s (single-order fallback)`);
    console.log(`   - Expected time (new): ~5-6s (batch processing)`);
    console.log(`   - Actual time: ${duration}s`);

    if (parseFloat(duration) < 8) {
      console.log(`   ✅ PASS: Processing time is within expected range (< 8s)`);
    } else {
      console.log(`   ⚠️  WARNING: Processing time is higher than expected`);
    }

    console.log("\n📋 Results per order:");
    results.forEach((result, index) => {
      const status = result.success ? "✅" : "❌";
      console.log(`   ${status} ${result.orderSn}: ${result.message || "Success"}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("🎉 Integration test completed successfully!");

    process.exit(0);
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log("\n" + "=".repeat(60));
    console.log(`❌ Error during batch processing (after ${duration}s):`);
    console.error(error);
    process.exit(1);
  }
}

testBatchIntegration().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
