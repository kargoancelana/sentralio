import { Elysia } from "elysia";
import { backgroundSyncService } from "../../services/background-sync.service";
import { EscrowSyncService } from "../../services/escrow-sync.service";

export const syncRoutes = new Elysia({ prefix: "/sync" })

  // ─── Background Sync Status ───────────────────────────────────
  .get("/status", () => {
    const stats = backgroundSyncService.getSyncStats();
    return {
      success: true,
      data: stats,
    };
  })

  // ─── Background Sync: Force manual trigger ────────────────────
  .post("/force", async ({ body }) => {
    const { order_status, days_back } = body as {
      order_status?: string;
      days_back?: number;
    };
    try {
      const result = await backgroundSyncService.forceSyncOrders(
        order_status,
        days_back || 15,
      );
      return {
        success: true,
        message: `Force sync completed, synced ${result.totalSynced} orders`,
        data: result,
      };
    } catch (err: any) {
      console.error("[sync/force] gagal:", err);
      return {
        success: false,
        message: err.message,
      };
    }
  })

  // ─── Escrow Sync: Manual trigger ─────────────────────────────
  .post("/escrow", async ({ body, set }) => {
    const { days_back } = (body ?? {}) as { days_back?: number };
    const daysBack = days_back ?? 30;

    try {
      const service = new EscrowSyncService();
      const result = await service.startEscrowSync(daysBack);
      return result;
    } catch (err: any) {
      console.error("[sync/escrow] gagal:", err);
      if (err.message === "SYNC_IN_PROGRESS") {
        set.status = 409;
        return {
          success: false,
          message: "Sinkronisasi escrow sedang berjalan",
        };
      }
      set.status = 500;
      return {
        success: false,
        message: err.message,
      };
    }
  });
