-- CreateTable
CREATE TABLE `admins` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_lengkap` VARCHAR(255) NOT NULL,
    `username` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `is_super_admin` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admins_username_key`(`username`),
    UNIQUE INDEX `admins_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `motors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `plat_nomor` VARCHAR(20) NOT NULL,
    `merk` VARCHAR(255) NOT NULL,
    `model` VARCHAR(255) NOT NULL,
    `tahun` INTEGER NOT NULL,
    `harga` INTEGER NOT NULL,
    `no_gsm` VARCHAR(20) NULL,
    `imei` VARCHAR(20) NULL,
    `status` VARCHAR(20) NOT NULL,
    `device_id` VARCHAR(255) NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `last_update` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `motors_plat_nomor_key`(`plat_nomor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sewas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `motor_id` INTEGER NOT NULL,
    `penyewa_id` INTEGER NOT NULL,
    `admin_id` INTEGER NOT NULL,
    `tgl_mulai` DATETIME(3) NOT NULL,
    `tgl_selesai` DATETIME(3) NOT NULL,
    `harga_sewa` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `jaminan` VARCHAR(255) NULL,
    `pembayaran` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `penyewas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(255) NOT NULL,
    `no_hp` VARCHAR(20) NOT NULL,
    `alamat` VARCHAR(500) NULL,
    `foto` VARCHAR(255) NULL,
    `blacklist` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sewas` ADD CONSTRAINT `sewas_motor_id_fkey` FOREIGN KEY (`motor_id`) REFERENCES `motors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sewas` ADD CONSTRAINT `sewas_penyewa_id_fkey` FOREIGN KEY (`penyewa_id`) REFERENCES `penyewas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sewas` ADD CONSTRAINT `sewas_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
