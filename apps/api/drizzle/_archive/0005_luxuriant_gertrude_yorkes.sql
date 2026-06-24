ALTER TABLE `product_groups` ADD `description` text;--> statement-breakpoint
ALTER TABLE `product_groups` ADD `item_sku` varchar(100);--> statement-breakpoint
ALTER TABLE `product_groups` ADD `category_id` int;--> statement-breakpoint
ALTER TABLE `product_groups` ADD `item_status` varchar(50) DEFAULT 'NORMAL';--> statement-breakpoint
ALTER TABLE `product_groups` ADD `image_url` varchar(500);--> statement-breakpoint
ALTER TABLE `product_groups` ADD `last_sync` timestamp;--> statement-breakpoint
ALTER TABLE `products` ADD `model_name` varchar(255);--> statement-breakpoint
ALTER TABLE `products` ADD `model_sku` varchar(100);--> statement-breakpoint
ALTER TABLE `products` ADD `price` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `products` ADD `shopee_stock` int DEFAULT 0;