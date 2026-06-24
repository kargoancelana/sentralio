-- 0046_user_username.sql
-- Fase 1.4: add username + username_lower to users (nullable) for
-- username-or-email login. The UNIQUE index enforces global uniqueness for
-- non-NULL usernames; MySQL allows multiple NULLs.
ALTER TABLE `users`
  ADD COLUMN `username` VARCHAR(32) NULL,
  ADD COLUMN `username_lower` VARCHAR(32) NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_users_username_lower` ON `users` (`username_lower`);
