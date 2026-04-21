CREATE TABLE `master_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sku` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`stock` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `master_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `master_products_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `master_product_id` int;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_master_product_id_master_products_id_fk` FOREIGN KEY (`master_product_id`) REFERENCES `master_products`(`id`) ON DELETE no action ON UPDATE no action;