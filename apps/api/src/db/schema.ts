import { int, mysqlTable, timestamp, varchar, text, uniqueIndex, index, bigint, date, primaryKey, mysqlEnum } from "drizzle-orm/mysql-core";

export const masterProducts = mysqlTable("master_products", {
  id: int("id").primaryKey().autoincrement(),
  sku: varchar("sku", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  stock: int("stock").notNull().default(0),
  imageUrl: varchar("image_url", { length: 500 }), // cover thumbnail captured at import time
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
  // Connection lifecycle. 'connected' = active (synced + data shown).
  // 'disconnected' = soft-disconnected: row & shop_name retained, tokens cleared,
  // all data hidden across the app and sync skipped until the shop is reconnected
  // (OAuth re-auth flips this back to 'connected').
  status: varchar("status", { length: 20 }).notNull().default("connected"),
  initialSyncStatus: varchar("initial_sync_status", { length: 20 }).notNull().default("pending"),
  initialSyncStep: varchar("initial_sync_step", { length: 40 }),
  initialSyncError: text("initial_sync_error"),
  initialSyncStartedAt: timestamp("initial_sync_started_at"),
  initialSyncAt: timestamp("initial_sync_at"),
  disconnectedAt: timestamp("disconnected_at"),
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
  // Shopee ship-by deadline (unix seconds). 0 means Shopee is holding the order
  // ("tertunda"/Menunggu) — it cannot be processed yet even though order_status
  // is READY_TO_SHIP. A non-zero value means the order is genuinely shippable.
  shipByDate: int("ship_by_date").notNull().default(0),
  labelPrinted: int("label_printed").notNull().default(0), // 0 = belum dicetak, 1 = sudah dicetak
  labelPrintedAt: timestamp("label_printed_at"), // Waktu label terakhir dicetak
  payTime: timestamp("pay_time"),
  createTime: timestamp("create_time").notNull(),
  escrowReleaseTime: timestamp("escrow_release_time"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqOrderSn: uniqueIndex("uniq_order_sn").on(t.orderSn),
  idxEscrowReleaseTime: index("idx_escrow_release_time").on(t.escrowReleaseTime),
}));

export const shopeeOrderItems = mysqlTable("shopee_order_items", {
  id: int("id").primaryKey().autoincrement(),
  orderSn: varchar("order_sn", { length: 100 }).notNull(),
  itemName: varchar("item_name", { length: 500 }).notNull(),
  modelName: varchar("model_name", { length: 500 }),
  modelSku: varchar("model_sku", { length: 100 }),
  qty: int("qty").notNull().default(1),
  itemPrice: int("item_price").notNull().default(0),
  itemId: varchar("item_id", { length: 64 }),
  modelId: varchar("model_id", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxLookup: index("idx_order_items_lookup").on(t.orderSn, t.itemId, t.modelId),
  // Prevent duplicate (order_sn, item_id, model_id) rows. Required because both
  // order-sync (DELETE+INSERT) and escrow-sync.heal (INSERT-only) can race when
  // they process the same order concurrently. With this UNIQUE constraint the
  // ER_DUP_ENTRY catches in those services actually trigger and keep data clean.
  uniqOrderItemModel: uniqueIndex("uniq_order_item_model").on(t.orderSn, t.itemId, t.modelId),
}));

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
  labelDataJson: text("label_data_json"), // MEDIUMTEXT: JSON for frontend label rendering (cache for re-prints)
  expiresAt: timestamp("expires_at").notNull(), // Label URL expires after 14 days
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqOrderSn: uniqueIndex("uniq_label_order_sn").on(t.orderSn),
}));

// ─── HPP Entries ───────────────────────────────────────────────

export const hppEntries = mysqlTable("hpp_entries", {
  id: int("id").primaryKey().autoincrement(),
  variantId: int("variant_id").notNull()
    .references(() => masterProductVariants.id, { onDelete: "cascade" }),
  hppValue: int("hpp_value").notNull(),          // in Rupiah
  startDate: varchar("start_date", { length: 10 }).notNull(), // YYYY-MM-DD
  endDate: varchar("end_date", { length: 10 }),   // YYYY-MM-DD or null
  note: varchar("note", { length: 255 }),
  deletedAt: timestamp("deleted_at"),             // soft delete
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxVariant: index("idx_hpp_variant").on(t.variantId),
  idxVariantPeriod: index("idx_hpp_variant_period").on(t.variantId, t.startDate, t.endDate),
}));

// ─── Master Packing Cost Entries ──────────────────────────────

export const masterPackingCostEntries = mysqlTable("master_packing_cost_entries", {
  id: int("id").primaryKey().autoincrement(),
  masterProductId: int("master_product_id").notNull()
    .references(() => masterProducts.id, { onDelete: "cascade" }),
  packingCost: int("packing_cost").notNull(),     // in Rupiah, range [0, 999999999]
  startDate: varchar("start_date", { length: 10 }).notNull(), // YYYY-MM-DD
  endDate: varchar("end_date", { length: 10 }),   // YYYY-MM-DD or null
  note: varchar("note", { length: 255 }),
  autoClosedBy: int("auto_closed_by"),            // ID of entry that triggered auto-close
  deletedAt: timestamp("deleted_at"),             // soft delete
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxMasterProduct: index("idx_master_packing_master_product").on(t.masterProductId),
  idxMasterProductPeriod: index("idx_master_packing_period").on(t.masterProductId, t.startDate, t.endDate),
}));

// ─── Biaya Packing Entries ─────────────────────────────────────

export const packingCostEntries = mysqlTable("packing_cost_entries", {
  id: int("id").primaryKey().autoincrement(),
  productGroupId: int("product_group_id").notNull()
    .references(() => productGroups.id, { onDelete: "cascade" }),
  packingCost: int("packing_cost").notNull(),     // in Rupiah
  startDate: varchar("start_date", { length: 10 }).notNull(), // YYYY-MM-DD
  endDate: varchar("end_date", { length: 10 }),   // YYYY-MM-DD or null
  note: varchar("note", { length: 255 }),
  autoClosedBy: int("auto_closed_by"),            // ID of entry that triggered auto-close
  deletedAt: timestamp("deleted_at"),             // soft delete
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  idxProductGroup: index("idx_packing_product_group").on(t.productGroupId),
  idxProductGroupPeriod: index("idx_packing_product_group_period").on(t.productGroupId, t.startDate, t.endDate),
}));

// ─── Shopee Order Fees ─────────────────────────────────────────

export const shopeeOrderFees = mysqlTable("shopee_order_fees", {
  id: int("id").primaryKey().autoincrement(),
  orderSn: varchar("order_sn", { length: 100 }).notNull(),
  commissionFee: int("commission_fee").notNull().default(0),
  serviceFee: int("service_fee").notNull().default(0),
  sellerOrderProcessingFee: int("seller_order_processing_fee").notNull().default(0),
  actualShippingFee: int("actual_shipping_fee").notNull().default(0),
  shopeeShippingRebate: int("shopee_shipping_rebate").notNull().default(0),
  sellerVoucher: int("seller_voucher").notNull().default(0),
  escrowAmount: int("escrow_amount").notNull().default(0),
  amsCommissionFee: int("ams_commission_fee").notNull().default(0),
  sellerReturnRefund: int("seller_return_refund").notNull().default(0),
  // Signed value from Shopee `order_income.final_shipping_fee`. Can be:
  //   - Negative → seller bears shipping cost (counts as deduction)
  //   - Positive → seller receives shipping refund (reduces total deductions)
  // We deliberately do NOT abs() this value; signed semantics are required
  // for correct grand-total calculation in Rincian Potongan Marketplace.
  finalShippingFee: int("final_shipping_fee").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqOrderSn: uniqueIndex("uniq_fee_order_sn").on(t.orderSn),
}));

// ─── Audit Log ─────────────────────────────────────────────────

export const costAuditLog = mysqlTable("cost_audit_log", {
  id: int("id").primaryKey().autoincrement(),
  entityType: varchar("entity_type", { length: 20 }).notNull(), // 'hpp' | 'packing_cost'
  entityId: int("entity_id").notNull(),
  action: varchar("action", { length: 10 }).notNull(), // 'insert' | 'update' | 'delete'
  previousValues: text("previous_values"),        // JSON string
  newValues: text("new_values"),                  // JSON string
  userId: varchar("user_id", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  idxEntityLookup: index("idx_audit_entity").on(t.entityType, t.entityId),
}));

// ─── Shopee Ads Daily Expense Cache ────────────────────────────

export const shopeeAdsDailyExpense = mysqlTable("shopee_ads_daily_expense", {
  shopId: bigint("shop_id", { mode: "number" }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  expense: int("expense").notNull().default(0),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.shopId, t.date] }),
}));

// ─── Auth Tables ───────────────────────────────────────────────

export const userRoleEnum = mysqlEnum("role", ["admin", "staff"]);

export const users = mysqlTable("users", {
  id:           int("id").primaryKey().autoincrement(),
  email:        varchar("email", { length: 254 }).notNull(),        // stored verbatim
  emailLower:   varchar("email_lower", { length: 254 }).notNull(),  // ASCII-lowercased + trimmed; used for lookup
  name:         varchar("name", { length: 100 }).notNull(),
  role:         userRoleEnum.notNull(),
  passwordHash: varchar("password_hash", { length: 100 }).notNull(), // bcrypt = 60 chars; widened for safety
  isActive:     int("is_active").notNull().default(1),               // 1=true, 0=false (MySQL booleanish)
  tokensValidFrom: bigint("tokens_valid_from", { mode: "number" }).notNull().default(0), // unix seconds; sessions with iat < this are invalid (password change revokes old sessions)
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  uniqEmailLower: uniqueIndex("uniq_users_email_lower").on(t.emailLower),
}));

export const failedLoginAttempts = mysqlTable("failed_login_attempts", {
  id:          int("id").primaryKey().autoincrement(),
  emailLower:  varchar("email_lower", { length: 254 }).notNull(),
  ip:          varchar("ip", { length: 45 }).notNull(), // IPv4/IPv6 textual
  attemptedAt: timestamp("attempted_at").notNull().defaultNow(),
}, (t) => ({
  idxEmailTime: index("idx_failed_email_time").on(t.emailLower, t.attemptedAt),
}));

export const accountLockouts = mysqlTable("account_lockouts", {
  emailLower:  varchar("email_lower", { length: 254 }).primaryKey(),
  lockedUntil: timestamp("locked_until").notNull(),
  lockedAt:    timestamp("locked_at").notNull().defaultNow(),
});

export const revokedSessions = mysqlTable("revoked_sessions", {
  jti:       varchar("jti", { length: 36 }).primaryKey(), // UUIDv4
  userId:    int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  revokedAt: timestamp("revoked_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // = original JWT exp; rows older than this can be GC'd
}, (t) => ({
  idxExpiresAt: index("idx_revoked_expires").on(t.expiresAt),
}));

// Configurable per-feature access for the `staff` role. Admin always has full
// access (not represented here). One row per configurable feature key.
// enabled: 1 = staff may access this feature, 0 = denied (403 on backend, hidden on frontend).
export const staffPermissions = mysqlTable("staff_permissions", {
  feature: varchar("feature", { length: 64 }).primaryKey(),
  enabled: int("enabled").notNull().default(0), // 1=true, 0=false
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const autoBoostConfig = mysqlTable("auto_boost_config", {
  shopId: bigint("shop_id", { mode: "number" }).primaryKey(),
  enabled: int("enabled").notNull().default(0), // 0/1
  mode: varchar("mode", { length: 16 }).notNull().default("rotation"), // rotation | fixed
  activeHourStart: int("active_hour_start").notNull().default(0),  // 0-23 WIB
  activeHourEnd: int("active_hour_end").notNull().default(23),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const autoBoostQueue = mysqlTable("auto_boost_queue", {
  id: int("id").autoincrement().primaryKey(),
  shopId: bigint("shop_id", { mode: "number" }).notNull(),
  shopeeItemId: bigint("shopee_item_id", { mode: "number" }).notNull(),
  position: int("position").notNull().default(0), // urutan rotasi
  enabled: int("enabled").notNull().default(1),
  lastBoostedAt: timestamp("last_boosted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const autoBoostLog = mysqlTable("auto_boost_log", {
  id: int("id").autoincrement().primaryKey(),
  shopId: bigint("shop_id", { mode: "number" }).notNull(),
  shopeeItemId: bigint("shopee_item_id", { mode: "number" }).notNull(),
  status: varchar("status", { length: 16 }).notNull(), // success | failed
  message: varchar("message", { length: 512 }),
  boostedAt: timestamp("boosted_at").notNull().defaultNow(),
});

