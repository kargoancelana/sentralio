CREATE TABLE `auto_boost_config` (
	`shop_id` bigint NOT NULL,
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
	`shop_id` bigint NOT NULL,
	`shopee_item_id` bigint NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`enabled` int NOT NULL DEFAULT 1,
	`last_boosted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auto_boost_queue_id` PRIMARY KEY(`id`)
);