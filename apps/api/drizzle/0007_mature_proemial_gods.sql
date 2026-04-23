ALTER TABLE `product_groups` DROP INDEX `uniq_shopee_item_id`;--> statement-breakpoint
ALTER TABLE `products` DROP INDEX `uniq_shopee_model_id`;--> statement-breakpoint
ALTER TABLE `product_groups` ADD `shop_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `shop_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `product_groups` ADD CONSTRAINT `uniq_shopee_item_id` UNIQUE(`shop_id`,`shopee_item_id`);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `uniq_shopee_model_id` UNIQUE(`shop_id`,`shopee_model_id`);