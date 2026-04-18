CREATE TABLE `shopee_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`partner_id` int NOT NULL,
	`partner_key` varchar(255) NOT NULL,
	`shop_id` int NOT NULL,
	`access_token` varchar(255) NOT NULL,
	`refresh_token` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopee_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `product_groups` ADD `stock` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `sync_status` varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `last_error` text;