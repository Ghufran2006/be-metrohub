-- Sesi JWT yang dapat dicabut. Baseline sepuluh tabel tidak diubah.
CREATE TABLE `core_sessions` (
    `id` CHAR(36) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `core_sessions_user_id_idx`(`user_id`),
    INDEX `core_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `core_sessions` ADD CONSTRAINT `core_sessions_user_id_fkey`
FOREIGN KEY (`user_id`) REFERENCES `core_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
