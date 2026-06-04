-- Create shopee_order_fees table for storing Shopee fee breakdown per order (from escrow detail API)
CREATE TABLE `shopee_order_fees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_sn` varchar(100) NOT NULL,
	`commission_fee` int NOT NULL DEFAULT 0,
	`service_fee` int NOT NULL DEFAULT 0,
	`seller_order_processing_fee` int NOT NULL DEFAULT 0,
	`actual_shipping_fee` int NOT NULL DEFAULT 0,
	`shopee_shipping_rebate` int NOT NULL DEFAULT 0,
	`seller_voucher` int NOT NULL DEFAULT 0,
	`escrow_amount` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopee_order_fees_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_fee_order_sn` UNIQUE (`order_sn`)
);
