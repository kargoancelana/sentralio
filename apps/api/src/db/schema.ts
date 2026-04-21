import { int, mysqlTable, timestamp, varchar, text, uniqueIndex } from "drizzle-orm/mysql-core";

export const masterProducts = mysqlTable("master_products", {
  id: int("id").primaryKey().autoincrement(),
  sku: varchar("sku", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  stock: int("stock").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productGroups = mysqlTable("product_groups", {
  id: int("id").primaryKey().autoincrement(),
  shopeeItemId: varchar("shopee_item_id", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  itemSku: varchar("item_sku", { length: 100 }),
  categoryId: int("category_id"),
  itemStatus: varchar("item_status", { length: 50 }).default("NORMAL"),
  imageUrl: varchar("image_url", { length: 500 }),
  stock: int("stock").notNull().default(0),
  lastSync: timestamp("last_sync"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqShopeeItemId: uniqueIndex("uniq_shopee_item_id").on(t.shopeeItemId)
}));

export const products = mysqlTable("products", {
  id: int("id").primaryKey().autoincrement(),
  masterProductId: int("master_product_id").references(() => masterProducts.id),
  groupId: int("group_id")
    .notNull()
    .references(() => productGroups.id, { onDelete: "cascade" }),
  shopeeItemId: varchar("shopee_item_id", { length: 64 }).notNull(),
  shopeeModelId: varchar("shopee_model_id", { length: 64 }).notNull(),
  modelName: varchar("model_name", { length: 255 }),
  modelSku: varchar("model_sku", { length: 100 }),
  price: int("price").default(0),
  shopeeStock: int("shopee_stock").default(0),
  stock: int("stock").notNull().default(0), // Deprecated. Master stock is in productGroups
  syncStatus: varchar("sync_status", { length: 20 }).notNull().default("pending"),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqShopeeModelId: uniqueIndex("uniq_shopee_model_id").on(t.shopeeModelId)
}));

export const shopeeCredentials = mysqlTable("shopee_credentials", {
  id: int("id").primaryKey().autoincrement(),
  partnerId: int("partner_id").notNull(),
  partnerKey: varchar("partner_key", { length: 255 }).notNull(),
  shopId: int("shop_id").notNull(),
  shopName: varchar("shop_name", { length: 255 }),
  accessToken: varchar("access_token", { length: 255 }).notNull(),
  refreshToken: varchar("refresh_token", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqShopId: uniqueIndex("uniq_shop_id").on(t.shopId),
}));
