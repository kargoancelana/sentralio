import { Elysia, t } from "elysia";
import {
  getConfig,
  upsertConfig,
  listQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  getStatus,
  listHistory,
  isShopOwnedByCompany,
} from "./auto-boost.service";
import { authMiddleware } from "../auth/auth.middleware";

export const autoBoostRoutes = new Elysia({ prefix: "/auto-boost" })
  .use(authMiddleware)
  .get("/config", async ({ query, set, user }) => {
    const shopId = query.shopId ? parseInt(query.shopId as string) : undefined;
    if (!shopId) {
      set.status = 400;
      return { success: false, message: "shopId is required" };
    }
    if (!(await isShopOwnedByCompany(shopId, user.companyId))) {
      set.status = 404;
      return { success: false, message: "Shop not found" };
    }
    const config = await getConfig(shopId, user.companyId);
    return { success: true, data: config };
  })
  .put(
    "/config",
    async ({ body, set, user }) => {
      try {
        if (!(await isShopOwnedByCompany(body.shopId, user.companyId))) {
          set.status = 404;
          return { success: false, message: "Shop not found" };
        }
        const config = await upsertConfig(body.shopId, user.companyId, {
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
    },
    {
      body: t.Object({
        shopId: t.Number(),
        enabled: t.Optional(t.Number()),
        mode: t.Optional(t.String()),
        activeHourStart: t.Optional(t.Number()),
        activeHourEnd: t.Optional(t.Number()),
      }),
    }
  )
  .get("/queue", async ({ query, set, user }) => {
    const shopId = query.shopId ? parseInt(query.shopId as string) : undefined;
    if (!shopId) {
      set.status = 400;
      return { success: false, message: "shopId is required" };
    }
    if (!(await isShopOwnedByCompany(shopId, user.companyId))) {
      set.status = 404;
      return { success: false, message: "Shop not found" };
    }
    const queue = await listQueue(shopId, user.companyId);
    return { success: true, data: queue };
  })
  .post(
    "/queue",
    async ({ body, set, user }) => {
      try {
        if (!(await isShopOwnedByCompany(body.shopId, user.companyId))) {
          set.status = 404;
          return { success: false, message: "Shop not found" };
        }
        await addToQueue(body.shopId, user.companyId, body.shopeeItemId);
        return { success: true };
      } catch (error: any) {
        set.status = 500;
        return { success: false, message: error.message };
      }
    },
    {
      body: t.Object({
        shopId: t.Number(),
        shopeeItemId: t.Number(),
      }),
    }
  )
  .delete("/queue/:id", async ({ params, set, user }) => {
    try {
      await removeFromQueue(parseInt(params.id), user.companyId);
      return { success: true };
    } catch (error: any) {
      set.status = 500;
      return { success: false, message: error.message };
    }
  })
  .put(
    "/queue/reorder",
    async ({ body, set, user }) => {
      try {
        if (!(await isShopOwnedByCompany(body.shopId, user.companyId))) {
          set.status = 404;
          return { success: false, message: "Shop not found" };
        }
        await reorderQueue(body.shopId, user.companyId, body.orderedIds);
        return { success: true };
      } catch (error: any) {
        set.status = 500;
        return { success: false, message: error.message };
      }
    },
    {
      body: t.Object({
        shopId: t.Number(),
        orderedIds: t.Array(t.Number()),
      }),
    }
  )
  .get("/status", async ({ query, set, user }) => {
    const shopId = query.shopId ? parseInt(query.shopId as string) : undefined;
    if (!shopId) {
      set.status = 400;
      return { success: false, message: "shopId is required" };
    }
    if (!(await isShopOwnedByCompany(shopId, user.companyId))) {
      set.status = 404;
      return { success: false, message: "Shop not found" };
    }
    try {
      const status = await getStatus(shopId);
      return { success: true, data: status };
    } catch (error: any) {
      set.status = 500;
      return { success: false, message: error.message };
    }
  })
  .get("/history", async ({ query, set, user }) => {
    const shopId = query.shopId ? parseInt(query.shopId as string) : undefined;
    if (!shopId) {
      set.status = 400;
      return { success: false, message: "shopId is required" };
    }
    if (!(await isShopOwnedByCompany(shopId, user.companyId))) {
      set.status = 404;
      return { success: false, message: "Shop not found" };
    }
    try {
      const history = await listHistory(shopId, user.companyId);
      return { success: true, data: history };
    } catch (error: any) {
      set.status = 500;
      return { success: false, message: error.message };
    }
  });
