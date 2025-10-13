-- DropForeignKey
ALTER TABLE `histories` DROP FOREIGN KEY `histories_sewa_id_fkey`;

-- DropForeignKey
ALTER TABLE `sewas` DROP FOREIGN KEY `sewas_admin_id_fkey`;

-- DropForeignKey
ALTER TABLE `sewas` DROP FOREIGN KEY `sewas_motor_id_fkey`;

-- DropForeignKey
ALTER TABLE `sewas` DROP FOREIGN KEY `sewas_penyewa_id_fkey`;

-- AddForeignKey
ALTER TABLE `sewas` ADD CONSTRAINT `fk_sewa_motor` FOREIGN KEY (`motor_id`) REFERENCES `motors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sewas` ADD CONSTRAINT `fk_sewa_penyewa` FOREIGN KEY (`penyewa_id`) REFERENCES `penyewas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sewas` ADD CONSTRAINT `fk_sewa_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `histories` ADD CONSTRAINT `fk_history_sewa` FOREIGN KEY (`sewa_id`) REFERENCES `sewas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
