ALTER TABLE `shopee_credentials` ADD `initial_sync_status` varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD `initial_sync_step` varchar(40);--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD `initial_sync_error` text;--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD `initial_sync_started_at` timestamp;--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD `initial_sync_at` timestamp;--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD `disconnected_at` timestamp;--> statement-breakpoint
UPDATE shopee_credentials
SET initial_sync_status = 'completed', initial_sync_at = NOW()
WHERE status = 'connected';