ALTER TABLE `label_cache` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `shopee_order_fees` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `shopee_order_items` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `label_cache` ADD CONSTRAINT `label_cache_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopee_order_fees` ADD CONSTRAINT `shopee_order_fees_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shopee_order_items` ADD CONSTRAINT `shopee_order_items_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_label_cache_company` ON `label_cache` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_shopee_order_fees_company` ON `shopee_order_fees` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_shopee_order_items_company` ON `shopee_order_items` (`company_id`);