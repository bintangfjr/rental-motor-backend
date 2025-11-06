/*
  Warnings:

  - Added the required column `admin_nama` to the `histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `durasi_sewa` to the `histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `motor_merk` to the `histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `motor_model` to the `histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `motor_plat` to the `histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `penyewa_nama` to the `histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `penyewa_whatsapp` to the `histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `satuan_durasi` to the `histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tahun_motor` to the `histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tgl_kembali` to the `histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tgl_sewa` to the `histories` table without a default value. This is not possible if the table is not empty.

*/

-- DropForeignKey
ALTER TABLE `sewas` DROP FOREIGN KEY `fk_sewa_admin`;

-- DropForeignKey
ALTER TABLE `sewas` DROP FOREIGN KEY `fk_sewa_motor`;

-- DropForeignKey
ALTER TABLE `sewas` DROP FOREIGN KEY `fk_sewa_penyewa`;

-- AlterTable
ALTER TABLE `histories` ADD COLUMN `additional_costs` LONGTEXT NULL,
    ADD COLUMN `admin_nama` VARCHAR(255) NOT NULL,
    ADD COLUMN `catatan_tambahan` TEXT NULL,
    ADD COLUMN `durasi_sewa` INTEGER NOT NULL,
    ADD COLUMN `jaminan` VARCHAR(255) NULL,
    ADD COLUMN `motor_merk` VARCHAR(255) NOT NULL,
    ADD COLUMN `motor_model` VARCHAR(255) NOT NULL,
    ADD COLUMN `motor_plat` VARCHAR(20) NOT NULL,
    ADD COLUMN `pembayaran` VARCHAR(50) NULL,
    ADD COLUMN `penyewa_nama` VARCHAR(255) NOT NULL,
    ADD COLUMN `penyewa_whatsapp` VARCHAR(20) NOT NULL,
    ADD COLUMN `satuan_durasi` VARCHAR(20) NOT NULL,
    ADD COLUMN `tahun_motor` INTEGER NOT NULL,
    ADD COLUMN `tgl_kembali` DATETIME(3) NOT NULL,
    ADD COLUMN `tgl_sewa` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `motors` ADD COLUMN `gps_status` ENUM('Online', 'Offline', 'NoImei', 'Error') NOT NULL DEFAULT 'NoImei',
    ADD COLUMN `last_known_address` TEXT NULL,
    ADD COLUMN `last_mileage_sync` DATETIME(3) NULL,
    ADD COLUMN `last_service_date` DATETIME(3) NULL,
    ADD COLUMN `service_notes` TEXT NULL,
    ADD COLUMN `service_technician` VARCHAR(255) NULL,
    ADD COLUMN `total_mileage` DECIMAL(10, 2) NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE `sewas` ADD COLUMN `additional_costs` LONGTEXT NULL,
    ADD COLUMN `catatan_tambahan` TEXT NULL;

-- AlterTable
ALTER TABLE `whatsapp_notifications` ADD COLUMN `sewa_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `service_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `motor_id` INTEGER NOT NULL,
    `status` ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `service_type` ENUM('rutin', 'berat', 'perbaikan', 'emergency') NOT NULL DEFAULT 'rutin',
    `service_date` DATETIME(3) NOT NULL,
    `estimated_completion` DATETIME(3) NULL,
    `actual_completion` DATETIME(3) NULL,
    `service_location` VARCHAR(255) NOT NULL,
    `service_technician` VARCHAR(255) NOT NULL,
    `parts` LONGTEXT NULL,
    `services` LONGTEXT NULL,
    `estimated_cost` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `actual_cost` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `notes` TEXT NULL,
    `service_notes` TEXT NULL,
    `mileage_at_service` DECIMAL(10, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `service_summary` TEXT NULL,

    INDEX `service_records_motor_id_idx`(`motor_id`),
    INDEX `service_records_status_idx`(`status`),
    INDEX `service_records_service_date_idx`(`service_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `motor_mileage_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `motor_id` INTEGER NOT NULL,
    `imei` VARCHAR(20) NOT NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `distance_km` DECIMAL(8, 2) NOT NULL,
    `run_time_seconds` INTEGER NOT NULL,
    `average_speed_kmh` DECIMAL(5, 2) NOT NULL,
    `period_date` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `motor_mileage_history_motor_id_period_date_idx`(`motor_id`, `period_date`),
    INDEX `motor_mileage_history_imei_start_time_end_time_idx`(`imei`, `start_time`, `end_time`),
    INDEX `motor_mileage_history_motor_period_idx`(`motor_id`, `period_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `motor_location_cache` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `motor_id` INTEGER NOT NULL,
    `imei` VARCHAR(20) NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `address` TEXT NULL,
    `speed` DECIMAL(5, 2) NULL DEFAULT 0.00,
    `direction` INTEGER NULL DEFAULT 0,
    `gps_time` DATETIME(3) NOT NULL,
    `location_type` VARCHAR(20) NOT NULL DEFAULT 'gps',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `motor_location_cache_motor_id_imei_idx`(`motor_id`, `imei`),
    INDEX `motor_location_cache_gps_time_idx`(`gps_time`),
    INDEX `motor_location_cache_motor_imei_idx`(`motor_id`, `imei`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `histories_motor_plat_idx` ON `histories`(`motor_plat`);

-- CreateIndex
CREATE INDEX `histories_penyewa_nama_idx` ON `histories`(`penyewa_nama`);

-- CreateIndex
CREATE INDEX `histories_tgl_selesai_idx` ON `histories`(`tgl_selesai`);

-- CreateIndex
CREATE INDEX `fk_whatsapp_notifications_sewa` ON `whatsapp_notifications`(`sewa_id`);

-- AddForeignKey
ALTER TABLE `sewas` ADD CONSTRAINT `sewas_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sewas` ADD CONSTRAINT `sewas_motor_id_fkey` FOREIGN KEY (`motor_id`) REFERENCES `motors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sewas` ADD CONSTRAINT `sewas_penyewa_id_fkey` FOREIGN KEY (`penyewa_id`) REFERENCES `penyewas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_notifications` ADD CONSTRAINT `fk_whatsapp_notifications_sewa` FOREIGN KEY (`sewa_id`) REFERENCES `sewas`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `service_records` ADD CONSTRAINT `service_records_motor_id_fkey` FOREIGN KEY (`motor_id`) REFERENCES `motors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `motor_mileage_history` ADD CONSTRAINT `motor_mileage_history_motor_id_fkey` FOREIGN KEY (`motor_id`) REFERENCES `motors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `motor_location_cache` ADD CONSTRAINT `motor_location_cache_motor_id_fkey` FOREIGN KEY (`motor_id`) REFERENCES `motors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RedefineIndex
CREATE INDEX `histories_sewa_id_idx` ON `histories`(`sewa_id`);
DROP INDEX `fk_history_sewa` ON `histories`;

-- RedefineIndex
CREATE INDEX `sewas_admin_id_fkey` ON `sewas`(`admin_id`);
DROP INDEX `fk_sewa_admin` ON `sewas`;

-- RedefineIndex
CREATE INDEX `sewas_motor_id_fkey` ON `sewas`(`motor_id`);
DROP INDEX `fk_sewa_motor` ON `sewas`;

-- RedefineIndex
CREATE INDEX `sewas_penyewa_id_fkey` ON `sewas`(`penyewa_id`);
DROP INDEX `fk_sewa_penyewa` ON `sewas`;
