import { Elysia } from "elysia";
import { env } from "./config/env";
import { productRoutes } from "./modules/product/product.route";
import { healthRoutes } from "./routes/health";
import { getShopInfoRaw } from "./services/shopee-raw";
import { getShopInfo } from "./services/shopee.service";

const app = new Elysia()
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false,
        message: "Bad Request: Validation Error",
        errors: error.all,
      };
    }
  })
  .get("/", () => ({
    message: "wms-sync API is running",
  }))
  .get("/test-raw", async () => {
    return await getShopInfoRaw();
  })
  .get("/test-shop", async () => {
    return await getShopInfo();
  })
  .use(healthRoutes)
  .use(productRoutes)
  .listen(env.appPort);

console.log(`Server running at http://${app.server?.hostname}:${app.server?.port}`);
