-- AlterTable
ALTER TABLE `histories` ADD COLUMN `keterlambatan_menit` INTEGER NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `motors` ALTER COLUMN `status` DROP DEFAULT;

-- AlterTable
ALTER TABLE `sewas` ADD COLUMN `satuan_durasi` VARCHAR(20) NOT NULL DEFAULT 'hari';
