-- Create hpp_entries table for HPP (Harga Pokok Penjualan) per variant with effective periods
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
ALTER TABLE `hpp_entries` ADD CONSTRAINT `hpp_entries_variant_id_master_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `master_product_variants`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `idx_hpp_variant` ON `hpp_entries` (`variant_id`);
--> statement-breakpoint
CREATE INDEX `idx_hpp_variant_period` ON `hpp_entries` (`variant_id`,`start_date`,`end_date`);
--> statement-breakpoint
-- Create packing_cost_entries table for Biaya Packing per product group with effective periods
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
ALTER TABLE `packing_cost_entries` ADD CONSTRAINT `packing_cost_entries_product_group_id_product_groups_id_fk` FOREIGN KEY (`product_group_id`) REFERENCES `product_groups`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `idx_packing_product_group` ON `packing_cost_entries` (`product_group_id`);
--> statement-breakpoint
CREATE INDEX `idx_packing_product_group_period` ON `packing_cost_entries` (`product_group_id`,`start_date`,`end_date`);
--> statement-breakpoint
-- Create cost_audit_log table for audit trail of HPP and Biaya Packing changes
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
CREATE INDEX `idx_audit_entity` ON `cost_audit_log` (`entity_type`,`entity_id`);
