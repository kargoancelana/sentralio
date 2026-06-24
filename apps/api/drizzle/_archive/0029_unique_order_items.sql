-- Prevent duplicate (order_sn, item_id, model_id) rows in shopee_order_items.
-- Ensures DB-level integrity and makes ER_DUP_ENTRY catches in escrow-sync
-- and order-sync race-safe. NULL handling: MySQL treats NULLs as distinct in
-- UNIQUE indexes, so legacy rows with NULL item_id/model_id are unaffected.
ALTER TABLE `shopee_order_items`
  ADD CONSTRAINT `uniq_order_item_model`
  UNIQUE (`order_sn`, `item_id`, `model_id`);
