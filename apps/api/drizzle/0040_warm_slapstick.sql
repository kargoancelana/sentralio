ALTER TABLE `shopee_credentials` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `shopee_credentials` ADD CONSTRAINT `shopee_credentials_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_shopee_credentials_company` ON `shopee_credentials` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_users_company` ON `users` (`company_id`);