CREATE TABLE `platform_admins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(254) NOT NULL,
	`email_lower` varchar(254) NOT NULL,
	`name` varchar(100) NOT NULL,
	`password_hash` varchar(100) NOT NULL,
	`is_active` int NOT NULL DEFAULT 1,
	`tokens_valid_from` bigint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_admins_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_platform_admins_email_lower` UNIQUE(`email_lower`)
);
