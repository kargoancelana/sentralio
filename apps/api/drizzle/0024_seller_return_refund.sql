-- Rename drc_adjustable_refund column to seller_return_refund.
-- Shopee Excel "Jumlah Pengembalian Dana ke Pembeli" maps to
-- order_income.seller_return_refund, not drc_adjustable_refund.
ALTER TABLE shopee_order_fees
  CHANGE COLUMN drc_adjustable_refund seller_return_refund INT NOT NULL DEFAULT 0;
