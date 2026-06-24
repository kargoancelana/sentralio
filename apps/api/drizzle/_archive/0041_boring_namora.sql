ALTER TABLE `auto_boost_config` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_boost_log` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_boost_queue` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_groups` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `shopee_ads_daily_expense` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `shopee_orders` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_state` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_boost_config` ADD CONSTRAINT `auto_boost_config_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auto_boost_log` ADD CONSTRAINT `auto_boost_log_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auto_boost_queue` ADD CONSTRAINT `auto_boost_queue_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_groups` ADD CONSTRAINT `product_groups_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopee_ads_daily_expense` ADD CONSTRAINT `shopee_ads_daily_expense_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopee_orders` ADD CONSTRAINT `shopee_orders_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_state` ADD CONSTRAINT `sync_state_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_auto_boost_config_company` ON `auto_boost_config` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_auto_boost_log_company` ON `auto_boost_log` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_auto_boost_queue_company` ON `auto_boost_queue` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_product_groups_company` ON `product_groups` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_products_company` ON `products` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_shopee_ads_daily_expense_company` ON `shopee_ads_daily_expense` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_shopee_orders_company` ON `shopee_orders` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_state_company` ON `sync_state` (`company_id`);