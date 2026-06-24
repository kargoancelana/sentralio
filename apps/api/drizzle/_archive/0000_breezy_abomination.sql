CREATE TABLE `product_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`group_id` int NOT NULL,
	`shopee_item_id` varchar(64) NOT NULL,
	`shopee_model_id` varchar(64) NOT NULL,
	`stock` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_group_id_product_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `product_groups`(`id`) ON DELETE cascade ON UPDATE no action;