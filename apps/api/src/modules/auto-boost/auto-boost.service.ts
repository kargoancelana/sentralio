import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/client";
import {
  autoBoostConfig,
  autoBoostQueue,
  autoBoostLog,
  shopeeCredentials,
} from "../../db/schema";
import { getBoostedList } from "../../services/shopee-boost.service";

/**
 * Pastikan `shopId` benar-benar milik `companyId` (via shopee_credentials).
 * true = company pemanggil memiliki toko itu; false = bukan miliknya.
 */
export async function isShopOwnedByCompany(
  shopId: number,
  companyId: number
): Promise<boolean> {
  const rows = await db
    .select({ id: shopeeCredentials.id })
    .from(shopeeCredentials)
    .where(
      and(
        eq(shopeeCredentials.shopId, shopId),
        eq(shopeeCredentials.companyId, companyId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function getConfig(shopId: number, companyId: number) {
  const result = await db
    .select()
    .from(autoBoostConfig)
    .where(
      and(
        eq(autoBoostConfig.shopId, shopId),
        eq(autoBoostConfig.companyId, companyId)
      )
    )
    .limit(1);
  const config = result[0];
  if (config) return config;
  return {
    shopId,
    companyId,
    enabled: 0,
    mode: "rotation",
    activeHourStart: 0,
    activeHourEnd: 23,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function upsertConfig(
  shopId: number,
  companyId: number,
  data: Partial<{
    enabled: number;
    mode: string;
    activeHourStart: number;
    activeHourEnd: number;
  }>
) {
  const current = await getConfig(shopId, companyId);
  const merged = {
    enabled: data.enabled ?? current.enabled,
    mode: data.mode ?? current.mode,
    activeHourStart: data.activeHourStart ?? current.activeHourStart,
    activeHourEnd: data.activeHourEnd ?? current.activeHourEnd,
  };
  await db
    .insert(autoBoostConfig)
    .values({ shopId, companyId, ...merged })
    .onDuplicateKeyUpdate({ set: { ...merged, updatedAt: new Date() } });
  return getConfig(shopId, companyId);
}

export async function listQueue(shopId: number, companyId: number) {
  return db
    .select()
    .from(autoBoostQueue)
    .where(
      and(
        eq(autoBoostQueue.shopId, shopId),
        eq(autoBoostQueue.companyId, companyId)
      )
    )
    .orderBy(autoBoostQueue.position);
}

export async function addToQueue(
  shopId: number,
  companyId: number,
  shopeeItemId: number
) {
  const existing = await db
    .select()
    .from(autoBoostQueue)
    .where(
      and(
        eq(autoBoostQueue.shopId, shopId),
        eq(autoBoostQueue.companyId, companyId),
        eq(autoBoostQueue.shopeeItemId, shopeeItemId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error("Item already in queue");
  }

  const maxPosRow = await db
    .select({ pos: autoBoostQueue.position })
    .from(autoBoostQueue)
    .where(
      and(
        eq(autoBoostQueue.shopId, shopId),
        eq(autoBoostQueue.companyId, companyId)
      )
    )
    .orderBy(desc(autoBoostQueue.position))
    .limit(1);

  const maxPos = maxPosRow[0];
  const nextPos = maxPos ? maxPos.pos + 1 : 0;

  await db.insert(autoBoostQueue).values({
    shopId,
    companyId,
    shopeeItemId,
    position: nextPos,
  });
  return true;
}

export async function removeFromQueue(id: number, companyId: number) {
  await db
    .delete(autoBoostQueue)
    .where(
      and(eq(autoBoostQueue.id, id), eq(autoBoostQueue.companyId, companyId))
    );
  return true;
}

export async function reorderQueue(
  shopId: number,
  companyId: number,
  orderedIds: number[]
) {
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (id === undefined) continue;
    await db
      .update(autoBoostQueue)
      .set({ position: i })
      .where(
        and(
          eq(autoBoostQueue.id, id),
          eq(autoBoostQueue.shopId, shopId),
          eq(autoBoostQueue.companyId, companyId)
        )
      );
  }
  return true;
}

export async function getStatus(shopId: number) {
  const live = await getBoostedList(shopId);
  return live.map((b) => ({
    shopeeItemId: b.item_id,
    boosted: true,
    cooldownSecond: b.cool_down_second,
  }));
}

export async function listHistory(
  shopId: number,
  companyId: number,
  limit = 50
) {
  return db
    .select()
    .from(autoBoostLog)
    .where(
      and(
        eq(autoBoostLog.shopId, shopId),
        eq(autoBoostLog.companyId, companyId)
      )
    )
    .orderBy(desc(autoBoostLog.boostedAt))
    .limit(limit);
}
