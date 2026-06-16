import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/client";
import { autoBoostConfig, autoBoostQueue, autoBoostLog } from "../../db/schema";
import { getBoostedList } from "../../services/shopee-boost.service";

export async function getConfig(shopId: number) {
  const result = await db.select().from(autoBoostConfig).where(eq(autoBoostConfig.shopId, shopId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertConfig(shopId: number, data: { enabled: number, mode: string, activeHourStart: number, activeHourEnd: number }) {
  await db.insert(autoBoostConfig).values({
    shopId,
    enabled: data.enabled,
    mode: data.mode,
    activeHourStart: data.activeHourStart,
    activeHourEnd: data.activeHourEnd,
  }).onDuplicateKeyUpdate({
    set: {
      enabled: data.enabled,
      mode: data.mode,
      activeHourStart: data.activeHourStart,
      activeHourEnd: data.activeHourEnd,
      updatedAt: new Date(),
    }
  });
  return getConfig(shopId);
}

export async function listQueue(shopId: number) {
  return db.select().from(autoBoostQueue)
    .where(eq(autoBoostQueue.shopId, shopId))
    .orderBy(autoBoostQueue.position);
}

export async function addToQueue(shopId: number, shopeeItemId: number) {
  const existing = await db.select().from(autoBoostQueue)
    .where(and(eq(autoBoostQueue.shopId, shopId), eq(autoBoostQueue.shopeeItemId, shopeeItemId)))
    .limit(1);
  
  if (existing.length > 0) {
    throw new Error("Item already in queue");
  }

  const maxPosRow = await db.select({ pos: autoBoostQueue.position }).from(autoBoostQueue)
    .where(eq(autoBoostQueue.shopId, shopId))
    .orderBy(desc(autoBoostQueue.position))
    .limit(1);
  
  const nextPos = maxPosRow.length > 0 ? maxPosRow[0].pos + 1 : 0;

  await db.insert(autoBoostQueue).values({
    shopId,
    shopeeItemId,
    position: nextPos,
  });
  return true;
}

export async function removeFromQueue(id: number) {
  await db.delete(autoBoostQueue).where(eq(autoBoostQueue.id, id));
  return true;
}

export async function reorderQueue(shopId: number, orderedIds: number[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(autoBoostQueue)
      .set({ position: i })
      .where(and(eq(autoBoostQueue.id, orderedIds[i]), eq(autoBoostQueue.shopId, shopId)));
  }
  return true;
}

export async function getStatus(shopId: number) {
  const live = await getBoostedList(shopId);
  const queue = await listQueue(shopId);
  return { live, queue };
}

export async function listHistory(shopId: number, limit = 50) {
  return db.select().from(autoBoostLog)
    .where(eq(autoBoostLog.shopId, shopId))
    .orderBy(desc(autoBoostLog.boostedAt))
    .limit(limit);
}
