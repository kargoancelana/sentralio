ALTER TABLE `shopee_credentials` ADD `shop_name` varchar(255);--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD CONSTRAINT `uniq_shop_id` UNIQUE(`shop_id`);