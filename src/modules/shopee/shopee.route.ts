import { Elysia } from "elysia";
import { getShopInfo } from "../../services/shopee.service";
import { getShopInfoRaw } from "../../services/shopee-raw";

export const shopeeRoutes = new Elysia({ prefix: "/shopee" })
  .get("/test-shop", async () => {
    return await getShopInfo();
  })
  .get("/test-raw", async () => {
    return await getShopInfoRaw();
  });
