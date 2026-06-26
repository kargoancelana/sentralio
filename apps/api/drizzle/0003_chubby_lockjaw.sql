CREATE TABLE `subscription_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`plan_id` int NOT NULL,
	`coupon_id` int,
	`amount` int NOT NULL DEFAULT 0,
	`proof_key` varchar(500),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewed_by` int,
	`reviewed_at` timestamp,
	`note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscription_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `subscription_orders` ADD CONSTRAINT `subscription_orders_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_orders` ADD CONSTRAINT `subscription_orders_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_orders` ADD CONSTRAINT `subscription_orders_reviewed_by_platform_admins_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `platform_admins`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_subscription_orders_company` ON `subscription_orders` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_subscription_orders_status` ON `subscription_orders` (`status`);--> statement-breakpoint
CREATE INDEX `idx_subscription_orders_company_status` ON `subscription_orders` (`company_id`,`status`);