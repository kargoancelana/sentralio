import { int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const productGroups = mysqlTable("product_groups", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const products = mysqlTable("products", {
  id: int("id").primaryKey().autoincrement(),
  groupId: int("group_id")
    .notNull()
    .references(() => productGroups.id, { onDelete: "cascade" }),
  shopeeItemId: varchar("shopee_item_id", { length: 64 }).notNull(),
  shopeeModelId: varchar("shopee_model_id", { length: 64 }).notNull(),
  stock: int("stock").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
