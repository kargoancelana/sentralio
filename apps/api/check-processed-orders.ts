import { db } from "./src/db/client";
import { shopeeOrders } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function checkProcessedOrders() {
  console.log("🔍 Checking all PROCESSED orders...\n");

  const processedOrders = await db
    .select({
      id: shopeeOrders.id,
      orderSn: shopeeOrders.orderSn,
      buyerUsername: shopeeOrders.buyerUsername,
      orderStatus: shopeeOrders.orderStatus,
      totalAmount: shopeeOrders.totalAmount,
      trackingNumber: shopeeOrders.trackingNumber,
      createTime: shopeeOrders.createTime,
    })
    .from(shopeeOrders)
    .where(eq(shopeeOrders.orderStatus, "PROCESSED"));

  console.log(`📋 Found ${processedOrders.length} PROCESSED orders:\n`);

  processedOrders.forEach((order, index) => {
    console.log(`${index + 1}. Order: ${order.orderSn}`);
    console.log(`   Buyer: ${order.buyerUsername}`);
    console.log(`   Amount: ${order.totalAmount}`);
    console.log(`   Tracking: ${order.trackingNumber || "N/A"}`);
    console.log(`   Created: ${order.createTime}`);
    console.log("");
  });
}

checkProcessedOrders()
  .then(() => {
    console.log("✅ Check complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
