import { Elysia } from "elysia";
import { pool } from "../db/client";

export const healthRoutes = new Elysia({ prefix: "/health" }).get("/", async () => {
  let database = "disconnected";

  try {
    await pool.query("SELECT 1");
    database = "connected";
  } catch {
    database = "disconnected";
  }

  return {
    status: "ok",
    database,
    timestamp: new Date().toISOString(),
  };
});
