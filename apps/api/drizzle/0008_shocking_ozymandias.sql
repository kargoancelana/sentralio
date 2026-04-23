CREATE TABLE `shopee_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_sn` varchar(100) NOT NULL,
	`item_name` varchar(500) NOT NULL,
	`model_name` varchar(500),
	`qty` int NOT NULL DEFAULT 1,
	`item_price` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopee_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `shopee_orders` ADD `shipping_carrier` varchar(100);