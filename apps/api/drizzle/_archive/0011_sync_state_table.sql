-- Create sync_state table for background sync resilience
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
