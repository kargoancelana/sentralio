CREATE TABLE `coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`code_upper` varchar(64) NOT NULL,
	`type` enum('percent','fixed') NOT NULL,
	`value` int NOT NULL,
	`max_uses` int,
	`used_count` int NOT NULL DEFAULT 0,
	`valid_from` timestamp,
	`valid_until` timestamp,
	`plan_id` int,
	`is_active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_coupons_code_upper` UNIQUE(`code_upper`)
);
--> statement-breakpoint
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_coupons_plan` ON `coupons` (`plan_id`);