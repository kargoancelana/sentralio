CREATE TABLE IF NOT EXISTS `shopee_ads_daily_expense` (
  `shop_id` bigint NOT NULL,
  `date` date NOT NULL,
  `expense` int NOT NULL DEFAULT 0,
  `fetched_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `shopee_ads_daily_expense_shop_id_date_pk` PRIMARY KEY(`shop_id`, `date`)
);
