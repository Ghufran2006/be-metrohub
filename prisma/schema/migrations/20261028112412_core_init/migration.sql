-- CreateTable
CREATE TABLE `core_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `core_roles_nama_key`(`nama`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_role_permissions` (
    `role_id` INTEGER NOT NULL,
    `permission` VARCHAR(60) NOT NULL,

    PRIMARY KEY (`role_id`, `permission`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role_id` INTEGER NOT NULL,
    `aktif` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `core_users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_office_settings` (
    `id` INTEGER NOT NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `radius_meter` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ku_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(100) NOT NULL,
    `jenis` ENUM('PEMASUKAN', 'PENGELUARAN') NOT NULL,
    `aktif` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `ku_categories_nama_jenis_key`(`nama`, `jenis`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ku_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tanggal` DATE NOT NULL,
    `jenis` ENUM('PEMASUKAN', 'PENGELUARAN') NOT NULL,
    `category_id` INTEGER NOT NULL,
    `nominal` DECIMAL(15, 2) NOT NULL,
    `keterangan` TEXT NULL,
    `dibuat_oleh` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `ku_transactions_tanggal_idx`(`tanggal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mg_interns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `asal_kampus` VARCHAR(150) NOT NULL,
    `tanggal_mulai` DATE NOT NULL,
    `tanggal_selesai` DATE NOT NULL,
    `status_kerja` ENUM('ONSITE', 'REMOTE') NOT NULL DEFAULT 'ONSITE',

    UNIQUE INDEX `mg_interns_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mg_attendances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `intern_id` INTEGER NOT NULL,
    `tanggal` DATE NOT NULL,
    `jam_checkin` DATETIME(3) NOT NULL,
    `foto_checkin` VARCHAR(255) NOT NULL,
    `lat_checkin` DECIMAL(10, 7) NOT NULL,
    `lng_checkin` DECIMAL(10, 7) NOT NULL,
    `jarak_checkin_meter` INTEGER NULL,
    `jam_checkout` DATETIME(3) NULL,
    `foto_checkout` VARCHAR(255) NULL,
    `lat_checkout` DECIMAL(10, 7) NULL,
    `lng_checkout` DECIMAL(10, 7) NULL,
    `jarak_checkout_meter` INTEGER NULL,
    `keterangan_koreksi` TEXT NULL,
    `dikoreksi_oleh` INTEGER NULL,

    UNIQUE INDEX `mg_attendances_intern_id_tanggal_key`(`intern_id`, `tanggal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mg_logbooks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `intern_id` INTEGER NOT NULL,
    `tanggal` DATE NOT NULL,
    `isi` TEXT NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mg_logbooks_intern_id_tanggal_key`(`intern_id`, `tanggal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mg_tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `intern_id` INTEGER NOT NULL,
    `judul` VARCHAR(150) NOT NULL,
    `deskripsi` TEXT NOT NULL,
    `tenggat` DATE NOT NULL,
    `status` ENUM('BELUM_DIKERJAKAN', 'DIKERJAKAN', 'SELESAI') NOT NULL DEFAULT 'BELUM_DIKERJAKAN',
    `catatan_progres` TEXT NULL,
    `dibuat_oleh` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `core_role_permissions` ADD CONSTRAINT `core_role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `core_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_users` ADD CONSTRAINT `core_users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `core_roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ku_transactions` ADD CONSTRAINT `ku_transactions_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `ku_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mg_interns` ADD CONSTRAINT `mg_interns_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `core_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mg_attendances` ADD CONSTRAINT `mg_attendances_intern_id_fkey` FOREIGN KEY (`intern_id`) REFERENCES `mg_interns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mg_logbooks` ADD CONSTRAINT `mg_logbooks_intern_id_fkey` FOREIGN KEY (`intern_id`) REFERENCES `mg_interns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mg_tasks` ADD CONSTRAINT `mg_tasks_intern_id_fkey` FOREIGN KEY (`intern_id`) REFERENCES `mg_interns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
