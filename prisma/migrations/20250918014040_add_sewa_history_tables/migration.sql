/*
  Warnings:

  - You are about to drop the column `blacklist` on the `penyewas` table. All the data in the column will be lost.
  - You are about to drop the column `foto` on the `penyewas` table. All the data in the column will be lost.
  - You are about to drop the column `no_hp` on the `penyewas` table. All the data in the column will be lost.
  - You are about to drop the column `harga_sewa` on the `sewas` table. All the data in the column will be lost.
  - You are about to drop the column `tgl_mulai` on the `sewas` table. All the data in the column will be lost.
  - You are about to drop the column `tgl_selesai` on the `sewas` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[no_whatsapp]` on the table `penyewas` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `no_whatsapp` to the `penyewas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `durasi_sewa` to the `sewas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tgl_kembali` to the `sewas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tgl_sewa` to the `sewas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total_harga` to the `sewas` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `motors` MODIFY `status` VARCHAR(20) NOT NULL DEFAULT 'tersedia';

-- AlterTable
ALTER TABLE `penyewas` DROP COLUMN `blacklist`,
    DROP COLUMN `foto`,
    DROP COLUMN `no_hp`,
    ADD COLUMN `foto_ktp` VARCHAR(255) NULL,
    ADD COLUMN `is_blacklisted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `no_whatsapp` VARCHAR(20) NOT NULL,
    MODIFY `alamat` TEXT NULL;

-- AlterTable
ALTER TABLE `sewas` DROP COLUMN `harga_sewa`,
    DROP COLUMN `tgl_mulai`,
    DROP COLUMN `tgl_selesai`,
    ADD COLUMN `durasi_sewa` INTEGER NOT NULL,
    ADD COLUMN `tgl_kembali` DATETIME(3) NOT NULL,
    ADD COLUMN `tgl_sewa` DATETIME(3) NOT NULL,
    ADD COLUMN `total_harga` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `histories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sewa_id` INTEGER NOT NULL,
    `tgl_selesai` DATETIME(3) NOT NULL,
    `status_selesai` VARCHAR(20) NOT NULL,
    `harga` INTEGER NOT NULL,
    `denda` INTEGER NOT NULL,
    `catatan` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `penyewas_no_whatsapp_key` ON `penyewas`(`no_whatsapp`);

-- AddForeignKey
ALTER TABLE `histories` ADD CONSTRAINT `histories_sewa_id_fkey` FOREIGN KEY (`sewa_id`) REFERENCES `sewas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
