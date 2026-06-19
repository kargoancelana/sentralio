ALTER TABLE `staff_permissions` ADD `company_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `staff_permissions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `staff_permissions` ADD PRIMARY KEY(`company_id`,`feature`);--> statement-breakpoint
ALTER TABLE `staff_permissions` ADD CONSTRAINT `staff_permissions_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;