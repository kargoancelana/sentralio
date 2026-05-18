/**
 * Verify tracking numbers for the 10 orders
 */

import { db } from "./src/db/client";
import { shopeeOrders } from "./src/db/schema";
import { inArray } from "drizzle-orm";

const orderSns = [
  "260508TH1MV2NK",
  "260508TGG442Q0",
  "260508TQHHP54S",
  "260508TMPJ5NKC",
  "260508TK24MWTY",
  "260508TJXJ6HYS",
  "260508TWGJQN9J",
  "260508TTUVESEJ",
  "260508TTASWHPH",
  "260508TXXBJ2QU"
];

async function verifyTracking() {
  console.log('🔍 Verifying tracking numbers for 10 orders...\n');

  const orders = await db.select()
    .from(shopeeOrders)
    .where(inArray(shopeeOrders.orderSn, orderSns));

  console.log(`📋 Found ${orders.length} orders:\n`);

  for (const order of orders) {
    const hasTracking = order.trackingNumber ? '✅' : '❌';
    console.log(`${hasTracking} ${order.orderSn}: ${order.trackingNumber || 'N/A'}`);
  }

  const withTracking = orders.filter(o => o.trackingNumber).length;
  const withoutTracking = orders.filter(o => !o.trackingNumber).length;

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ With tracking: ${withTracking}`);
  console.log(`   ❌ Without tracking: ${withoutTracking}`);
  console.log(`   📦 Total: ${orders.length}`);
}

verifyTracking()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
