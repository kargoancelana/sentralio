import { int, mysqlTable, timestamp, varchar, text, uniqueIndex } from "drizzle-orm/mysql-core";

export const masterProducts = mysqlTable("master_products", {
  id: int("id").primaryKey().autoincrement(),
  sku: varchar("sku", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  stock: int("stock").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const masterProductVariants = mysqlTable("master_product_variants", {
  id: int("id").primaryKey().autoincrement(),
  masterProductId: int("master_product_id").notNull().references(() => masterProducts.id, { onDelete: "cascade" }),
  sku: varchar("sku", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  stock: int("stock").notNull().default(0),
});

export const productGroups = mysqlTable("product_groups", {
  id: int("id").primaryKey().autoincrement(),
  shopId: int("shop_id").notNull(),
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
  uniqShopeeItemId: uniqueIndex("uniq_shopee_item_id").on(t.shopId, t.shopeeItemId)
}));

export const products = mysqlTable("products", {
  id: int("id").primaryKey().autoincrement(),
  shopId: int("shop_id").notNull(),
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
  uniqShopeeModelId: uniqueIndex("uniq_shopee_model_id").on(t.shopId, t.shopeeModelId)
}));

export const shopeeCredentials = mysqlTable("shopee_credentials", {
  id: int("id").primaryKey().autoincrement(),
  partnerId: int("partner_id").notNull(),
  partnerKey: varchar("partner_key", { length: 255 }).notNull(),
  shopId: int("shop_id").notNull(),
  shopName: varchar("shop_name", { length: 255 }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqShopId: uniqueIndex("uniq_shop_id").on(t.shopId),
}));

export const shopeeOrders = mysqlTable("shopee_orders", {
  id: int("id").primaryKey().autoincrement(),
  shopId: int("shop_id").notNull(),
  orderSn: varchar("order_sn", { length: 100 }).notNull().unique(),
  orderStatus: varchar("order_status", { length: 50 }).notNull(),
  totalAmount: int("total_amount").notNull().default(0),
  buyerUsername: varchar("buyer_username", { length: 255 }),
  shippingCarrier: varchar("shipping_carrier", { length: 100 }),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  labelPrinted: int("label_printed").notNull().default(0), // 0 = belum dicetak, 1 = sudah dicetak
  labelPrintedAt: timestamp("label_printed_at"), // Waktu label terakhir dicetak
  payTime: timestamp("pay_time"),
  createTime: timestamp("create_time").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqOrderSn: uniqueIndex("uniq_order_sn").on(t.orderSn),
}));

export const shopeeOrderItems = mysqlTable("shopee_order_items", {
  id: int("id").primaryKey().autoincrement(),
  orderSn: varchar("order_sn", { length: 100 }).notNull(),
  itemName: varchar("item_name", { length: 500 }).notNull(),
  modelName: varchar("model_name", { length: 500 }),
  qty: int("qty").notNull().default(1),
  itemPrice: int("item_price").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Sync state table for background sync resilience
export const syncState = mysqlTable("sync_state", {
  id: int("id").primaryKey().autoincrement(),
  jobName: varchar("job_name", { length: 100 }).notNull(),
  shopId: int("shop_id").notNull(),
  lastSyncTime: timestamp("last_sync_time").notNull(),
  lastSyncEndTime: timestamp("last_sync_end_time").notNull(),
  syncInProgress: int("sync_in_progress").notNull().default(0), // 0 = false, 1 = true (MySQL doesn't have boolean)
  totalSynced: int("total_synced").notNull().default(0),
  errors: int("errors").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqJobShop: uniqueIndex("uniq_job_shop").on(t.jobName, t.shopId),
}));

// Label cache table for persistent label URL storage
// Stores label URLs with expiry time to speed up re-printing
export const labelCacheTable = mysqlTable("label_cache", {
  id: int("id").primaryKey().autoincrement(),
  orderSn: varchar("order_sn", { length: 100 }).notNull().unique(),
  labelUrl: text("label_url").notNull(), // MEDIUMTEXT: base64 PDF bisa 50-200KB
  format: varchar("format", { length: 10 }).notNull().default("pdf"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  expiresAt: timestamp("expires_at").notNull(), // Label URL expires after 14 days
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqOrderSn: uniqueIndex("uniq_label_order_sn").on(t.orderSn),
}));
