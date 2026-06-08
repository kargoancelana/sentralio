-- 0033_master_image_url.sql
-- Add a cover/thumbnail image URL to master_products, captured at import time
-- so the Master Produk thumbnail is stable and correct (independent of which
-- linked group happens to sort first).
ALTER TABLE `master_products`
  ADD COLUMN `image_url` VARCHAR(500) NULL;
