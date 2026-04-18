ALTER TABLE `product_groups` ADD `shopee_item_id` varchar(64);--> statement-breakpoint
ALTER TABLE `product_groups` ADD CONSTRAINT `uniq_shopee_item_id` UNIQUE(`shopee_item_id`);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `uniq_shopee_model_id` UNIQUE(`shopee_model_id`);