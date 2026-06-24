-- Add drc_adjustable_refund column to shopee_order_fees
-- Captures Shopee Dispute Resolution Center adjustable refunds (pengembalian dana ke buyer dari kantong seller)
ALTER TABLE shopee_order_fees
  ADD COLUMN drc_adjustable_refund INT NOT NULL DEFAULT 0;
