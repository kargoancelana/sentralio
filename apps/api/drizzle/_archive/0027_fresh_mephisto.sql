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
CREATE TABLE `hpp_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
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
	`order_sn` varchar(100) NOT NULL,
	`label_url` text NOT NULL,
	`format` varchar(10) NOT NULL DEFAULT 'pdf',
	`tracking_number` varchar(100),
	`label_data_json` text,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `label_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `label_cache_order_sn_unique` UNIQUE(`order_sn`),
	CONSTRAINT `uniq_label_order_sn` UNIQUE(`order_sn`)
);
--> statement-breakpoint
CREATE TABLE `packing_cost_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
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
CREATE TABLE `shopee_ads_daily_expense` (
	`shop_id` bigint NOT NULL,
	`date` date NOT NULL,
	`expense` int NOT NULL DEFAULT 0,
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopee_ads_daily_expense_shop_id_date_pk` PRIMARY KEY(`shop_id`,`date`)
);
--> statement-breakpoint
CREATE TABLE `shopee_order_fees` (
	`id` int AUTO_INCREMENT NOT NULL,
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
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopee_order_fees_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_fee_order_sn` UNIQUE(`order_sn`)
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` int AUTO_INCREMENT NOT NULL,
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
ALTER TABLE `master_packing_cost_entries` DROP FOREIGN KEY `master_packing_cost_master_product_id_fk`;
--> statement-breakpoint
ALTER TABLE `master_packing_cost_entries` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `master_packing_cost_entries` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `shopee_order_items` ADD `model_sku` varchar(100);--> statement-breakpoint
ALTER TABLE `shopee_order_items` ADD `item_id` varchar(64);--> statement-breakpoint
ALTER TABLE `shopee_order_items` ADD `model_id` varchar(64);--> statement-breakpoint
ALTER TABLE `shopee_orders` ADD `label_printed` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shopee_orders` ADD `label_printed_at` timestamp;--> statement-breakpoint
ALTER TABLE `shopee_orders` ADD `escrow_release_time` timestamp;--> statement-breakpoint
ALTER TABLE `hpp_entries` ADD CONSTRAINT `hpp_entries_variant_id_master_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `master_product_variants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packing_cost_entries` ADD CONSTRAINT `packing_cost_entries_product_group_id_product_groups_id_fk` FOREIGN KEY (`product_group_id`) REFERENCES `product_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `cost_audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_hpp_variant` ON `hpp_entries` (`variant_id`);--> statement-breakpoint
CREATE INDEX `idx_hpp_variant_period` ON `hpp_entries` (`variant_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_packing_product_group` ON `packing_cost_entries` (`product_group_id`);--> statement-breakpoint
CREATE INDEX `idx_packing_product_group_period` ON `packing_cost_entries` (`product_group_id`,`start_date`,`end_date`);--> statement-breakpoint
ALTER TABLE `master_packing_cost_entries` ADD CONSTRAINT `master_packing_cost_entries_master_product_id_master_products_id_fk` FOREIGN KEY (`master_product_id`) REFERENCES `master_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_order_items_lookup` ON `shopee_order_items` (`order_sn`,`item_id`,`model_id`);--> statement-breakpoint
CREATE INDEX `idx_escrow_release_time` ON `shopee_orders` (`escrow_release_time`);