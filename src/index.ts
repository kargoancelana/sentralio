import { Elysia } from "elysia";
import { env } from "./config/env";
import { productRoutes } from "./modules/product/product.route";
import { shopeeRoutes } from "./modules/shopee/shopee.route";
import { healthRoutes } from "./routes/health";

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
  .use(healthRoutes)
  .use(productRoutes)
  .use(shopeeRoutes)
  .listen(env.appPort);

console.log(`Server running at http://${app.server?.hostname}:${app.server?.port}`);
