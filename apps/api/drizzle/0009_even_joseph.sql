CREATE TABLE `master_product_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`master_product_id` int NOT NULL,
	`sku` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`stock` int NOT NULL DEFAULT 0,
	CONSTRAINT `master_product_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `master_product_variants_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
ALTER TABLE `master_product_variants` ADD CONSTRAINT `master_product_variants_master_product_id_master_products_id_fk` FOREIGN KEY (`master_product_id`) REFERENCES `master_products`(`id`) ON DELETE cascade ON UPDATE no action;