ALTER TABLE `master_product_variants` DROP INDEX `master_product_variants_sku_unique`;--> statement-breakpoint
ALTER TABLE `master_products` DROP INDEX `master_products_sku_unique`;--> statement-breakpoint
ALTER TABLE `hpp_entries` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `master_packing_cost_entries` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `master_product_variants` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `master_products` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `packing_cost_entries` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `master_product_variants` ADD CONSTRAINT `uniq_master_product_variants_company_sku` UNIQUE(`company_id`,`sku`);--> statement-breakpoint
ALTER TABLE `master_products` ADD CONSTRAINT `uniq_master_products_company_sku` UNIQUE(`company_id`,`sku`);--> statement-breakpoint
ALTER TABLE `hpp_entries` ADD CONSTRAINT `hpp_entries_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_packing_cost_entries` ADD CONSTRAINT `master_packing_cost_entries_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_product_variants` ADD CONSTRAINT `master_product_variants_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_products` ADD CONSTRAINT `master_products_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packing_cost_entries` ADD CONSTRAINT `packing_cost_entries_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_hpp_entries_company` ON `hpp_entries` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_master_packing_cost_entries_company` ON `master_packing_cost_entries` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_master_product_variants_company` ON `master_product_variants` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_master_products_company` ON `master_products` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_packing_cost_entries_company` ON `packing_cost_entries` (`company_id`);