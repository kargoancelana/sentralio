import { db } from "./src/db/client";
import { shopeeOrders, shopeeOrderItems } from "./src/db/schema";
import { like, or, eq } from "drizzle-orm";

/**
 * Script to delete test orders from database
 * 
 * This will delete orders where buyerUsername contains:
 * - "test"
 * - "buyer_" (random generated test data)
 * - "preserve_test"
 * - "label_test"
 * - "error_test"
 * - "batch_test"
 * - "cancel_test"
 * - "bug_test"
 * - "invariant_test"
 */

async function deleteTestOrders() {
  console.log("🔍 Searching for test orders...");

  // Find test orders
  const testOrders = await db
    .select({
      id: shopeeOrders.id,
      orderSn: shopeeOrders.orderSn,
      buyerUsername: shopeeOrders.buyerUsername,
      orderStatus: shopeeOrders.orderStatus,
    })
    .from(shopeeOrders)
    .where(
      or(
        like(shopeeOrders.buyerUsername, "%test%"),
        like(shopeeOrders.buyerUsername, "buyer_%"),
        eq(shopeeOrders.buyerUsername, "buyer"), // Exact match for "buyer"
        like(shopeeOrders.buyerUsername, "%preserve%"),
        like(shopeeOrders.buyerUsername, "%label_%"),
        like(shopeeOrders.buyerUsername, "%error_%"),
        like(shopeeOrders.buyerUsername, "%batch_%"),
        like(shopeeOrders.buyerUsername, "%cancel_%"),
        like(shopeeOrders.buyerUsername, "%bug_%"),
        like(shopeeOrders.buyerUsername, "%invariant%"),
        like(shopeeOrders.orderSn, "BATCH_%"), // Order SN starts with BATCH_
        like(shopeeOrders.orderSn, "LABEL_%") // Order SN starts with LABEL_
      )
    );

  if (testOrders.length === 0) {
    console.log("✅ No test orders found!");
    return;
  }

  console.log(`\n📋 Found ${testOrders.length} test orders:\n`);
  
  // Group by buyer username for better visibility
  const groupedByBuyer = testOrders.reduce((acc, order) => {
    const buyer = order.buyerUsername || "null";
    if (!acc[buyer]) {
      acc[buyer] = [];
    }
    acc[buyer].push(order);
    return acc;
  }, {} as Record<string, typeof testOrders>);

  for (const [buyer, orders] of Object.entries(groupedByBuyer)) {
    console.log(`  ${buyer}: ${orders.length} orders`);
    orders.forEach((order) => {
      console.log(`    - ${order.orderSn} (${order.orderStatus})`);
    });
  }

  console.log(`\n⚠️  About to delete ${testOrders.length} test orders and their items...`);
  console.log("Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n");

  // Wait 5 seconds before deletion
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log("🗑️  Deleting test orders...\n");

  let deletedOrderItems = 0;
  let deletedOrders = 0;

  for (const order of testOrders) {
    // Delete order items first (foreign key constraint)
    const itemsResult = await db
      .delete(shopeeOrderItems)
      .where(eq(shopeeOrderItems.orderSn, order.orderSn))
      .execute();
    
    deletedOrderItems += itemsResult[0]?.affectedRows || 0;

    // Delete order
    const orderResult = await db
      .delete(shopeeOrders)
      .where(eq(shopeeOrders.id, order.id))
      .execute();
    
    deletedOrders += orderResult[0]?.affectedRows || 0;

    console.log(`  ✓ Deleted order ${order.orderSn} (${order.buyerUsername})`);
  }

  console.log(`\n✅ Deletion complete!`);
  console.log(`   - Deleted ${deletedOrders} orders`);
  console.log(`   - Deleted ${deletedOrderItems} order items`);
}

// Run the script
deleteTestOrders()
  .then(() => {
    console.log("\n✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
