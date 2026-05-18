import { db } from "./src/db/client";
import { shopeeOrders } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function checkReadyToShipOrders() {
  console.log("🔍 Checking READY_TO_SHIP orders...\n");

  const readyOrders = await db
    .select()
    .from(shopeeOrders)
    .where(eq(shopeeOrders.orderStatus, "READY_TO_SHIP"))
    .limit(20);

  console.log(`📋 Found ${readyOrders.length} READY_TO_SHIP orders:\n`);

  readyOrders.forEach((order, index) => {
    console.log(`${index + 1}. Order: ${order.orderSn}`);
    console.log(`   Buyer: ${order.buyerUsername}`);
    console.log(`   Amount: ${order.totalAmount}`);
    console.log(`   Shipment Method: ${order.shipmentMethod || "N/A"}`);
    console.log(`   Created: ${order.createTime}\n`);
  });

  console.log("✅ Check complete");
  process.exit(0);
}

checkReadyToShipOrders().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
