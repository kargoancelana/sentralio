CREATE TABLE `shopee_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shop_id` int NOT NULL,
	`order_sn` varchar(100) NOT NULL,
	`order_status` varchar(50) NOT NULL,
	`total_amount` int NOT NULL DEFAULT 0,
	`buyer_username` varchar(255),
	`pay_time` timestamp,
	`create_time` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopee_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `shopee_orders_order_sn_unique` UNIQUE(`order_sn`),
	CONSTRAINT `uniq_order_sn` UNIQUE(`order_sn`)
);
--> statement-breakpoint
ALTER TABLE `shopee_credentials` MODIFY COLUMN `access_token` text NOT NULL;--> statement-breakpoint
ALTER TABLE `shopee_credentials` MODIFY COLUMN `refresh_token` text NOT NULL;