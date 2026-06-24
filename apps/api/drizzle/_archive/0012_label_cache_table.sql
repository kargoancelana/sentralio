-- Create label_cache table for persistent label URL storage
CREATE TABLE `label_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_sn` varchar(100) NOT NULL,
	`label_url` varchar(1000) NOT NULL,
	`format` varchar(10) NOT NULL DEFAULT 'pdf',
	`tracking_number` varchar(100),
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `label_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_label_order_sn` UNIQUE(`order_sn`)
);
