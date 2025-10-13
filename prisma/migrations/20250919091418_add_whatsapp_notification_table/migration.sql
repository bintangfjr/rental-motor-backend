/*
  Warnings:

  - Added the required column `updated_at` to the `histories` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `histories` ADD COLUMN `updated_at` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `sewas` ADD COLUMN `status_notifikasi` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `whatsapp_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `target` VARCHAR(20) NOT NULL,
    `message` TEXT NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `response` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(255) NOT NULL,
    `value` TEXT NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `group` VARCHAR(50) NOT NULL,
    `description` VARCHAR(500) NULL,
    `is_encrypted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
