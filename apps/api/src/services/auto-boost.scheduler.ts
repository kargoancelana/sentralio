import { db } from "../db/client";
import { autoBoostConfig, autoBoostQueue, autoBoostLog } from "../db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getBoostedList, boostItems } from "./shopee-boost.service";

class AutoBoostScheduler {
  private timer: NodeJS.Timer | null = null;
  private readonly AUTO_BOOST_INTERVAL = 5 * 60 * 1000; // 5 minutes

  public start() {
    if (this.timer) return;
    console.log("[AutoBoost] Scheduler started");
    this.timer = setInterval(() => this.runCycle(), this.AUTO_BOOST_INTERVAL);
    // Jalankan satu kali pas booting, tapi beri jeda dikit biar server ready.
    setTimeout(() => this.runCycle(), 10000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[AutoBoost] Scheduler stopped");
    }
  }

  private async runCycle() {
    try {
      // 1. Ambil semua shopId yang enabled
      const configs = await db.select().from(autoBoostConfig).where(eq(autoBoostConfig.enabled, 1));
      
      for (const config of configs) {
        await this.processShop(config);
      }
    } catch (err: any) {
      console.error("[AutoBoost] Cycle error:", err.message);
    }
  }

  private async processShop(config: typeof autoBoostConfig.$inferSelect) {
    const shopId = config.shopId;
    
    // 1. Cek active hour WIB
    const now = new Date();
    // UTC+7 for WIB
    const hourWib = (now.getUTCHours() + 7) % 24;
    
    if (config.activeHourStart <= config.activeHourEnd) {
      if (hourWib < config.activeHourStart || hourWib >= config.activeHourEnd) return;
    } else {
      // cross midnight (e.g. 22 to 06)
      if (hourWib < config.activeHourStart && hourWib >= config.activeHourEnd) return;
    }

    try {
      // 2. Cek slot live
      const boosted = await getBoostedList(shopId);
      const boostedIds = boosted.map(b => b.item_id);
      
      const freeSlots = 5 - boosted.length;
      if (freeSlots <= 0) {
        return; // Full, skip
      }

      // Ambil data queue
      const queue = await db.select().from(autoBoostQueue)
        .where(
          and(
            eq(autoBoostQueue.shopId, shopId),
            eq(autoBoostQueue.enabled, 1)
          )
        )
        // NULLs first in MySQL ASC means never boosted items get priority
        .orderBy(asc(autoBoostQueue.position), asc(autoBoostQueue.lastBoostedAt));

      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

      const candidates = queue.filter(q => {
        if (boostedIds.includes(q.shopeeItemId)) return false;
        if (q.lastBoostedAt && q.lastBoostedAt > fourHoursAgo) return false;
        return true;
      });

      if (candidates.length === 0) return;

      const picked = candidates.slice(0, freeSlots);
      const pickedIds = picked.map(p => p.shopeeItemId);

      // Execute boost
      try {
        await boostItems(shopId, pickedIds);
        
        // Update sukses
        const nowAt = new Date();
        for (const item of picked) {
          await db.update(autoBoostQueue)
            .set({ lastBoostedAt: nowAt })
            .where(eq(autoBoostQueue.id, item.id));
            
          await db.insert(autoBoostLog).values({
            shopId,
            shopeeItemId: item.shopeeItemId,
            status: "success",
            message: null,
            boostedAt: nowAt,
          });
        }
      } catch (err: any) {
        console.error(`[AutoBoost] Failed to boost items for shop ${shopId}:`, err.message);
        
        // Log error untuk tiap item
        const nowAt = new Date();
        for (const item of picked) {
          await db.insert(autoBoostLog).values({
            shopId,
            shopeeItemId: item.shopeeItemId,
            status: "failed",
            message: err.message.substring(0, 500),
            boostedAt: nowAt,
          });
        }
      }

    } catch (err: any) {
      console.error(`[AutoBoost] processShop error shopId=${shopId}:`, err.message);
    }
  }
}

export const autoBoostScheduler = new AutoBoostScheduler();
