ALTER TABLE `shopee_credentials` ADD `active_shop_id` int;--> statement-breakpoint
-- Backfill: tandai koneksi yang SEKARANG aktif. WAJIB sebelum bikin uniq_active_shop.
UPDATE `shopee_credentials` SET `active_shop_id` = `shop_id` WHERE `status` = 'connected';--> statement-breakpoint
DROP INDEX `uniq_shop_id` ON `shopee_credentials`;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_company_shop` ON `shopee_credentials` (`company_id`,`shop_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_active_shop` ON `shopee_credentials` (`active_shop_id`);