import { config } from "dotenv";
import { desc, eq } from "drizzle-orm";

config();

import { db } from "./client";
import { productGroups, products } from "./schema";

/**
 * Resets demo rows and inserts one group with three listings (same stock).
 * Safe to re-run: clears previous seed data for the demo group name pattern.
 */
async function seed() {
  await db.delete(products);
  await db.delete(productGroups);

  await db.insert(productGroups).values({ name: "Demo physical SKU" });

  const [group] = await db.select().from(productGroups).orderBy(desc(productGroups.id)).limit(1);
  if (!group) {
    throw new Error("Seed failed: no product_group inserted");
  }

  await db.insert(products).values([
    {
      groupId: group.id,
      shopeeItemId: "100001",
      shopeeModelId: "200001",
      stock: 10,
    },
    {
      groupId: group.id,
      shopeeItemId: "100002",
      shopeeModelId: "200002",
      stock: 10,
    },
    {
      groupId: group.id,
      shopeeItemId: "100003",
      shopeeModelId: "200003",
      stock: 10,
    },
  ]);

  const rows = await db.select().from(products).where(eq(products.groupId, group.id));
  console.log(`Seed OK: group_id=${group.id} products=${rows.length}`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
