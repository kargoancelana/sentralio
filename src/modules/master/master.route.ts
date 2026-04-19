import { Elysia, t } from "elysia";
import {
  updateStockByMasterSku,
  mapModelsToMaster,
  importFromListing,
  listMasterProducts,
  getUnlinkedModels,
  updateMasterProduct,
} from "../../services/master.service";

export const masterRoutes = new Elysia({ prefix: "/master" })

  // ─── Stock Update ────────────────────────────────────
  .post(
    "/update-stock",
    async ({ body, set }) => {
      try {
        const result = await updateStockByMasterSku(body.master_product_id, body.stock);
        return { success: true, data: result };
      } catch (error: any) {
        const msg = error.message || "Failed to update master stock";
        set.status = msg.includes("not found") ? 404 : 500;
        return { success: false, message: msg };
      }
    },
    {
      body: t.Object({
        master_product_id: t.Number(),
        stock: t.Number(),
      }),
    }
  )

  // ─── Mapping ─────────────────────────────────────────
  .post(
    "/map",
    async ({ body, set }) => {
      try {
        const result = await mapModelsToMaster(body.master_product_id, body.shopee_model_ids);
        return { success: true, data: result };
      } catch (error: any) {
        const msg = error.message || "Failed to map models";
        if (msg.includes("not found")) set.status = 404;
        else if (msg.includes("conflict")) set.status = 409;
        else set.status = 500;
        return { success: false, message: msg };
      }
    },
    {
      body: t.Object({
        master_product_id: t.Number(),
        shopee_model_ids: t.Array(t.String(), { minItems: 1 }),
      }),
    }
  )

  // ─── Import from Listing ─────────────────────────────
  .post(
    "/import-from-listing",
    async ({ body, set }) => {
      try {
        const result = await importFromListing(body.shopee_item_id);
        return { success: true, data: result };
      } catch (error: any) {
        const msg = error.message || "Failed to import listing";
        set.status = msg.includes("not found") || msg.includes("No products") ? 404 : 500;
        return { success: false, message: msg };
      }
    },
    {
      body: t.Object({
        shopee_item_id: t.String(),
      }),
    }
  )

  // ─── List Master Products ────────────────────────────
  .get("/list", async () => {
    const data = await listMasterProducts();
    return { success: true, data };
  })

  // ─── Unlinked Models ─────────────────────────────────
  .get("/unlinked-models", async () => {
    const data = await getUnlinkedModels();
    return { success: true, data };
  })

  // ─── Update Master SKU/Name ──────────────────────────
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      try {
        const id = Number(params.id);
        if (!Number.isFinite(id)) {
          set.status = 400;
          return { success: false, message: "Invalid master product id" };
        }
        const result = await updateMasterProduct(id, body);
        return { success: true, data: result };
      } catch (error: any) {
        const msg = error.message || "Failed to update master product";
        set.status = msg.includes("not found") ? 404 : 400;
        return { success: false, message: msg };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        sku: t.Optional(t.String()),
        name: t.Optional(t.String()),
      }),
    }
  );
