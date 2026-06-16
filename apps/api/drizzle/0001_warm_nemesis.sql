CREATE TABLE `staff_permissions` (
	`feature` varchar(64) NOT NULL,
	`enabled` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_permissions_feature` PRIMARY KEY(`feature`)
);
--> statement-breakpoint
ALTER TABLE `revoked_sessions` DROP FOREIGN KEY `fk_revoked_user`;
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `master_products` ADD `image_url` varchar(500);--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD `status` varchar(20) DEFAULT 'connected' NOT NULL;--> statement-breakpoint
ALTER TABLE `shopee_order_fees` ADD `final_shipping_fee` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shopee_orders` ADD `ship_by_date` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `tokens_valid_from` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shopee_order_items` ADD CONSTRAINT `uniq_order_item_model` UNIQUE(`order_sn`,`item_id`,`model_id`);--> statement-breakpoint
ALTER TABLE `revoked_sessions` ADD CONSTRAINT `revoked_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `stock`;