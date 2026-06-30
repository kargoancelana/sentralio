CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actor_type` enum('platform','company') NOT NULL,
	`actor_id` int,
	`company_id` int,
	`action` varchar(100) NOT NULL,
	`target_type` varchar(50),
	`target_id` varchar(64),
	`before_json` text,
	`after_json` text,
	`ip` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `audit_company_idx` ON `audit_log` (`company_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_log` (`created_at`);