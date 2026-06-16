import { Elysia, t } from "elysia";
import { getConfig, upsertConfig, listQueue, addToQueue, removeFromQueue, reorderQueue, getStatus, listHistory } from "./auto-boost.service";

export const autoBoostRoutes = new Elysia({ prefix: "/auto-boost" })
  .get("/config", async ({ query, set }) => {
    const shopId = query.shopId ? parseInt(query.shopId as string) : undefined;
    if (!shopId) { set.status = 400; return { success: false, message: "shopId is required" }; }
    const config = await getConfig(shopId);
    return { success: true, data: config };
  })
  .put("/config", async ({ body, set }) => {
    try {
      const config = await upsertConfig(body.shopId, {
        enabled: body.enabled,
        mode: body.mode,
        activeHourStart: body.activeHourStart,
        activeHourEnd: body.activeHourEnd,
      });
      return { success: true, data: config };
    } catch (error: any) {
      set.status = 500;
      return { success: false, message: error.message };
    }
  }, {
    body: t.Object({
      shopId: t.Number(),
      enabled: t.Number(),
      mode: t.String(),
      activeHourStart: t.Number(),
      activeHourEnd: t.Number(),
    })
  })
  .get("/queue", async ({ query, set }) => {
    const shopId = query.shopId ? parseInt(query.shopId as string) : undefined;
    if (!shopId) { set.status = 400; return { success: false, message: "shopId is required" }; }
    const queue = await listQueue(shopId);
    return { success: true, data: queue };
  })
  .post("/queue", async ({ body, set }) => {
    try {
      await addToQueue(body.shopId, body.shopeeItemId);
      return { success: true };
    } catch (error: any) {
      set.status = 500;
      return { success: false, message: error.message };
    }
  }, {
    body: t.Object({
      shopId: t.Number(),
      shopeeItemId: t.Number(),
    })
  })
  .delete("/queue/:id", async ({ params, set }) => {
    try {
      await removeFromQueue(parseInt(params.id));
      return { success: true };
    } catch (error: any) {
      set.status = 500;
      return { success: false, message: error.message };
    }
  })
  .put("/queue/reorder", async ({ body, set }) => {
    try {
      await reorderQueue(body.shopId, body.orderedIds);
      return { success: true };
    } catch (error: any) {
      set.status = 500;
      return { success: false, message: error.message };
    }
  }, {
    body: t.Object({
      shopId: t.Number(),
      orderedIds: t.Array(t.Number()),
    })
  })
  .get("/status", async ({ query, set }) => {
    const shopId = query.shopId ? parseInt(query.shopId as string) : undefined;
    if (!shopId) { set.status = 400; return { success: false, message: "shopId is required" }; }
    try {
      const status = await getStatus(shopId);
      return { success: true, data: status };
    } catch (error: any) {
      set.status = 500;
      return { success: false, message: error.message };
    }
  })
  .get("/history", async ({ query, set }) => {
    const shopId = query.shopId ? parseInt(query.shopId as string) : undefined;
    if (!shopId) { set.status = 400; return { success: false, message: "shopId is required" }; }
    try {
      const history = await listHistory(shopId);
      return { success: true, data: history };
    } catch (error: any) {
      set.status = 500;
      return { success: false, message: error.message };
    }
  });
