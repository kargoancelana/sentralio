-- 0034_order_ship_by_date.sql
-- Capture Shopee's ship-by deadline so the app can detect "tertunda" (held)
-- orders. Shopee reports held orders with order_status = READY_TO_SHIP but
-- ship_by_date = 0 (the seller cannot arrange shipment yet, typically during
-- peak-promo windows). A non-zero value means the order is genuinely shippable.
ALTER TABLE `shopee_orders`
  ADD COLUMN `ship_by_date` INT NOT NULL DEFAULT 0;
