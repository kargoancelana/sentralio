import { Elysia, t } from "elysia";
import * as productController from "./product.controller";

const StockBody = t.Object({
  stock: t.Number({ minimum: 0, maximum: 10_000, multipleOf: 1 }),
  source: t.Optional(t.Union([t.Literal("manual"), t.Literal("system"), t.Literal("shopee")])),
});

export const productRoutes = new Elysia({ prefix: "/products" })
  .patch(
    "/:id/stock",
    async ({ params, body, request, set }) => {
      const strictError = await validateStrictStockFromRawJson(request);
      if (strictError) {
        set.status = 400;
        return { error: strictError };
      }

      const id = Number(params.id);
      if (!Number.isFinite(id)) {
        set.status = 400;
        return { error: "Invalid product id" };
      }
      try {
        const source = body.source ?? "system";
        if (!body.source) {
          console.log(`[sync] source not provided, defaulting to "system"`);
        }
        const result = await productController.patchStockByProductId(id, body.stock, source);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        if (msg.includes("not found")) {
          set.status = 404;
          return { error: msg };
        }
        if (msg.toLowerCase().includes("invalid stock")) {
          set.status = 400;
          return { error: msg };
        }
        set.status = 500;
        return { error: msg };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: StockBody,
    },
  )
  .patch(
    "/by-shopee-item/:shopeeItemId/stock",
    async ({ params, body, request, set }) => {
      const strictError = await validateStrictStockFromRawJson(request);
      if (strictError) {
        set.status = 400;
        return { error: strictError };
      }

      try {
        const source = body.source ?? "system";
        if (!body.source) {
          console.log(`[sync] source not provided, defaulting to "system"`);
        }
        const result = await productController.patchStockByShopeeItemId(params.shopeeItemId, body.stock, source);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        if (msg.includes("not found")) {
          set.status = 404;
          return { error: msg };
        }
        if (msg.toLowerCase().includes("invalid stock")) {
          set.status = 400;
          return { error: msg };
        }
        set.status = 500;
        return { error: msg };
      }
    },
    {
      params: t.Object({ shopeeItemId: t.String() }),
      body: StockBody,
    },
  );

async function validateStrictStockFromRawJson(request: Request): Promise<string | null> {
  const rawText = await request.clone().text().catch(() => "");
  if (!rawText) {
    return "Invalid request body";
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return "Invalid JSON body";
  }

  if (!raw || typeof raw !== "object") {
    return "Invalid request body";
  }

  const body = raw as Record<string, unknown>;
  if (!Object.hasOwn(body, "stock")) {
    return "Missing required field: stock";
  }
  if (typeof body.stock !== "number" || !Number.isInteger(body.stock)) {
    return "stock must be an integer";
  }
  if (body.stock < 0) {
    return "stock must be greater than or equal to 0";
  }

  return null;
}
