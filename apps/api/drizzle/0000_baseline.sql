CREATE TABLE `account_lockouts` (
	`email_lower` varchar(254) NOT NULL,
	`locked_until` timestamp NOT NULL,
	`locked_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `account_lockouts_email_lower` PRIMARY KEY(`email_lower`)
);
--> statement-breakpoint
CREATE TABLE `auto_boost_config` (
	`shop_id` bigint NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`enabled` int NOT NULL DEFAULT 0,
	`mode` varchar(16) NOT NULL DEFAULT 'rotation',
	`active_hour_start` int NOT NULL DEFAULT 0,
	`active_hour_end` int NOT NULL DEFAULT 23,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auto_boost_config_shop_id` PRIMARY KEY(`shop_id`)
);
--> statement-breakpoint
CREATE TABLE `auto_boost_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`shop_id` bigint NOT NULL,
	`shopee_item_id` bigint NOT NULL,
	`status` varchar(16) NOT NULL,
	`message` varchar(512),
	`boosted_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auto_boost_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auto_boost_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`shop_id` bigint NOT NULL,
	`shopee_item_id` bigint NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`enabled` int NOT NULL DEFAULT 1,
	`last_boosted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auto_boost_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`status` enum('pending','active','suspended','expired') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_companies_slug` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `cost_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity_type` varchar(20) NOT NULL,
	`entity_id` int NOT NULL,
	`action` varchar(10) NOT NULL,
	`previous_values` text,
	`new_values` text,
	`user_id` varchar(100) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cost_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `failed_login_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email_lower` varchar(254) NOT NULL,
	`ip` varchar(45) NOT NULL,
	`attempted_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `failed_login_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hpp_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`variant_id` int NOT NULL,
	`hpp_value` int NOT NULL,
	`start_date` varchar(10) NOT NULL,
	`end_date` varchar(10),
	`note` varchar(255),
	`deleted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hpp_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `label_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`order_sn` varchar(100) NOT NULL,
	`label_url` mediumtext NOT NULL,
	`format` varchar(10) NOT NULL DEFAULT 'pdf',
	`tracking_number` varchar(100),
	`label_data_json` mediumtext,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `label_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `label_cache_order_sn_unique` UNIQUE(`order_sn`),
	CONSTRAINT `uniq_label_order_sn` UNIQUE(`order_sn`)
);
--> statement-breakpoint
CREATE TABLE `master_packing_cost_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`master_product_id` int NOT NULL,
	`packing_cost` int NOT NULL,
	`start_date` varchar(10) NOT NULL,
	`end_date` varchar(10),
	`note` varchar(255),
	`auto_closed_by` int,
	`deleted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `master_packing_cost_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `master_product_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`master_product_id` int NOT NULL,
	`sku` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`stock` int NOT NULL DEFAULT 0,
	CONSTRAINT `master_product_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_master_product_variants_company_sku` UNIQUE(`company_id`,`sku`)
);
--> statement-breakpoint
CREATE TABLE `master_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`sku` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`stock` int NOT NULL DEFAULT 0,
	`image_url` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `master_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_master_products_company_sku` UNIQUE(`company_id`,`sku`)
);
--> statement-breakpoint
CREATE TABLE `packing_cost_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`product_group_id` int NOT NULL,
	`packing_cost` int NOT NULL,
	`start_date` varchar(10) NOT NULL,
	`end_date` varchar(10),
	`note` varchar(255),
	`auto_closed_by` int,
	`deleted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `packing_cost_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_by_admin_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_password_reset_token_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `platform_admins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(254) NOT NULL,
	`email_lower` varchar(254) NOT NULL,
	`name` varchar(100) NOT NULL,
	`password_hash` varchar(100) NOT NULL,
	`is_active` int NOT NULL DEFAULT 1,
	`tokens_valid_from` bigint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_admins_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_platform_admins_email_lower` UNIQUE(`email_lower`)
);
--> statement-breakpoint
CREATE TABLE `product_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`shop_id` int NOT NULL,
	`shopee_item_id` varchar(64),
	`name` varchar(255) NOT NULL,
	`description` text,
	`item_sku` varchar(100),
	`category_id` int,
	`item_status` varchar(50) DEFAULT 'NORMAL',
	`image_url` varchar(500),
	`stock` int NOT NULL DEFAULT 0,
	`last_sync` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_shopee_item_id` UNIQUE(`shop_id`,`shopee_item_id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`shop_id` int NOT NULL,
	`master_product_id` int,
	`group_id` int NOT NULL,
	`shopee_item_id` varchar(64) NOT NULL,
	`shopee_model_id` varchar(64) NOT NULL,
	`model_name` varchar(255),
	`model_sku` varchar(100),
	`price` int DEFAULT 0,
	`shopee_stock` int DEFAULT 0,
	`stock` int NOT NULL DEFAULT 0,
	`sync_status` varchar(20) NOT NULL DEFAULT 'pending',
	`last_error` text,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_shopee_model_id` UNIQUE(`shop_id`,`shopee_model_id`)
);
--> statement-breakpoint
CREATE TABLE `revoked_sessions` (
	`jti` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`revoked_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	CONSTRAINT `revoked_sessions_jti` PRIMARY KEY(`jti`)
);
--> statement-breakpoint
CREATE TABLE `shopee_ads_daily_expense` (
	`company_id` int NOT NULL DEFAULT 1,
	`shop_id` bigint NOT NULL,
	`date` date NOT NULL,
	`expense` int NOT NULL DEFAULT 0,
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopee_ads_daily_expense_shop_id_date_pk` PRIMARY KEY(`shop_id`,`date`)
);
--> statement-breakpoint
CREATE TABLE `shopee_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`partner_id` int NOT NULL,
	`partner_key` varchar(255) NOT NULL,
	`shop_id` int NOT NULL,
	`shop_name` varchar(255),
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` timestamp NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'connected',
	`initial_sync_status` varchar(20) NOT NULL DEFAULT 'pending',
	`initial_sync_step` varchar(40),
	`initial_sync_error` text,
	`initial_sync_started_at` timestamp,
	`initial_sync_at` timestamp,
	`disconnected_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopee_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_shop_id` UNIQUE(`shop_id`)
);
--> statement-breakpoint
CREATE TABLE `shopee_order_fees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`order_sn` varchar(100) NOT NULL,
	`commission_fee` int NOT NULL DEFAULT 0,
	`service_fee` int NOT NULL DEFAULT 0,
	`seller_order_processing_fee` int NOT NULL DEFAULT 0,
	`actual_shipping_fee` int NOT NULL DEFAULT 0,
	`shopee_shipping_rebate` int NOT NULL DEFAULT 0,
	`seller_voucher` int NOT NULL DEFAULT 0,
	`escrow_amount` int NOT NULL DEFAULT 0,
	`ams_commission_fee` int NOT NULL DEFAULT 0,
	`seller_return_refund` int NOT NULL DEFAULT 0,
	`final_shipping_fee` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopee_order_fees_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_fee_order_sn` UNIQUE(`order_sn`)
);
--> statement-breakpoint
CREATE TABLE `shopee_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`order_sn` varchar(100) NOT NULL,
	`item_name` varchar(500) NOT NULL,
	`model_name` varchar(500),
	`model_sku` varchar(100),
	`qty` int NOT NULL DEFAULT 1,
	`item_price` int NOT NULL DEFAULT 0,
	`item_id` varchar(64),
	`model_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopee_order_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_order_item_model` UNIQUE(`order_sn`,`item_id`,`model_id`)
);
--> statement-breakpoint
CREATE TABLE `shopee_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`shop_id` int NOT NULL,
	`order_sn` varchar(100) NOT NULL,
	`order_status` varchar(50) NOT NULL,
	`total_amount` int NOT NULL DEFAULT 0,
	`buyer_username` varchar(255),
	`shipping_carrier` varchar(100),
	`tracking_number` varchar(100),
	`ship_by_date` int NOT NULL DEFAULT 0,
	`label_printed` int NOT NULL DEFAULT 0,
	`label_printed_at` timestamp,
	`pay_time` timestamp,
	`create_time` timestamp NOT NULL,
	`escrow_release_time` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopee_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `shopee_orders_order_sn_unique` UNIQUE(`order_sn`),
	CONSTRAINT `uniq_order_sn` UNIQUE(`order_sn`)
);
--> statement-breakpoint
CREATE TABLE `staff_permissions` (
	`company_id` int NOT NULL DEFAULT 1,
	`feature` varchar(64) NOT NULL,
	`enabled` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_permissions_company_id_feature_pk` PRIMARY KEY(`company_id`,`feature`)
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`job_name` varchar(100) NOT NULL,
	`shop_id` int NOT NULL,
	`last_sync_time` timestamp NOT NULL,
	`last_sync_end_time` timestamp NOT NULL,
	`sync_in_progress` int NOT NULL DEFAULT 0,
	`total_synced` int NOT NULL DEFAULT 0,
	`errors` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_state_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_job_shop` UNIQUE(`job_name`,`shop_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL DEFAULT 1,
	`email` varchar(254) NOT NULL,
	`email_lower` varchar(254) NOT NULL,
	`username` varchar(32),
	`username_lower` varchar(32),
	`name` varchar(100) NOT NULL,
	`role` enum('admin','staff') NOT NULL,
	`password_hash` varchar(100) NOT NULL,
	`is_active` int NOT NULL DEFAULT 1,
	`tokens_valid_from` bigint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_users_email_lower` UNIQUE(`email_lower`),
	CONSTRAINT `uniq_users_username_lower` UNIQUE(`username_lower`)
);
--> statement-breakpoint
ALTER TABLE `auto_boost_config` ADD CONSTRAINT `auto_boost_config_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auto_boost_log` ADD CONSTRAINT `auto_boost_log_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auto_boost_queue` ADD CONSTRAINT `auto_boost_queue_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hpp_entries` ADD CONSTRAINT `hpp_entries_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hpp_entries` ADD CONSTRAINT `hpp_entries_variant_id_master_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `master_product_variants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `label_cache` ADD CONSTRAINT `label_cache_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_packing_cost_entries` ADD CONSTRAINT `master_packing_cost_entries_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_packing_cost_entries` ADD CONSTRAINT `master_packing_cost_entries_master_product_id_master_products_id_fk` FOREIGN KEY (`master_product_id`) REFERENCES `master_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_product_variants` ADD CONSTRAINT `master_product_variants_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_product_variants` ADD CONSTRAINT `master_product_variants_master_product_id_master_products_id_fk` FOREIGN KEY (`master_product_id`) REFERENCES `master_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_products` ADD CONSTRAINT `master_products_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packing_cost_entries` ADD CONSTRAINT `packing_cost_entries_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packing_cost_entries` ADD CONSTRAINT `packing_cost_entries_product_group_id_product_groups_id_fk` FOREIGN KEY (`product_group_id`) REFERENCES `product_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_groups` ADD CONSTRAINT `product_groups_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_master_product_id_master_products_id_fk` FOREIGN KEY (`master_product_id`) REFERENCES `master_products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_group_id_product_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `product_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `revoked_sessions` ADD CONSTRAINT `revoked_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopee_ads_daily_expense` ADD CONSTRAINT `shopee_ads_daily_expense_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD CONSTRAINT `shopee_credentials_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopee_order_fees` ADD CONSTRAINT `shopee_order_fees_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopee_order_items` ADD CONSTRAINT `shopee_order_items_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopee_orders` ADD CONSTRAINT `shopee_orders_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_permissions` ADD CONSTRAINT `staff_permissions_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_state` ADD CONSTRAINT `sync_state_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_auto_boost_config_company` ON `auto_boost_config` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_auto_boost_log_company` ON `auto_boost_log` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_auto_boost_queue_company` ON `auto_boost_queue` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `cost_audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_failed_email_time` ON `failed_login_attempts` (`email_lower`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `idx_hpp_variant` ON `hpp_entries` (`variant_id`);--> statement-breakpoint
CREATE INDEX `idx_hpp_variant_period` ON `hpp_entries` (`variant_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_hpp_entries_company` ON `hpp_entries` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_label_cache_company` ON `label_cache` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_master_packing_master_product` ON `master_packing_cost_entries` (`master_product_id`);--> statement-breakpoint
CREATE INDEX `idx_master_packing_period` ON `master_packing_cost_entries` (`master_product_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_master_packing_cost_entries_company` ON `master_packing_cost_entries` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_master_product_variants_company` ON `master_product_variants` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_master_products_company` ON `master_products` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_packing_product_group` ON `packing_cost_entries` (`product_group_id`);--> statement-breakpoint
CREATE INDEX `idx_packing_product_group_period` ON `packing_cost_entries` (`product_group_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_packing_cost_entries_company` ON `packing_cost_entries` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_user` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_product_groups_company` ON `product_groups` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_products_company` ON `products` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_revoked_expires` ON `revoked_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_shopee_ads_daily_expense_company` ON `shopee_ads_daily_expense` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_shopee_credentials_company` ON `shopee_credentials` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_shopee_order_fees_company` ON `shopee_order_fees` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_order_items_lookup` ON `shopee_order_items` (`order_sn`,`item_id`,`model_id`);--> statement-breakpoint
CREATE INDEX `idx_shopee_order_items_company` ON `shopee_order_items` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_escrow_release_time` ON `shopee_orders` (`escrow_release_time`);--> statement-breakpoint
CREATE INDEX `idx_shopee_orders_company` ON `shopee_orders` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_state_company` ON `sync_state` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_users_company` ON `users` (`company_id`);