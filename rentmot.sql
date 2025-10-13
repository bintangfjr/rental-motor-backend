-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 13, 2025 at 11:43 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `rentmot`
--

-- --------------------------------------------------------

--
-- Table structure for table `admins`
--

CREATE TABLE `admins` (
  `id` int(11) NOT NULL,
  `nama_lengkap` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `is_super_admin` tinyint(1) NOT NULL DEFAULT 0,
  `deleted_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `admins`
--

INSERT INTO `admins` (`id`, `nama_lengkap`, `username`, `email`, `password`, `is_super_admin`, `deleted_at`, `created_at`, `updated_at`) VALUES
(2, 'Bintang Fajar Ardiansyah', 'Bintangfjr', 'superadmin@example.com', '$2b$10$cv1Z13FKkP2XgZPf./Ke/Otyio.AwGin5QdZpGBsOPK07FuTLyvHC', 1, NULL, '2025-10-01 05:11:16.886', '2025-10-06 08:59:32.348'),
(3, 'bintang123', 'superadmin1', 'admin@rental.com', '$2b$10$AJcddNs6HywdjDHm/irPwOqiYw2EiCSAFVtJI05H5LS1z3j8Y.fbO', 1, NULL, '2025-10-01 05:52:07.564', '2025-10-07 11:54:47.640');

-- --------------------------------------------------------

--
-- Table structure for table `histories`
--

CREATE TABLE `histories` (
  `id` int(11) NOT NULL,
  `sewa_id` int(11) NOT NULL,
  `tgl_selesai` datetime(3) NOT NULL,
  `status_selesai` varchar(20) NOT NULL,
  `harga` int(11) NOT NULL,
  `denda` int(11) NOT NULL,
  `catatan` varchar(500) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `keterlambatan_menit` int(11) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `motors`
--

CREATE TABLE `motors` (
  `id` int(11) NOT NULL,
  `plat_nomor` varchar(20) NOT NULL,
  `merk` varchar(255) NOT NULL,
  `model` varchar(255) NOT NULL,
  `tahun` int(11) NOT NULL,
  `harga` int(11) NOT NULL,
  `no_gsm` varchar(20) DEFAULT NULL,
  `imei` varchar(20) DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `device_id` varchar(255) DEFAULT NULL,
  `lat` double DEFAULT NULL,
  `lng` double DEFAULT NULL,
  `last_update` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `motors`
--

INSERT INTO `motors` (`id`, `plat_nomor`, `merk`, `model`, `tahun`, `harga`, `no_gsm`, `imei`, `status`, `device_id`, `lat`, `lng`, `last_update`, `created_at`, `updated_at`) VALUES
(1, 'ae5123tr', 'yamaha', 'nmax', 2025, 70000, NULL, NULL, 'disewa', NULL, NULL, NULL, NULL, '2025-10-01 05:12:31.245', '2025-10-12 09:47:48.891'),
(4, 'ae11111tr', 'honda', 'nmax', 2006, 20000, NULL, NULL, 'tersedia', NULL, NULL, NULL, NULL, '2025-10-07 11:54:18.981', '2025-10-12 09:57:50.634');

-- --------------------------------------------------------

--
-- Table structure for table `penyewas`
--

CREATE TABLE `penyewas` (
  `id` int(11) NOT NULL,
  `nama` varchar(255) NOT NULL,
  `alamat` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `foto_ktp` varchar(255) DEFAULT NULL,
  `is_blacklisted` tinyint(1) NOT NULL DEFAULT 0,
  `no_whatsapp` varchar(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `penyewas`
--

INSERT INTO `penyewas` (`id`, `nama`, `alamat`, `created_at`, `updated_at`, `foto_ktp`, `is_blacklisted`, `no_whatsapp`) VALUES
(4, 'jena123', 'jl.jagadanaa\r\n', '2025-10-02 11:31:31.045', '2025-10-11 08:45:42.161', 'fotos_penyewa/foto_ktp-1759404691040-140476771.png', 0, '62889675829451'),
(15, 'rafi ayam 🐔🐔🐔', '5yedrgsdg', '2025-10-07 11:56:13.559', '2025-10-11 09:22:34.563', NULL, 0, '62895385328653');

-- --------------------------------------------------------

--
-- Table structure for table `settings`
--

CREATE TABLE `settings` (
  `id` int(11) NOT NULL,
  `key` varchar(255) NOT NULL,
  `value` text NOT NULL,
  `type` varchar(50) NOT NULL,
  `group` varchar(50) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `is_encrypted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `settings`
--

INSERT INTO `settings` (`id`, `key`, `value`, `type`, `group`, `description`, `is_encrypted`, `created_at`, `updated_at`) VALUES
(1, 'whatsapp_api_key', '1LpXdSzoHbdhVmApetND', 'string', 'whatsapp', 'API Key untuk Fonnte WhatsApp', 0, '2025-10-01 05:50:42.083', '2025-10-06 07:11:56.827'),
(2, 'whatsapp_fonnte_number', '0895385328653', 'string', 'whatsapp', 'Nomor Fonnte untuk mengirim WhatsApp', 0, '2025-10-01 05:50:42.091', '2025-10-06 07:11:56.831'),
(3, 'whatsapp_admin_numbers', '0895385328653', 'string', 'whatsapp', 'Nomor admin untuk menerima notifikasi', 0, '2025-10-01 05:50:42.095', '2025-10-06 07:11:56.835'),
(4, 'reminder_template', 'Halo {nama}, sekadar pengingat\n\nMotor: {motor}\nNomor plat: {plat}\nJatuh Tempo: {jatuh_tempo}\nSisa Waktu: {sisa_waktu}\n\nTerima kasih telah mempercayai perjalanan Anda bersama kami. Untuk proses pengembalian, Anda dapat datang ke base camp kami sesuai dengan waktu yang telah disepakati.\n\nIngin melanjutkan masa sewa Anda? Jika Anda berencana untuk memperpanjang sewa, jangan ragu untuk menghubungi kami segera agar kami dapat membantu mengatur semuanya untuk Anda.\n\nButuh bantuan atau ada pertanyaan? Tim customer service kami siap membantu Anda.\n\nHubungi Kami:\n📞 {nomor_telepon}\n📍 {alamat_basecamp}\n\nTerima kasih atas kepercayaan dan kerjasamanya yang baik.\n\nSalam hangat,\nTim {nama_rental}', 'text', 'notification', 'Template pesan pengingat jatuh tempo', 1, '2025-10-01 05:50:42.104', '2025-10-06 07:11:56.839'),
(5, 'alert_template', 'PERINGATAN: Sewa motor {motor} (Plat: {plat}) oleh {nama} telah lewat jatuh tempo sejak {jatuh_tempo}. Keterlambatan: {keterlambatan}. Segera tindak lanjuti!', 'text', 'notification', 'Template pesan peringatan admin', 1, '2025-10-01 05:50:42.108', '2025-10-06 07:11:56.842'),
(6, 'auto_notifications', 'true', 'boolean', 'notification', 'Aktifkan notifikasi otomatis', 0, '2025-10-06 14:11:53.412', '2025-10-06 07:11:56.846');

-- --------------------------------------------------------

--
-- Table structure for table `sewas`
--

CREATE TABLE `sewas` (
  `id` int(11) NOT NULL,
  `motor_id` int(11) NOT NULL,
  `penyewa_id` int(11) NOT NULL,
  `admin_id` int(11) NOT NULL,
  `status` varchar(20) NOT NULL,
  `jaminan` varchar(255) DEFAULT NULL,
  `pembayaran` varchar(50) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `durasi_sewa` int(11) NOT NULL,
  `tgl_kembali` datetime(3) NOT NULL,
  `tgl_sewa` datetime(3) NOT NULL,
  `total_harga` int(11) NOT NULL,
  `status_notifikasi` varchar(20) DEFAULT NULL,
  `satuan_durasi` varchar(20) NOT NULL DEFAULT 'hari',
  `additional_costs` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`additional_costs`)),
  `catatan_tambahan` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `sewas`
--

INSERT INTO `sewas` (`id`, `motor_id`, `penyewa_id`, `admin_id`, `status`, `jaminan`, `pembayaran`, `created_at`, `updated_at`, `durasi_sewa`, `tgl_kembali`, `tgl_sewa`, `total_harga`, `status_notifikasi`, `satuan_durasi`, `additional_costs`, `catatan_tambahan`) VALUES
(171, 1, 15, 2, 'aktif', 'KK, SIM, Motor', 'Cash', '2025-10-12 09:47:48.889', '2025-10-12 09:47:48.889', 1, '2025-10-13 09:50:00.000', '2025-10-12 09:47:00.000', 70000, 'menunggu', 'hari', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `whatsapp_notifications`
--

CREATE TABLE `whatsapp_notifications` (
  `id` int(11) NOT NULL,
  `target` varchar(20) NOT NULL,
  `message` text NOT NULL,
  `type` varchar(20) NOT NULL,
  `status` varchar(20) NOT NULL,
  `response` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `whatsapp_notifications`
--

INSERT INTO `whatsapp_notifications` (`id`, `target`, `message`, `type`, `status`, `response`, `created_at`, `updated_at`) VALUES
(21, '62895385328653', 'Halo rafi ayam 🐔🐔🐔, sekadar pengingat\n\nMotor: honda nmax\nNomor plat: ae11111tr\nJatuh Tempo: 12/10/2025 23:39\nSisa Waktu: 6 jam 58 menit\n\nTerima kasih telah mempercayai perjalanan Anda bersama kami. Untuk proses pengembalian, Anda dapat datang ke base camp kami sesuai dengan waktu yang telah disepakati.\n\nIngin melanjutkan masa sewa Anda? Jika Anda berencana untuk memperpanjang sewa, jangan ragu untuk menghubungi kami segera agar kami dapat membantu mengatur semuanya untuk Anda.\n\nButuh bantuan atau ada pertanyaan? Tim customer service kami siap membantu Anda.\n\nHubungi Kami:\n📞 {nomor_telepon}\n📍 {alamat_basecamp}\n\nTerima kasih atas kepercayaan dan kerjasamanya yang baik.\n\nSalam hangat,\nTim {nama_rental}', 'reminder_2jam', 'sent', 'Success', '2025-10-12 09:40:15.123', '2025-10-12 09:40:15.123');

-- --------------------------------------------------------

--
-- Table structure for table `_prisma_migrations`
--

CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) NOT NULL,
  `checksum` varchar(64) NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) NOT NULL,
  `logs` text DEFAULT NULL,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `applied_steps_count` int(10) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `_prisma_migrations`
--

INSERT INTO `_prisma_migrations` (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`) VALUES
('1964eb4c-c0b3-484e-8238-16ae7a8eb072', 'f3a1f3cac48a5360cab3caab8f5aedb07958698eb8714f5e71fd72726d39c960', '2025-10-01 04:55:52.503', '20250917235723_create_motor_tables', NULL, NULL, '2025-10-01 04:55:52.207', 1),
('40d49253-5c3b-4da4-87de-327955a5f3df', '2bf2c052381433ed4bf1947b2a177b33d9af07d4d9b771deb42fe55d36bad1ef', '2025-10-01 05:00:39.545', '20251001050039_add_satuan_durasi_and_keterlambatan_fields', NULL, NULL, '2025-10-01 05:00:39.517', 1),
('40f7a8d4-2e63-42b7-ab29-e80bc163e983', '629636e6d89494b653ef1659c8ebaf6546653f62b655cdb7388914226e90b3a8', '2025-10-01 04:55:53.060', '20250918114317_fix_relations', NULL, NULL, '2025-10-01 04:55:52.696', 1),
('5208317e-6291-4209-9574-10940b314b9d', 'f734687a1710f6051f42856b5d4639e8ad1101bb769774d2d0bbe6f5869a4427', '2025-10-01 04:55:53.126', '20250919091418_add_whatsapp_notification_table', NULL, NULL, '2025-10-01 04:55:53.064', 1),
('9655d44e-0d67-40ab-bbbb-1cefc374dd77', '880004887d694bc43137077d2690845a42b36ee41707df1d2e90bebc7b89ba99', '2025-10-01 04:55:52.694', '20250918014040_add_sewa_history_tables', NULL, NULL, '2025-10-01 04:55:52.506', 1);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admins`
--
ALTER TABLE `admins`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `admins_username_key` (`username`),
  ADD UNIQUE KEY `admins_email_key` (`email`);

--
-- Indexes for table `histories`
--
ALTER TABLE `histories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_history_sewa` (`sewa_id`);

--
-- Indexes for table `motors`
--
ALTER TABLE `motors`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `motors_plat_nomor_key` (`plat_nomor`);

--
-- Indexes for table `penyewas`
--
ALTER TABLE `penyewas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `penyewas_no_whatsapp_key` (`no_whatsapp`);

--
-- Indexes for table `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `settings_key_key` (`key`);

--
-- Indexes for table `sewas`
--
ALTER TABLE `sewas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_sewa_admin` (`admin_id`),
  ADD KEY `fk_sewa_motor` (`motor_id`),
  ADD KEY `fk_sewa_penyewa` (`penyewa_id`);

--
-- Indexes for table `whatsapp_notifications`
--
ALTER TABLE `whatsapp_notifications`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `_prisma_migrations`
--
ALTER TABLE `_prisma_migrations`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `admins`
--
ALTER TABLE `admins`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `histories`
--
ALTER TABLE `histories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=32;

--
-- AUTO_INCREMENT for table `motors`
--
ALTER TABLE `motors`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `penyewas`
--
ALTER TABLE `penyewas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `sewas`
--
ALTER TABLE `sewas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=174;

--
-- AUTO_INCREMENT for table `whatsapp_notifications`
--
ALTER TABLE `whatsapp_notifications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=22;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `histories`
--
ALTER TABLE `histories`
  ADD CONSTRAINT `fk_history_sewa` FOREIGN KEY (`sewa_id`) REFERENCES `sewas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `sewas`
--
ALTER TABLE `sewas`
  ADD CONSTRAINT `fk_sewa_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_sewa_motor` FOREIGN KEY (`motor_id`) REFERENCES `motors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_sewa_penyewa` FOREIGN KEY (`penyewa_id`) REFERENCES `penyewas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
