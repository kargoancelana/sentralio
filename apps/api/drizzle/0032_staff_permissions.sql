-- 0032_staff_permissions.sql
-- Configurable per-feature access for the `staff` role.
-- Admin always has full access and is not represented here.
CREATE TABLE IF NOT EXISTS `staff_permissions` (
  `feature` VARCHAR(64) NOT NULL,
  `enabled` INT NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `staff_permissions_feature` PRIMARY KEY(`feature`)
);

-- Seed defaults matching the previous hardcoded matrix for staff:
--   orders = on, cetak_label = on; everything else configurable defaults off.
INSERT INTO `staff_permissions` (`feature`, `enabled`) VALUES
  ('orders', 1),
  ('cetak_label', 1),
  ('master_produk', 0),
  ('produk_channel', 0),
  ('laporan_keuangan', 0)
ON DUPLICATE KEY UPDATE `feature` = `feature`;
