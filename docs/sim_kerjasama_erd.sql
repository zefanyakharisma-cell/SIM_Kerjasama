-- =====================================================================
-- SIM Kerja Sama — ERD script for MySQL Workbench
-- Source: live Supabase `public` schema (38 tables), 2026-09-18.
--
-- Make the diagram:
--   MySQL Workbench > File > Import > Reverse Engineer MySQL Create Script
--   > pick this file > check "Place imported objects on a diagram" > Execute.
--   Then Model > Forward Engineer (or run this file) to create the database.
--
-- Only tables, keys, relationships and checks are here: views, triggers
-- and functions don't appear on an ERD.
-- =====================================================================

SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

CREATE SCHEMA IF NOT EXISTS `sim_kerjasama` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `sim_kerjasama`;

-- ----------------------------------------------------- Master data

CREATE TABLE `jenis_unit` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `jenis` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `jenis_unit_jenis_key` (`jenis`)
) ENGINE=InnoDB;

CREATE TABLE `unit` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(150) NOT NULL,
  `id_parent_unit` INT NULL,
  `id_jenis_unit` INT NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  INDEX `unit_parent_idx` (`id_parent_unit`),
  INDEX `unit_id_jenis_unit_idx` (`id_jenis_unit`),
  CONSTRAINT `unit_id_jenis_unit_fkey` FOREIGN KEY (`id_jenis_unit`) REFERENCES `jenis_unit` (`id`),
  CONSTRAINT `unit_id_parent_unit_fkey` FOREIGN KEY (`id_parent_unit`) REFERENCES `unit` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `pegawai` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(150) NOT NULL,
  `email` VARCHAR(255) NULL,
  `no_hp` VARCHAR(30) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

CREATE TABLE `jabatan` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(150) NOT NULL,
  `id_unit` INT NOT NULL,
  `tier_disposisi` SMALLINT NULL,
  `id_pegawai` INT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `kepala_unit` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `jabatan_tier_idx` (`tier_disposisi`),
  INDEX `jabatan_unit_idx` (`id_unit`),
  INDEX `jabatan_id_pegawai_idx` (`id_pegawai`),
  CONSTRAINT `jabatan_id_unit_fkey` FOREIGN KEY (`id_unit`) REFERENCES `unit` (`id`),
  CONSTRAINT `jabatan_id_pegawai_fkey` FOREIGN KEY (`id_pegawai`) REFERENCES `pegawai` (`id`),
  CONSTRAINT `jabatan_tier_disposisi_check` CHECK (`tier_disposisi` BETWEEN 1 AND 3)
) ENGINE=InnoDB;

CREATE TABLE `akun` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `auth_user_id` CHAR(36) NULL COMMENT 'Supabase auth.users uuid',
  `id_jabatan` INT NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `role` VARCHAR(30) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `grafik_default_disalin` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `akun_auth_user_id_key` (`auth_user_id`),
  UNIQUE INDEX `akun_email_key` (`email`),
  INDEX `akun_jabatan_idx` (`id_jabatan`),
  CONSTRAINT `akun_id_jabatan_fkey` FOREIGN KEY (`id_jabatan`) REFERENCES `jabatan` (`id`),
  CONSTRAINT `akun_role_check` CHECK (`role` IN ('submitter','io_staff','io_admin','viewer'))
) ENGINE=InnoDB;

CREATE TABLE `negara` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `kode` VARCHAR(3) NOT NULL,
  `nama` VARCHAR(100) NOT NULL,
  `is_domestic` TINYINT(1) NOT NULL DEFAULT 0,
  `latitude` DECIMAL(9,6) NULL,
  `longitude` DECIMAL(9,6) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `negara_kode_key` (`kode`),
  UNIQUE INDEX `negara_nama_key` (`nama`)
) ENGINE=InnoDB;

CREATE TABLE `jenis_mitra` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(150) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `jenis_mitra_nama_key` (`nama`)
) ENGINE=InnoDB;

CREATE TABLE `agenda` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(200) NOT NULL,
  `is_amendment` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `agenda_nama_key` (`nama`)
) ENGINE=InnoDB;

CREATE TABLE `bidang_kerjasama` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(50) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `bidang_kerjasama_nama_key` (`nama`)
) ENGINE=InnoDB;

-- nilai is VARCHAR(1000): too long for a unique index, so uniqueness
-- goes through a SHA-256 hash column.
CREATE TABLE `tujuan_kerjasama` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nilai` VARCHAR(1000) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `nilai_hash` CHAR(64) GENERATED ALWAYS AS (SHA2(`nilai`, 256)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tujuan_kerjasama_nilai_key` (`nilai_hash`)
) ENGINE=InnoDB;

CREATE TABLE `manfaat_petra` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nilai` VARCHAR(1000) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `nilai_hash` CHAR(64) GENERATED ALWAYS AS (SHA2(`nilai`, 256)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `manfaat_petra_nilai_key` (`nilai_hash`)
) ENGINE=InnoDB;

CREATE TABLE `manfaat_mitra` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nilai` VARCHAR(1000) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `nilai_hash` CHAR(64) GENERATED ALWAYS AS (SHA2(`nilai`, 256)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `manfaat_mitra_nilai_key` (`nilai_hash`)
) ENGINE=InnoDB;

CREATE TABLE `managed_options` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `option_group` VARCHAR(30) NOT NULL,
  `value` VARCHAR(1000) NOT NULL,
  `usage_count` INT NOT NULL DEFAULT 0,
  `id_merged_into` INT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  INDEX `managed_options_group_idx` (`option_group`, `is_active`),
  INDEX `managed_options_id_merged_into_idx` (`id_merged_into`),
  CONSTRAINT `managed_options_id_merged_into_fkey` FOREIGN KEY (`id_merged_into`) REFERENCES `managed_options` (`id`),
  CONSTRAINT `managed_options_option_group_check` CHECK (`option_group` = 'jabatan_freetext')
) ENGINE=InnoDB;

CREATE TABLE `holidays` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tanggal` DATE NOT NULL,
  `keterangan` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `holidays_tanggal_key` (`tanggal`)
) ENGINE=InnoDB;

CREATE TABLE `settings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(100) NOT NULL,
  `value` TEXT NOT NULL,
  `updated_by` INT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `settings_key_key` (`key`),
  INDEX `settings_updated_by_idx` (`updated_by`),
  CONSTRAINT `settings_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `akun` (`id`)
) ENGINE=InnoDB;

-- ----------------------------------------------------- Partners

CREATE TABLE `partner` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(200) NOT NULL,
  `is_international` TINYINT(1) NOT NULL,
  `id_negara` INT NOT NULL,
  `kota` VARCHAR(100) NULL,
  `alamat` VARCHAR(255) NULL,
  `no_telp` VARCHAR(30) NULL,
  `homepage` VARCHAR(255) NULL,
  `afiliasi_group` VARCHAR(150) NULL,
  `jaringan_bisnis` VARCHAR(150) NULL,
  `jenis_bisnis` VARCHAR(150) NULL,
  `informasi_tambahan` TEXT NULL,
  `id_partner_contact` INT NULL,
  `latitude` DECIMAL(9,6) NULL,
  `longitude` DECIMAL(9,6) NULL,
  `id_merged_into` INT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `id_jenis_mitra` INT NULL,
  PRIMARY KEY (`id`),
  INDEX `partner_intl_idx` (`is_international`, `is_active`),
  INDEX `partner_negara_idx` (`id_negara`),
  INDEX `partner_id_jenis_mitra_idx` (`id_jenis_mitra`),
  INDEX `partner_id_merged_into_idx` (`id_merged_into`),
  INDEX `partner_id_partner_contact_idx` (`id_partner_contact`),
  CONSTRAINT `partner_id_negara_fkey` FOREIGN KEY (`id_negara`) REFERENCES `negara` (`id`),
  CONSTRAINT `partner_id_jenis_mitra_fkey` FOREIGN KEY (`id_jenis_mitra`) REFERENCES `jenis_mitra` (`id`),
  CONSTRAINT `partner_id_merged_into_fkey` FOREIGN KEY (`id_merged_into`) REFERENCES `partner` (`id`),
  CONSTRAINT `partner_primary_contact_fk` FOREIGN KEY (`id_partner_contact`) REFERENCES `partner_contact` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `partner_contact` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_partner` INT NOT NULL,
  `nama` VARCHAR(150) NOT NULL,
  `jabatan` VARCHAR(150) NULL,
  `email` VARCHAR(150) NULL,
  `no_telp` VARCHAR(30) NULL,
  PRIMARY KEY (`id`),
  INDEX `partner_contact_partner_idx` (`id_partner`),
  CONSTRAINT `partner_contact_id_partner_fkey` FOREIGN KEY (`id_partner`) REFERENCES `partner` (`id`)
) ENGINE=InnoDB;

-- ----------------------------------------------------- Proposals

CREATE TABLE `proposal_dokumen` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `jenis_kerjasama` ENUM('MoU','MoA') NOT NULL,
  `periode_kerjasama` VARCHAR(50) NULL,
  `sifat_periode_kerjasama` VARCHAR(45) NULL,
  `status_proposal` VARCHAR(30) NOT NULL DEFAULT 'Draft',
  `tujuan_kerjasama` TEXT NULL,
  `manfaat_bagi_petra` TEXT NULL,
  `manfaat_bagi_mitra` TEXT NULL,
  `informasi_tambahan` TEXT NULL,
  `file_draft` VARCHAR(500) NULL,
  `id_dokumen_sebelumnya` INT NULL,
  `id_akun_pembuat` INT NOT NULL,
  `waktu_dibuat` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `waktu_proposal_dokumen` DATETIME(6) NULL,
  `waktu_disetujui` DATETIME(6) NULL,
  `waktu_aktif` DATETIME(6) NULL,
  `status_sla` VARCHAR(30) NULL,
  PRIMARY KEY (`id`),
  INDEX `proposal_pembuat_idx` (`id_akun_pembuat`),
  INDEX `proposal_sebelumnya_idx` (`id_dokumen_sebelumnya`),
  INDEX `proposal_status_idx` (`status_proposal`),
  CONSTRAINT `proposal_dokumen_id_akun_pembuat_fkey` FOREIGN KEY (`id_akun_pembuat`) REFERENCES `akun` (`id`),
  CONSTRAINT `proposal_dokumen_id_dokumen_sebelumnya_fkey` FOREIGN KEY (`id_dokumen_sebelumnya`) REFERENCES `proposal_dokumen` (`id`),
  CONSTRAINT `proposal_dokumen_sifat_periode_kerjasama_check`
    CHECK (`sifat_periode_kerjasama` IN ('Kedua Belah Pihak','Auto Renewed')),
  CONSTRAINT `proposal_dokumen_status_proposal_check`
    CHECK (`status_proposal` IN ('Draft','Diajukan','Diproses','Disposisi - Tier 1',
      'Disposisi - Tier 2','Disposisi - Tier 3','Pending','Disetujui','Ditolak'))
) ENGINE=InnoDB;

CREATE TABLE `proposal_dokumen_mou` (
  `id_proposal_dokumen` INT NOT NULL,
  `ringkasan_kegiatan` TEXT NOT NULL,
  PRIMARY KEY (`id_proposal_dokumen`),
  CONSTRAINT `proposal_dokumen_mou_id_proposal_dokumen_fkey`
    FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `proposal_dokumen_moa` (
  `id_proposal_dokumen` INT NOT NULL,
  `hak_petra` TEXT NOT NULL,
  `hak_calon_mitra` TEXT NOT NULL,
  `kewajiban_petra` TEXT NOT NULL,
  `kewajiban_calon_mitra` TEXT NOT NULL,
  PRIMARY KEY (`id_proposal_dokumen`),
  CONSTRAINT `proposal_dokumen_moa_id_proposal_dokumen_fkey`
    FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `proposal_dokumen_agenda` (
  `id_proposal_dokumen` INT NOT NULL,
  `id_agenda` INT NOT NULL,
  PRIMARY KEY (`id_proposal_dokumen`, `id_agenda`),
  INDEX `proposal_dokumen_agenda_id_agenda_idx` (`id_agenda`),
  CONSTRAINT `proposal_dokumen_agenda_id_proposal_dokumen_fkey`
    FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE,
  CONSTRAINT `proposal_dokumen_agenda_id_agenda_fkey` FOREIGN KEY (`id_agenda`) REFERENCES `agenda` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `proposal_dokumen_bidang` (
  `id_proposal_dokumen` INT NOT NULL,
  `id_bidang_kerjasama` INT NOT NULL,
  PRIMARY KEY (`id_proposal_dokumen`, `id_bidang_kerjasama`),
  INDEX `proposal_dokumen_bidang_id_bidang_idx` (`id_bidang_kerjasama`),
  CONSTRAINT `proposal_dokumen_bidang_id_proposal_dokumen_fkey`
    FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE,
  CONSTRAINT `proposal_dokumen_bidang_id_bidang_kerjasama_fkey`
    FOREIGN KEY (`id_bidang_kerjasama`) REFERENCES `bidang_kerjasama` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `proposal_dokumen_unit` (
  `id_proposal_dokumen` INT NOT NULL,
  `id_unit` INT NOT NULL,
  PRIMARY KEY (`id_proposal_dokumen`, `id_unit`),
  INDEX `proposal_dokumen_unit_id_unit_idx` (`id_unit`),
  CONSTRAINT `proposal_dokumen_unit_id_proposal_dokumen_fkey`
    FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE,
  CONSTRAINT `proposal_dokumen_unit_id_unit_fkey` FOREIGN KEY (`id_unit`) REFERENCES `unit` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `pengusul` (
  `id_jabatan` INT NOT NULL,
  `id_proposal_dokumen` INT NOT NULL,
  PRIMARY KEY (`id_jabatan`, `id_proposal_dokumen`),
  INDEX `pengusul_id_proposal_dokumen_idx` (`id_proposal_dokumen`),
  CONSTRAINT `pengusul_id_jabatan_fkey` FOREIGN KEY (`id_jabatan`) REFERENCES `jabatan` (`id`),
  CONSTRAINT `pengusul_id_proposal_dokumen_fkey`
    FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Supabase also enforces "one is_lead per proposal" (partial unique index);
-- MySQL can't express that as an index, so the app must keep it.
CREATE TABLE `partner_pengusul` (
  `id_partner` INT NOT NULL,
  `id_proposal_dokumen` INT NOT NULL,
  `is_lead` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_partner`, `id_proposal_dokumen`),
  INDEX `partner_pengusul_id_proposal_dokumen_idx` (`id_proposal_dokumen`),
  CONSTRAINT `partner_pengusul_id_partner_fkey` FOREIGN KEY (`id_partner`) REFERENCES `partner` (`id`),
  CONSTRAINT `partner_pengusul_id_proposal_dokumen_fkey`
    FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `revisi_proposal` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_proposal_dokumen` INT NOT NULL,
  `file_proposal` VARCHAR(500) NOT NULL,
  `id_akun_pengunggah` INT NOT NULL,
  `id_disposisi_target_peminta` INT NULL,
  `catatan` TEXT NULL,
  `waktu_unggah` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  INDEX `revisi_proposal_idx` (`id_proposal_dokumen`, `waktu_unggah`),
  INDEX `revisi_proposal_id_akun_pengunggah_idx` (`id_akun_pengunggah`),
  INDEX `revisi_proposal_id_disposisi_target_peminta_idx` (`id_disposisi_target_peminta`),
  CONSTRAINT `revisi_proposal_id_proposal_dokumen_fkey` FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`),
  CONSTRAINT `revisi_proposal_id_akun_pengunggah_fkey` FOREIGN KEY (`id_akun_pengunggah`) REFERENCES `akun` (`id`),
  CONSTRAINT `revisi_proposal_id_disposisi_target_peminta_fkey`
    FOREIGN KEY (`id_disposisi_target_peminta`) REFERENCES `disposisi_target` (`no`)
) ENGINE=InnoDB;

-- ----------------------------------------------------- Signed documents

CREATE TABLE `dokumen_kerja_sama` (
  `no` INT NOT NULL AUTO_INCREMENT,
  `id_proposal_dokumen` INT NOT NULL,
  `no_dokumen` VARCHAR(50) NULL,
  `tanggal_tanda_tangan` DATE NULL,
  `tanggal_mulai` DATE NULL,
  `tanggal_berakhir` DATE NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'Aktif',
  `alasan_arsip` VARCHAR(40) NULL,
  `upload_dokumen` VARCHAR(500) NULL,
  `folder_kui` VARCHAR(100) NULL,
  `no_berkas_dikti` VARCHAR(100) NULL,
  `id_penandatangan_partner` INT NULL,
  `waktu_dibuat` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `link_gdrive` VARCHAR(500) NULL,
  PRIMARY KEY (`no`),
  UNIQUE INDEX `dokumen_kerja_sama_id_proposal_dokumen_key` (`id_proposal_dokumen`),
  INDEX `dokumen_status_berakhir_idx` (`status`, `tanggal_berakhir`),
  INDEX `dokumen_id_penandatangan_partner_idx` (`id_penandatangan_partner`),
  CONSTRAINT `dokumen_kerja_sama_id_proposal_dokumen_fkey` FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`),
  CONSTRAINT `dokumen_penandatangan_partner_fk` FOREIGN KEY (`id_penandatangan_partner`) REFERENCES `penandatangan_partner` (`id`),
  CONSTRAINT `dokumen_kerja_sama_status_check`
    CHECK (`status` IN ('Aktif','Akan Berakhir','Kedaluarsa','Diarsipkan')),
  CONSTRAINT `dokumen_kerja_sama_alasan_arsip_check`
    CHECK (`alasan_arsip` IN ('rejected','expired_without_renewal','not_renewed',
      'superseded_by_renewal','terminated_early')),
  CONSTRAINT `arsip_needs_reason` CHECK (`status` <> 'Diarsipkan' OR `alasan_arsip` IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE `penandatangan_petra` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `no_dokumen_kerjasama` INT NOT NULL,
  `nama` VARCHAR(150) NOT NULL,
  `jabatan` VARCHAR(150) NULL,
  PRIMARY KEY (`id`),
  INDEX `penandatangan_petra_no_dokumen_idx` (`no_dokumen_kerjasama`),
  CONSTRAINT `penandatangan_petra_no_dokumen_kerjasama_fkey`
    FOREIGN KEY (`no_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `penandatangan_partner` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_partner` INT NOT NULL,
  `no_dokumen_kerjasama` INT NOT NULL,
  `nama` VARCHAR(150) NOT NULL,
  `jabatan` VARCHAR(150) NULL,
  PRIMARY KEY (`id`),
  INDEX `penandatangan_partner_id_partner_idx` (`id_partner`),
  INDEX `penandatangan_partner_no_dokumen_idx` (`no_dokumen_kerjasama`),
  CONSTRAINT `penandatangan_partner_id_partner_fkey` FOREIGN KEY (`id_partner`) REFERENCES `partner` (`id`),
  CONSTRAINT `penandatangan_partner_no_dokumen_kerjasama_fkey`
    FOREIGN KEY (`no_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------- Workflow

CREATE TABLE `disposisi` (
  `no` INT NOT NULL AUTO_INCREMENT,
  `id_proposal_dokumen` INT NULL,
  `no_dokumen_kerjasama` INT NULL,
  `jenis_disposisi` VARCHAR(30) NOT NULL,
  `round_ke` SMALLINT NOT NULL DEFAULT 1,
  `pesan_disposisi` TEXT NULL,
  `lampiran` VARCHAR(500) NULL,
  `id_akun_pengirim` INT NULL,
  `waktu_disposisi` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`no`),
  INDEX `disposisi_dokumen_idx` (`no_dokumen_kerjasama`),
  INDEX `disposisi_jenis_idx` (`jenis_disposisi`),
  INDEX `disposisi_proposal_idx` (`id_proposal_dokumen`, `round_ke`),
  INDEX `disposisi_id_akun_pengirim_idx` (`id_akun_pengirim`),
  CONSTRAINT `disposisi_id_proposal_dokumen_fkey` FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`),
  CONSTRAINT `disposisi_no_dokumen_kerjasama_fkey` FOREIGN KEY (`no_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`),
  CONSTRAINT `disposisi_id_akun_pengirim_fkey` FOREIGN KEY (`id_akun_pengirim`) REFERENCES `akun` (`id`),
  CONSTRAINT `disposisi_jenis_disposisi_check` CHECK (`jenis_disposisi` IN ('approval','renewal_request')),
  CONSTRAINT `disposisi_subject_matches_kind` CHECK (
    (`jenis_disposisi` = 'approval' AND `id_proposal_dokumen` IS NOT NULL)
    OR (`jenis_disposisi` = 'renewal_request' AND `no_dokumen_kerjasama` IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE `disposisi_target` (
  `no` INT NOT NULL AUTO_INCREMENT,
  `no_disposisi` INT NOT NULL,
  `id_jabatan` INT NOT NULL,
  `tier` SMALLINT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'waiting',
  `waktu_unlock` DATETIME(6) NULL,
  `waktu_resolusi` DATETIME(6) NULL,
  `batas_waktu_sla` DATETIME(6) NULL,
  `durasi_hari_kerja` DECIMAL(6,2) NULL,
  `status_sla` VARCHAR(20) NULL,
  PRIMARY KEY (`no`),
  INDEX `disposisi_target_disposisi_idx` (`no_disposisi`),
  INDEX `disposisi_target_jabatan_idx` (`id_jabatan`, `status`),
  CONSTRAINT `disposisi_target_no_disposisi_fkey`
    FOREIGN KEY (`no_disposisi`) REFERENCES `disposisi` (`no`) ON DELETE CASCADE,
  CONSTRAINT `disposisi_target_id_jabatan_fkey` FOREIGN KEY (`id_jabatan`) REFERENCES `jabatan` (`id`),
  CONSTRAINT `disposisi_target_status_check`
    CHECK (`status` IN ('waiting','pending_action','approved','rejected','removed')),
  CONSTRAINT `disposisi_target_status_sla_check` CHECK (`status_sla` IN ('normal','yellow','red')),
  CONSTRAINT `disposisi_target_tier_check` CHECK (`tier` BETWEEN 1 AND 3)
) ENGINE=InnoDB;

CREATE TABLE `riwayat_approval` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_disposisi_target` INT NULL,
  `id_proposal_dokumen` INT NULL,
  `id_akun` INT NULL,
  `aksi` VARCHAR(50) NOT NULL,
  `catatan` TEXT NULL,
  `tanggal` DATE NOT NULL DEFAULT (CURRENT_DATE),
  `waktu` TIME NOT NULL DEFAULT (CURRENT_TIME),
  PRIMARY KEY (`id`),
  INDEX `riwayat_proposal_idx` (`id_proposal_dokumen`, `tanggal`, `waktu`),
  INDEX `riwayat_target_idx` (`id_disposisi_target`),
  INDEX `riwayat_approval_id_akun_idx` (`id_akun`),
  CONSTRAINT `riwayat_approval_id_disposisi_target_fkey` FOREIGN KEY (`id_disposisi_target`) REFERENCES `disposisi_target` (`no`),
  CONSTRAINT `riwayat_approval_id_proposal_dokumen_fkey` FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`),
  CONSTRAINT `riwayat_approval_id_akun_fkey` FOREIGN KEY (`id_akun`) REFERENCES `akun` (`id`),
  CONSTRAINT `riwayat_has_subject` CHECK (`id_disposisi_target` IS NOT NULL OR `id_proposal_dokumen` IS NOT NULL)
) ENGINE=InnoDB;

-- open_key emulates Supabase's "one open pending period per proposal".
CREATE TABLE `pending_periods` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_proposal_dokumen` INT NOT NULL,
  `mulai` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `selesai` DATETIME(6) NULL,
  `id_disposisi_target_pemicu` INT NULL,
  `id_akun_reaktivasi` INT NULL,
  `open_key` INT GENERATED ALWAYS AS (IF(`selesai` IS NULL, `id_proposal_dokumen`, NULL)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `pending_periods_one_open_idx` (`open_key`),
  INDEX `pending_periods_proposal_idx` (`id_proposal_dokumen`),
  INDEX `pending_periods_pemicu_idx` (`id_disposisi_target_pemicu`),
  INDEX `pending_periods_reaktivasi_idx` (`id_akun_reaktivasi`),
  CONSTRAINT `pending_periods_id_proposal_dokumen_fkey` FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`),
  CONSTRAINT `pending_periods_id_disposisi_target_pemicu_fkey`
    FOREIGN KEY (`id_disposisi_target_pemicu`) REFERENCES `disposisi_target` (`no`),
  CONSTRAINT `pending_periods_id_akun_reaktivasi_fkey` FOREIGN KEY (`id_akun_reaktivasi`) REFERENCES `akun` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `notifikasi` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_proposal_dokumen` INT NULL,
  `no_dokumen_kerjasama` INT NULL,
  `id_jabatan_penerima` INT NULL,
  `jenis_notifikasi` VARCHAR(50) NOT NULL,
  `isi` TEXT NULL,
  `waktu_kirim` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `waktu_dibaca` DATETIME(6) NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `id_disposisi_target` INT NULL,
  PRIMARY KEY (`id`),
  INDEX `notifikasi_penerima_idx` (`id_jabatan_penerima`, `waktu_kirim` DESC),
  UNIQUE INDEX `notifikasi_sekali_per_target_idx` (`id_disposisi_target`, `jenis_notifikasi`, `id_jabatan_penerima`),
  INDEX `notifikasi_id_proposal_dokumen_idx` (`id_proposal_dokumen`),
  INDEX `notifikasi_no_dokumen_kerjasama_idx` (`no_dokumen_kerjasama`),
  CONSTRAINT `notifikasi_id_proposal_dokumen_fkey` FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`),
  CONSTRAINT `notifikasi_no_dokumen_kerjasama_fkey` FOREIGN KEY (`no_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`),
  CONSTRAINT `notifikasi_id_jabatan_penerima_fkey` FOREIGN KEY (`id_jabatan_penerima`) REFERENCES `jabatan` (`id`),
  CONSTRAINT `notifikasi_id_disposisi_target_fkey` FOREIGN KEY (`id_disposisi_target`) REFERENCES `disposisi_target` (`no`),
  CONSTRAINT `notifikasi_status_check` CHECK (`status` IN ('pending','sent','failed','read'))
) ENGINE=InnoDB;

-- ----------------------------------------------------- Renewal & evaluation

CREATE TABLE `evaluasi` (
  `no` INT NOT NULL AUTO_INCREMENT,
  `id_dokumen_kerjasama` INT NOT NULL,
  `respondent_type` VARCHAR(10) NOT NULL,
  `id_partner_contact` INT NULL,
  `id_jabatan_pengusul` INT NULL,
  `exp_quality` SMALLINT NULL,
  `exp_relevance` SMALLINT NULL,
  `exp_productivity` SMALLINT NULL,
  `exp_sustainability` SMALLINT NULL,
  `exp_communication` SMALLINT NULL,
  `sat_quality` SMALLINT NULL,
  `sat_relevance` SMALLINT NULL,
  `sat_productivity` SMALLINT NULL,
  `sat_sustainability` SMALLINT NULL,
  `sat_communication` SMALLINT NULL,
  `rekomendasi` VARCHAR(50) NULL,
  `continuation_mode` VARCHAR(20) NULL,
  `catatan_evaluasi` TEXT NULL,
  `respondent_nama` VARCHAR(150) NULL,
  `respondent_email` VARCHAR(150) NULL,
  `form_revision` VARCHAR(30) NOT NULL DEFAULT 'F03-PM03-KUI-UKP-00',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `id_supersedes` INT NULL,
  `waktu_evaluasi` DATETIME(6) NULL,
  `waktu_dibuat` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`no`),
  INDEX `evaluasi_dokumen_idx` (`id_dokumen_kerjasama`, `respondent_type`, `status`),
  INDEX `evaluasi_id_partner_contact_idx` (`id_partner_contact`),
  INDEX `evaluasi_id_jabatan_pengusul_idx` (`id_jabatan_pengusul`),
  INDEX `evaluasi_id_supersedes_idx` (`id_supersedes`),
  CONSTRAINT `evaluasi_id_dokumen_kerjasama_fkey` FOREIGN KEY (`id_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`),
  CONSTRAINT `evaluasi_id_partner_contact_fkey` FOREIGN KEY (`id_partner_contact`) REFERENCES `partner_contact` (`id`),
  CONSTRAINT `evaluasi_id_jabatan_pengusul_fkey` FOREIGN KEY (`id_jabatan_pengusul`) REFERENCES `jabatan` (`id`),
  CONSTRAINT `evaluasi_id_supersedes_fkey` FOREIGN KEY (`id_supersedes`) REFERENCES `evaluasi` (`no`),
  CONSTRAINT `evaluasi_respondent_type_check` CHECK (`respondent_type` IN ('faculty','partner')),
  CONSTRAINT `evaluasi_rekomendasi_check` CHECK (`rekomendasi` IN ('continue','terminate')),
  CONSTRAINT `evaluasi_continuation_mode_check` CHECK (`continuation_mode` IN ('same_program','add_program')),
  CONSTRAINT `evaluasi_status_check` CHECK (`status` IN ('pending','submitted','superseded')),
  CONSTRAINT `evaluasi_submitted_has_recommendation` CHECK (`status` <> 'submitted' OR `rekomendasi` IS NOT NULL),
  CONSTRAINT `evaluasi_exp_quality_check` CHECK (`exp_quality` BETWEEN 1 AND 5),
  CONSTRAINT `evaluasi_exp_relevance_check` CHECK (`exp_relevance` BETWEEN 1 AND 5),
  CONSTRAINT `evaluasi_exp_productivity_check` CHECK (`exp_productivity` BETWEEN 1 AND 5),
  CONSTRAINT `evaluasi_exp_sustainability_check` CHECK (`exp_sustainability` BETWEEN 1 AND 5),
  CONSTRAINT `evaluasi_exp_communication_check` CHECK (`exp_communication` BETWEEN 1 AND 5),
  CONSTRAINT `evaluasi_sat_quality_check` CHECK (`sat_quality` BETWEEN 1 AND 5),
  CONSTRAINT `evaluasi_sat_relevance_check` CHECK (`sat_relevance` BETWEEN 1 AND 5),
  CONSTRAINT `evaluasi_sat_productivity_check` CHECK (`sat_productivity` BETWEEN 1 AND 5),
  CONSTRAINT `evaluasi_sat_sustainability_check` CHECK (`sat_sustainability` BETWEEN 1 AND 5),
  CONSTRAINT `evaluasi_sat_communication_check` CHECK (`sat_communication` BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE `partner_eval_token` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_evaluasi` INT NOT NULL,
  `token` CHAR(64) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `id_akun_pengirim` INT NULL,
  `waktu_kirim` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `waktu_submit` DATETIME(6) NULL,
  `waktu_reopen` DATETIME(6) NULL,
  `id_akun_reopen` INT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `partner_eval_token_token_key` (`token`),
  INDEX `partner_eval_token_evaluasi_idx` (`id_evaluasi`),
  INDEX `partner_eval_token_pengirim_idx` (`id_akun_pengirim`),
  INDEX `partner_eval_token_reopen_idx` (`id_akun_reopen`),
  CONSTRAINT `partner_eval_token_id_evaluasi_fkey` FOREIGN KEY (`id_evaluasi`) REFERENCES `evaluasi` (`no`),
  CONSTRAINT `partner_eval_token_id_akun_pengirim_fkey` FOREIGN KEY (`id_akun_pengirim`) REFERENCES `akun` (`id`),
  CONSTRAINT `partner_eval_token_id_akun_reopen_fkey` FOREIGN KEY (`id_akun_reopen`) REFERENCES `akun` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `keputusan_pembaruan` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_dokumen_kerjasama` INT NOT NULL,
  `keputusan` VARCHAR(20) NOT NULL,
  `alasan` TEXT NOT NULL,
  `id_akun` INT NOT NULL,
  `waktu` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `is_berlaku` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  INDEX `keputusan_pembaruan_dokumen_idx` (`id_dokumen_kerjasama`),
  INDEX `keputusan_pembaruan_id_akun_idx` (`id_akun`),
  CONSTRAINT `keputusan_pembaruan_id_dokumen_kerjasama_fkey` FOREIGN KEY (`id_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`),
  CONSTRAINT `keputusan_pembaruan_id_akun_fkey` FOREIGN KEY (`id_akun`) REFERENCES `akun` (`id`),
  CONSTRAINT `keputusan_pembaruan_keputusan_check` CHECK (`keputusan` IN ('continue','terminate'))
) ENGINE=InnoDB;

-- ----------------------------------------------------- Dashboard

CREATE TABLE `dashboard_chart` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `judul` VARCHAR(150) NOT NULL,
  `jenis_grafik` VARCHAR(20) NOT NULL,
  `config` JSON NOT NULL,
  `urutan` SMALLINT NOT NULL,
  `id_akun` INT NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `dashboard_chart_akun_idx` (`id_akun`, `urutan`),
  CONSTRAINT `dashboard_chart_id_akun_fkey` FOREIGN KEY (`id_akun`) REFERENCES `akun` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dashboard_chart_jenis_grafik_check` CHECK (`jenis_grafik` IN
    ('batang_vertikal','batang_horizontal','donut','garis','area','radar','treemap')),
  CONSTRAINT `dashboard_chart_urutan_check` CHECK (`urutan` >= 1)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
