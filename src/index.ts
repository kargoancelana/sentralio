import { Elysia } from "elysia";
import { env } from "./config/env";
import { healthRoutes } from "./routes/health";

const app = new Elysia()
  .get("/", () => ({
    message: "wms-sync API is running",
  }))
  .use(healthRoutes)
  .listen(env.appPort);

console.log(`Server running at http://${app.server?.hostname}:${app.server?.port}`);
