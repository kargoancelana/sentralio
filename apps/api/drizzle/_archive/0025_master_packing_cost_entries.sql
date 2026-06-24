CREATE TABLE IF NOT EXISTS `master_packing_cost_entries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `master_product_id` int NOT NULL,
  `packing_cost` int NOT NULL,
  `start_date` varchar(10) NOT NULL,
  `end_date` varchar(10),
  `note` varchar(255),
  `auto_closed_by` int,
  `deleted_at` timestamp,
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT `master_packing_cost_entries_id` PRIMARY KEY(`id`),
  CONSTRAINT `master_packing_cost_master_product_id_fk`
    FOREIGN KEY (`master_product_id`) REFERENCES `master_products`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_master_packing_master_product`
  ON `master_packing_cost_entries` (`master_product_id`);

CREATE INDEX `idx_master_packing_period`
  ON `master_packing_cost_entries` (`master_product_id`, `start_date`, `end_date`);
