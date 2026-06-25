-- Data repair: heal shopee_orders rows that were inserted without company_id
-- (defaulted to 1) by syncing company_id from shopee_credentials.
-- Safe to run multiple times (idempotent — only updates rows where mismatch).
UPDATE `shopee_orders` o
  JOIN `shopee_credentials` c ON o.shop_id = c.shop_id
SET o.company_id = c.company_id
WHERE o.company_id <> c.company_id;

-- Same repair for shopee_order_items (joined via shopee_orders).
UPDATE `shopee_order_items` oi
  JOIN `shopee_orders` o ON oi.order_sn = o.order_sn
SET oi.company_id = o.company_id
WHERE oi.company_id <> o.company_id;
