-- 0031_user_tokens_valid_from.sql
-- Adds tokens_valid_from to users for password-change session revocation.
-- Stored as unix seconds (BIGINT) to avoid TIMESTAMP timezone round-trip issues.
ALTER TABLE `users`
  ADD COLUMN `tokens_valid_from` BIGINT NOT NULL DEFAULT 0;
