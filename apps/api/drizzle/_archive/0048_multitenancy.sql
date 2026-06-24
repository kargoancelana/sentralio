-- 0048 Multi-tenancy: companies + company_id di semua tabel tenant
-- Idempotent: dijalanin lewat migrate-0048.ts (skip error "already applied")
CREATE TABLE IF NOT EXISTS `companies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `slug` varchar(255) NOT NULL,
  `status` enum('pending','active','suspended','expired') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_companies_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
INSERT IGNORE INTO `companies` (`id`,`name`,`slug`,`status`) VALUES (1,'Default','default','active');
--> statement-breakpoint
ALTER TABLE `product_groups` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `product_groups` ADD INDEX `idx_product_groups_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `product_groups` ADD CONSTRAINT `product_groups_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `products` ADD INDEX `idx_products_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD INDEX `idx_shopee_credentials_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD CONSTRAINT `shopee_credentials_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `shopee_orders` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `shopee_orders` ADD INDEX `idx_shopee_orders_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `shopee_orders` ADD CONSTRAINT `shopee_orders_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `shopee_order_items` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `shopee_order_items` ADD INDEX `idx_shopee_order_items_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `shopee_order_items` ADD CONSTRAINT `shopee_order_items_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `sync_state` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `sync_state` ADD INDEX `idx_sync_state_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `sync_state` ADD CONSTRAINT `sync_state_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `label_cache` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `label_cache` ADD INDEX `idx_label_cache_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `label_cache` ADD CONSTRAINT `label_cache_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `hpp_entries` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `hpp_entries` ADD INDEX `idx_hpp_entries_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `hpp_entries` ADD CONSTRAINT `hpp_entries_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `master_packing_cost_entries` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `master_packing_cost_entries` ADD INDEX `idx_master_packing_cost_entries_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `master_packing_cost_entries` ADD CONSTRAINT `master_packing_cost_entries_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `packing_cost_entries` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `packing_cost_entries` ADD INDEX `idx_packing_cost_entries_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `packing_cost_entries` ADD CONSTRAINT `packing_cost_entries_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `shopee_order_fees` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `shopee_order_fees` ADD INDEX `idx_shopee_order_fees_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `shopee_order_fees` ADD CONSTRAINT `shopee_order_fees_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `shopee_ads_daily_expense` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `shopee_ads_daily_expense` ADD INDEX `idx_shopee_ads_daily_expense_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `shopee_ads_daily_expense` ADD CONSTRAINT `shopee_ads_daily_expense_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `users` ADD INDEX `idx_users_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `auto_boost_config` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `auto_boost_config` ADD INDEX `idx_auto_boost_config_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `auto_boost_config` ADD CONSTRAINT `auto_boost_config_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `auto_boost_queue` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `auto_boost_queue` ADD INDEX `idx_auto_boost_queue_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `auto_boost_queue` ADD CONSTRAINT `auto_boost_queue_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `auto_boost_log` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `auto_boost_log` ADD INDEX `idx_auto_boost_log_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `auto_boost_log` ADD CONSTRAINT `auto_boost_log_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `master_products` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `master_products` DROP INDEX `master_products_sku_unique`;
--> statement-breakpoint
ALTER TABLE `master_products` ADD UNIQUE INDEX `uniq_master_products_company_sku` (`company_id`, `sku`);
--> statement-breakpoint
ALTER TABLE `master_products` ADD INDEX `idx_master_products_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `master_products` ADD CONSTRAINT `master_products_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `master_product_variants` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `master_product_variants` DROP INDEX `master_product_variants_sku_unique`;
--> statement-breakpoint
ALTER TABLE `master_product_variants` ADD UNIQUE INDEX `uniq_master_product_variants_company_sku` (`company_id`, `sku`);
--> statement-breakpoint
ALTER TABLE `master_product_variants` ADD INDEX `idx_master_product_variants_company` (`company_id`);
--> statement-breakpoint
ALTER TABLE `master_product_variants` ADD CONSTRAINT `master_product_variants_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
--> statement-breakpoint
ALTER TABLE `staff_permissions` ADD COLUMN `company_id` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `staff_permissions` DROP PRIMARY KEY;
--> statement-breakpoint
ALTER TABLE `staff_permissions` ADD PRIMARY KEY (`company_id`, `feature`);
--> statement-breakpoint
ALTER TABLE `staff_permissions` ADD CONSTRAINT `staff_permissions_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`);
