-- 0030_user_auth.sql
CREATE TABLE `users` (
  `id`            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `email`         VARCHAR(254) NOT NULL,
  `email_lower`   VARCHAR(254) NOT NULL,
  `name`          VARCHAR(100) NOT NULL,
  `role`          ENUM('admin','staff') NOT NULL,
  `password_hash` VARCHAR(100) NOT NULL,
  `is_active`     INT NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `uniq_users_email_lower` UNIQUE (`email_lower`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `failed_login_attempts` (
  `id`           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `email_lower`  VARCHAR(254) NOT NULL,
  `ip`           VARCHAR(45) NOT NULL,
  `attempted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_failed_email_time` (`email_lower`, `attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `account_lockouts` (
  `email_lower`  VARCHAR(254) NOT NULL PRIMARY KEY,
  `locked_until` TIMESTAMP NOT NULL,
  `locked_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `revoked_sessions` (
  `jti`        VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id`    INT NOT NULL,
  `revoked_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` TIMESTAMP NOT NULL,
  KEY `idx_revoked_expires` (`expires_at`),
  CONSTRAINT `fk_revoked_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
