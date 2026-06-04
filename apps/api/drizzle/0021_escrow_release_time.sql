ALTER TABLE `shopee_orders` ADD COLUMN `escrow_release_time` timestamp NULL;
CREATE INDEX `idx_escrow_release_time` ON `shopee_orders` (`escrow_release_time`);
