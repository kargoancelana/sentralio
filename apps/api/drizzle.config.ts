import type { Config } from "drizzle-kit";
import { config } from "dotenv";
import { resolve } from "path";

// Monorepo: load .env from project root
config({ path: resolve(__dirname, "../..", ".env") });
config();

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "sentralio",
  },
} satisfies Config;
