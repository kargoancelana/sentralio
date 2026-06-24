-- Add item_id and model_id columns to shopee_order_items for Product_Image_Resolution
ALTER TABLE `shopee_order_items` ADD COLUMN `item_id` varchar(64);
ALTER TABLE `shopee_order_items` ADD COLUMN `model_id` varchar(64);
CREATE INDEX `idx_order_items_lookup` ON `shopee_order_items` (`order_sn`, `item_id`, `model_id`);
