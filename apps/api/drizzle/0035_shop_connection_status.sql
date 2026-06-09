-- 0035_shop_connection_status.sql
-- Soft-disconnect support: a shop can be 'disconnected' without deleting its
-- credentials row. While disconnected, the app hides all of that shop's data
-- (orders, products, reports) and skips it during sync. Reconnecting (OAuth
-- re-auth) flips this back to 'connected' and restores everything.
ALTER TABLE `shopee_credentials`
  ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'connected';
