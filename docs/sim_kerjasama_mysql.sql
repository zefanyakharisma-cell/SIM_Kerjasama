-- =====================================================================
-- SIM Kerja Sama — MySQL schema
-- Universitas Kristen Petra
--
-- Generated from the LIVE Supabase/PostgreSQL database (project
-- simks-partnership) by reading its catalog, not from the migration files,
-- so this is the schema as it actually stands on 22 September 2026.
--
-- 42 tables, 65 foreign keys, 30 secondary indexes, 2 views.
--
-- Target: MySQL 8.0.16 or later. That floor is not arbitrary — CHECK
-- constraints are only enforced from 8.0.16, and this schema leans on them
-- for its status values. On an older MySQL the CHECK clauses parse and are
-- silently ignored, which would let invalid statuses in.
--
-- Load order: tables first, then foreign keys, then indexes, then views.
-- Foreign keys are applied after every table exists, so the file does not
-- depend on table creation order.
--
--   mysql -u root -p < sim_kerjasama_mysql.sql
--
-- ---------------------------------------------------------------------
-- HOW POSTGRES TYPES WERE MAPPED
--
--   integer / smallint          -> INT / SMALLINT
--   boolean                     -> TINYINT(1), with true/false as 1/0
--   character varying(n)        -> VARCHAR(n)
--   character(n)                -> CHAR(n)
--   text                        -> TEXT
--   numeric(p,s)                -> DECIMAL(p,s)
--   date / time                 -> DATE / TIME
--   timestamp with time zone    -> DATETIME   (see the note below)
--   uuid                        -> CHAR(36)
--   jsonb                       -> JSON
--   jenis_kerjasama_t (enum)    -> ENUM('MoU','MoA')
--   GENERATED ALWAYS AS IDENTITY-> AUTO_INCREMENT
--
-- TIME ZONES. Postgres stores timestamptz as an absolute instant; MySQL's
-- DATETIME has no zone at all. Every timestamp here is therefore UTC, and
-- the application is responsible for rendering it in WIB (UTC+7). TIMESTAMP
-- was deliberately not used: it would convert against the server's zone and
-- it cannot represent dates past 2038, which this data will outlive.
--
-- WHAT POSTGRES ENFORCES THAT THIS FILE CANNOT
--
-- Row Level Security is the access model in the live database — who may read
-- or write which row is decided by RLS policies, not by the application.
-- MySQL has no equivalent, so NONE of that is present here. This file is the
-- shape of the data, not its security model. Anything built on it has to
-- re-implement those rules itself.
--
-- The business logic lives in Postgres functions (approval tiering, the SLA
-- sweep, the renewal gate) and is likewise absent.
-- ---------------------------------------------------------------------
-- PORTABILITY NOTES — every place this file is not a literal translation
--
--   * akun.auth_user_id: the foreign key to auth.users is NOT emitted — it
--     references Supabase Auth, which has no MySQL counterpart. The column
--     is kept so the link survives as data; whatever replaces Supabase
--     Auth has to enforce it
--   * dashboard_chart.id_akun: set by the application; MySQL has no
--     equivalent session function
--   * disposisi_target.disposisi_target_pending_idx: partial-index
--     predicate dropped (((status)::text = 'pending_action'::text)); MySQL
--     has no partial indexes — the index still works, it is just wider
--   * managed_options.managed_options_group_idx: partial-index predicate
--     dropped (is_active); MySQL has no partial indexes — the index still
--     works, it is just wider
--   * partner.partner_intl_idx: partial-index predicate dropped
--     (is_active); MySQL has no partial indexes — the index still works,
--     it is just wider
--   * riwayat_approval.waktu: MySQL cannot default a TIME column to a
--     function
--   * notifikasi.notifikasi_sekali_per_target_idx: kept as a plain UNIQUE
--     index — its WHERE id_disposisi_target IS NOT NULL is redundant in
--     MySQL, which already treats NULLs in a unique index as distinct, so
--     the rule is preserved exactly
--
-- VIEWS. Two of the twelve are carried over below. The other ten rely on
-- Postgres features MySQL does not have, and a guessed translation would be
-- worse than none, so they are listed here instead:
--   * v_daftar_dokumen         LATERAL joins and string_agg; it is the list screen's main query
--   * v_laporan_dokumen        built on v_daftar_dokumen, same reasons
--   * v_pembaruan              LATERAL joins and aggregate FILTER (...)
--   * v_sla_dokumen            interval arithmetic and FILTER (...)
--   * v_evaluasi_gap           aggregate FILTER (...) over the two evaluation sides
--   * v_log_aktivitas          UNION of several sources with Postgres-only casts
--   * v_backlog_trend          generate_series() — MySQL has no date-series generator
--   * v_leaderboard_pending    interval arithmetic and FILTER (...)
--   * v_partner_duplikat       similarity() from the pg_trgm extension
--   * v_time_in_status         percentile_cont(...) WITHIN GROUP — MySQL has no percentile function
-- =====================================================================

SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;
SET @OLD_SQL_MODE = @@SQL_MODE;
SET SQL_MODE = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO';

-- CREATE DATABASE IF NOT EXISTS `sim_kerjasama`
--   DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE `sim_kerjasama`;

-- =====================================================================
-- 1. TABLES
-- =====================================================================

CREATE TABLE `agenda` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(200) NOT NULL,
  `is_amendment` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `agenda_nama_key` (`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `akun` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `auth_user_id` CHAR(36) NULL,
  `id_jabatan` INT NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `role` VARCHAR(30) NOT NULL COMMENT 'What this account may do. "Approver" is never stored here: it is derived per document from an open disposisi_target matching id_jabatan (AR-01).',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `grafik_default_disalin` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `akun_auth_user_id_key` (`auth_user_id`),
  UNIQUE KEY `akun_email_key` (`email`),
  CONSTRAINT `akun_role_check` CHECK (((role) IN ('admin', 'user', 'user_staff', 'approver')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bidang_kerjasama` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(50) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bidang_kerjasama_nama_key` (`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dashboard_chart` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `judul` VARCHAR(150) NOT NULL,
  `jenis_grafik` VARCHAR(20) NOT NULL,
  `config` JSON NOT NULL,
  `urutan` SMALLINT NOT NULL,
  `id_akun` INT NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `dashboard_chart_jenis_grafik_check` CHECK (((jenis_grafik) IN ('batang_vertikal', 'batang_horizontal', 'donut', 'garis', 'area', 'radar', 'treemap'))),
  CONSTRAINT `dashboard_chart_urutan_check` CHECK ((urutan >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Per-account Studio Grafik charts (max 12). urutan orders them on the Dashboard.';

CREATE TABLE `disposisi` (
  `no` INT NOT NULL AUTO_INCREMENT,
  `id_proposal_dokumen` INT NULL,
  `no_dokumen_kerjasama` INT NULL,
  `jenis_disposisi` VARCHAR(30) NOT NULL,
  `round_ke` SMALLINT NOT NULL DEFAULT 1,
  `pesan_disposisi` TEXT NULL,
  `lampiran` VARCHAR(500) NULL,
  `id_akun_pengirim` INT NULL,
  `waktu_disposisi` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`no`),
  CONSTRAINT `disposisi_jenis_disposisi_check` CHECK (((jenis_disposisi) IN ('approval', 'renewal_request'))),
  CONSTRAINT `disposisi_subject_matches_kind` CHECK (((((jenis_disposisi) = 'approval') AND (id_proposal_dokumen IS NOT NULL)) OR (((jenis_disposisi) = 'renewal_request') AND (no_dokumen_kerjasama IS NOT NULL))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `disposisi_target` (
  `no` INT NOT NULL AUTO_INCREMENT,
  `no_disposisi` INT NOT NULL,
  `id_jabatan` INT NOT NULL,
  `tier` SMALLINT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'waiting',
  `waktu_unlock` DATETIME NULL,
  `waktu_resolusi` DATETIME NULL,
  `batas_waktu_sla` DATETIME NULL,
  `durasi_hari_kerja` DECIMAL(6,2) NULL,
  `status_sla` VARCHAR(20) NULL,
  PRIMARY KEY (`no`),
  CONSTRAINT `disposisi_target_status_check` CHECK (((status) IN ('waiting', 'pending_action', 'approved', 'rejected', 'removed'))),
  CONSTRAINT `disposisi_target_status_sla_check` CHECK (((status_sla) IN ('normal', 'yellow', 'red'))),
  CONSTRAINT `disposisi_target_tier_check` CHECK (((tier >= 1) AND (tier <= 3)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dokumen_kerja_sama` (
  `no` INT NOT NULL AUTO_INCREMENT,
  `id_proposal_dokumen` INT NOT NULL,
  `no_dokumen` VARCHAR(50) NULL,
  `tanggal_tanda_tangan` DATE NULL,
  `tanggal_mulai` DATE NULL,
  `tanggal_berakhir` DATE NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'Aktif',
  `alasan_arsip` VARCHAR(40) NULL,
  `upload_dokumen` VARCHAR(500) NULL COMMENT 'Path within the dokumen-kerjasama storage bucket. Either this or link_gdrive is enough to render a document link; neither is required.',
  `folder_kui` VARCHAR(100) NULL,
  `no_berkas_dikti` VARCHAR(100) NULL,
  `id_penandatangan_partner` INT NULL,
  `waktu_dibuat` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `link_gdrive` VARCHAR(500) NULL COMMENT 'A Google Drive share link, as an alternative to uploading the PDF here.',
  `pembaruan_dimulai_at` DATETIME NULL,
  PRIMARY KEY (`no`),
  UNIQUE KEY `dokumen_kerja_sama_id_proposal_dokumen_key` (`id_proposal_dokumen`),
  CONSTRAINT `arsip_needs_reason` CHECK ((((status) <> 'Diarsipkan') OR (alasan_arsip IS NOT NULL))),
  CONSTRAINT `dokumen_kerja_sama_alasan_arsip_check` CHECK (((alasan_arsip) IN ('rejected', 'expired_without_renewal', 'not_renewed', 'superseded_by_renewal', 'terminated_early'))),
  CONSTRAINT `dokumen_kerja_sama_status_check` CHECK (((status) IN ('Aktif', 'Akan Berakhir', 'Kedaluarsa', 'Diarsipkan')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  `waktu_evaluasi` DATETIME NULL,
  `waktu_dibuat` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `respondent_jabatan` VARCHAR(150) NULL,
  `respondent_hp` VARCHAR(30) NULL,
  PRIMARY KEY (`no`),
  CONSTRAINT `evaluasi_continuation_mode_check` CHECK (((continuation_mode) IN ('same_program', 'add_program'))),
  CONSTRAINT `evaluasi_exp_communication_check` CHECK (((exp_communication >= 1) AND (exp_communication <= 5))),
  CONSTRAINT `evaluasi_exp_productivity_check` CHECK (((exp_productivity >= 1) AND (exp_productivity <= 5))),
  CONSTRAINT `evaluasi_exp_quality_check` CHECK (((exp_quality >= 1) AND (exp_quality <= 5))),
  CONSTRAINT `evaluasi_exp_relevance_check` CHECK (((exp_relevance >= 1) AND (exp_relevance <= 5))),
  CONSTRAINT `evaluasi_exp_sustainability_check` CHECK (((exp_sustainability >= 1) AND (exp_sustainability <= 5))),
  CONSTRAINT `evaluasi_rekomendasi_check` CHECK (((rekomendasi) IN ('continue', 'terminate'))),
  CONSTRAINT `evaluasi_respondent_type_check` CHECK (((respondent_type) IN ('faculty', 'partner'))),
  CONSTRAINT `evaluasi_sat_communication_check` CHECK (((sat_communication >= 1) AND (sat_communication <= 5))),
  CONSTRAINT `evaluasi_sat_productivity_check` CHECK (((sat_productivity >= 1) AND (sat_productivity <= 5))),
  CONSTRAINT `evaluasi_sat_quality_check` CHECK (((sat_quality >= 1) AND (sat_quality <= 5))),
  CONSTRAINT `evaluasi_sat_relevance_check` CHECK (((sat_relevance >= 1) AND (sat_relevance <= 5))),
  CONSTRAINT `evaluasi_sat_sustainability_check` CHECK (((sat_sustainability >= 1) AND (sat_sustainability <= 5))),
  CONSTRAINT `evaluasi_status_check` CHECK (((status) IN ('pending', 'submitted', 'superseded'))),
  CONSTRAINT `evaluasi_submitted_has_recommendation` CHECK ((((status) <> 'submitted') OR (rekomendasi IS NOT NULL)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `holidays` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tanggal` DATE NOT NULL,
  `keterangan` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `holidays_tanggal_key` (`tanggal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `implementasi_dokumen` (
  `no` INT NOT NULL AUTO_INCREMENT,
  `no_dokumen_kerjasama` INT NOT NULL,
  `jenis` VARCHAR(20) NOT NULL,
  `judul` VARCHAR(200) NOT NULL,
  `deskripsi` TEXT NULL,
  `tanggal` DATE NOT NULL,
  `berkas` VARCHAR(500) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
  `id_akun_pembuat` INT NOT NULL,
  `waktu_dibuat` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`no`),
  CONSTRAINT `implementasi_dokumen_jenis_check` CHECK (((jenis) IN ('arrangement', 'report'))),
  CONSTRAINT `implementasi_dokumen_status_check` CHECK (((status) IN ('draft', 'submitted', 'verified')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Implementation Arrangement (the agreed plan) and Implementation Report (the realization), for a signed cooperation document. Read-only in the app for now: the Implementasi tab lists it, the Realization Form project writes it.';

CREATE TABLE `jabatan` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(150) NOT NULL,
  `id_unit` INT NOT NULL,
  `tier_disposisi` SMALLINT NULL,
  `id_pegawai` INT NULL COMMENT 'The named contact currently holding/reachable for this position. Nullable -- not every jabatan has one on file. Assigning this is what "automatically includes" Nama Kontak/No.HP wherever the jabatan is shown (e.g. Unit Pengusul on the Kerja Sama Aktif report) -- the jabatan itself is looked up once, not copied per document.',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `kepala_unit` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  CONSTRAINT `jabatan_tier_disposisi_check` CHECK (((tier_disposisi >= 1) AND (tier_disposisi <= 3)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `jenis_mitra` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(150) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `jenis_mitra_nama_key` (`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `jenis_unit` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `jenis` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `jenis_unit_jenis_key` (`jenis`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `keputusan_pembaruan` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_dokumen_kerjasama` INT NOT NULL,
  `keputusan` VARCHAR(20) NOT NULL,
  `alasan` TEXT NOT NULL,
  `id_akun` INT NOT NULL,
  `waktu` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_berlaku` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `keputusan_pembaruan_keputusan_check` CHECK (((keputusan) IN ('continue', 'terminate')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `managed_options` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `option_group` VARCHAR(30) NOT NULL,
  `value` VARCHAR(1000) NOT NULL,
  `usage_count` INT NOT NULL DEFAULT 0,
  `id_merged_into` INT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `managed_options_option_group_check` CHECK (((option_group) = 'jabatan_freetext'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `manfaat_mitra` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nilai` VARCHAR(1000) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `manfaat_mitra_nilai_key` (`nilai`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `manfaat_petra` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nilai` VARCHAR(1000) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `manfaat_petra_nilai_key` (`nilai`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `negara` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `kode` VARCHAR(3) NOT NULL,
  `nama` VARCHAR(100) NOT NULL,
  `is_domestic` TINYINT(1) NOT NULL DEFAULT 0,
  `latitude` DECIMAL(9,6) NULL,
  `longitude` DECIMAL(9,6) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `negara_kode_key` (`kode`),
  UNIQUE KEY `negara_nama_key` (`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notifikasi` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_proposal_dokumen` INT NULL,
  `no_dokumen_kerjasama` INT NULL,
  `id_jabatan_penerima` INT NULL,
  `jenis_notifikasi` VARCHAR(50) NOT NULL,
  `isi` TEXT NULL,
  `waktu_kirim` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `waktu_dibaca` DATETIME NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `id_disposisi_target` INT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `notifikasi_status_check` CHECK (((status) IN ('pending', 'sent', 'failed', 'read')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `partner_contact` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_partner` INT NOT NULL,
  `nama` VARCHAR(150) NOT NULL,
  `jabatan` VARCHAR(150) NULL,
  `email` VARCHAR(150) NULL,
  `no_telp` VARCHAR(30) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `partner_eval_token` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_evaluasi` INT NOT NULL,
  `token` CHAR(64) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `id_akun_pengirim` INT NULL,
  `waktu_kirim` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `waktu_submit` DATETIME NULL,
  `waktu_reopen` DATETIME NULL,
  `id_akun_reopen` INT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `partner_eval_token_token_key` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RLS enabled with NO policy, deliberately: no logged-in account reads this table. A partner token is resolved by an Edge Function on the service role, scoped to exactly one evaluasi and exposing nothing else (AR-07).';

CREATE TABLE `partner_pengusul` (
  `id_partner` INT NOT NULL,
  `id_proposal_dokumen` INT NOT NULL,
  `is_lead` TINYINT(1) NOT NULL DEFAULT 0,
  -- Stands in for a Postgres partial unique index: one lead partner per proposal.
  -- MySQL has no partial index, but it does treat NULLs in a unique index as
  -- distinct, so a column that is NULL for the excluded rows is exact.
  `lead_key` INT GENERATED ALWAYS AS (IF(`is_lead` = 1, `id_proposal_dokumen`, NULL)) VIRTUAL,
  PRIMARY KEY (`id_partner`, `id_proposal_dokumen`),
  UNIQUE KEY `partner_pengusul_one_lead_idx` (`lead_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pegawai` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(150) NOT NULL,
  `email` VARCHAR(255) NULL,
  `no_hp` VARCHAR(30) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `penandatangan_partner` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_partner` INT NOT NULL,
  `no_dokumen_kerjasama` INT NOT NULL,
  `nama` VARCHAR(150) NOT NULL,
  `jabatan` VARCHAR(150) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `penandatangan_petra` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `no_dokumen_kerjasama` INT NOT NULL,
  `nama` VARCHAR(150) NOT NULL,
  `jabatan` VARCHAR(150) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pending_periods` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_proposal_dokumen` INT NOT NULL,
  `mulai` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `selesai` DATETIME NULL,
  `id_disposisi_target_pemicu` INT NULL,
  `id_akun_reaktivasi` INT NULL,
  -- Stands in for a Postgres partial unique index: one open pending period per proposal.
  -- MySQL has no partial index, but it does treat NULLs in a unique index as
  -- distinct, so a column that is NULL for the excluded rows is exact.
  `open_key` INT GENERATED ALWAYS AS (IF(`selesai` IS NULL, `id_proposal_dokumen`, NULL)) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pending_periods_one_open_idx` (`open_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pengusul` (
  `id_jabatan` INT NOT NULL,
  `id_proposal_dokumen` INT NOT NULL,
  PRIMARY KEY (`id_jabatan`, `id_proposal_dokumen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  `id_dokumen_sebelumnya` INT NULL COMMENT 'Set on a Perpanjangan proposal. Its presence IS the renewal flag.',
  `id_akun_pembuat` INT NOT NULL,
  `waktu_dibuat` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `waktu_proposal_dokumen` DATETIME NULL,
  `waktu_disetujui` DATETIME NULL,
  `waktu_aktif` DATETIME NULL,
  `status_sla` VARCHAR(30) NULL,
  `is_pencatatan_langsung` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'True when KUI typed an already-signed document straight in, with no Ajukan and no disposisi. Status is Disetujui like any activated document; this column is what suppresses the approval panels and what reporting filters on.',
  PRIMARY KEY (`id`),
  CONSTRAINT `proposal_dokumen_sifat_periode_kerjasama_check` CHECK (((sifat_periode_kerjasama) IN ('Kedua Belah Pihak', 'Auto Renewed'))),
  CONSTRAINT `proposal_dokumen_status_proposal_check` CHECK (((status_proposal) IN ('Draft', 'Diajukan', 'Diproses', 'Disposisi - Tier 1', 'Disposisi - Tier 2', 'Disposisi - Tier 3', 'Pending', 'Disetujui', 'Siap TTD', 'Ditolak')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `proposal_dokumen_agenda` (
  `id_proposal_dokumen` INT NOT NULL,
  `id_agenda` INT NOT NULL,
  PRIMARY KEY (`id_proposal_dokumen`, `id_agenda`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `proposal_dokumen_bidang` (
  `id_proposal_dokumen` INT NOT NULL,
  `id_bidang_kerjasama` INT NOT NULL,
  PRIMARY KEY (`id_proposal_dokumen`, `id_bidang_kerjasama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `proposal_dokumen_moa` (
  `id_proposal_dokumen` INT NOT NULL,
  `hak_petra` TEXT NOT NULL,
  `hak_calon_mitra` TEXT NOT NULL,
  `kewajiban_petra` TEXT NOT NULL,
  `kewajiban_calon_mitra` TEXT NOT NULL,
  PRIMARY KEY (`id_proposal_dokumen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `proposal_dokumen_mou` (
  `id_proposal_dokumen` INT NOT NULL,
  `ringkasan_kegiatan` TEXT NOT NULL,
  PRIMARY KEY (`id_proposal_dokumen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `proposal_dokumen_sdg` (
  `id_proposal_dokumen` INT NOT NULL,
  `nomor_sdg` INT NOT NULL,
  PRIMARY KEY (`id_proposal_dokumen`, `nomor_sdg`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `proposal_dokumen_unit` (
  `id_proposal_dokumen` INT NOT NULL,
  `id_unit` INT NOT NULL,
  PRIMARY KEY (`id_proposal_dokumen`, `id_unit`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `proposal_status_history` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_proposal_dokumen` INT NOT NULL,
  `status_lama` VARCHAR(30) NULL,
  `status_baru` VARCHAR(30) NOT NULL,
  `waktu` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `id_akun` INT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `revisi_proposal` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_proposal_dokumen` INT NOT NULL,
  `file_proposal` VARCHAR(500) NOT NULL,
  `id_akun_pengunggah` INT NOT NULL,
  `id_disposisi_target_peminta` INT NULL,
  `catatan` TEXT NULL,
  `waktu_unggah` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `riwayat_approval` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_disposisi_target` INT NULL,
  `id_proposal_dokumen` INT NULL,
  `id_akun` INT NULL,
  `aksi` VARCHAR(50) NOT NULL,
  `catatan` TEXT NULL,
  `tanggal` DATE NOT NULL DEFAULT (CURRENT_DATE),
  `waktu` TIME NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `riwayat_has_subject` CHECK (((id_disposisi_target IS NOT NULL) OR (id_proposal_dokumen IS NOT NULL)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Append-only approval history / audit feed.';

CREATE TABLE `sdg` (
  `nomor` INT NOT NULL,
  `nama` VARCHAR(100) NOT NULL,
  `warna` CHAR(7) NOT NULL,
  PRIMARY KEY (`nomor`),
  CONSTRAINT `sdg_nomor_check` CHECK (((nomor >= 1) AND (nomor <= 17)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='The 17 UN Sustainable Development Goals. Fixed by the UN, so this table has a read policy and deliberately no write policy -- not even for io_admin.';

CREATE TABLE `settings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(100) NOT NULL,
  `value` TEXT NOT NULL,
  `updated_by` INT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `settings_key_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tujuan_kerjasama` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nilai` VARCHAR(1000) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tujuan_kerjasama_nilai_key` (`nilai`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `unit` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(150) NOT NULL,
  `id_parent_unit` INT NULL,
  `id_jenis_unit` INT NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `unit_not_own_parent` CHECK (((id_parent_unit IS NULL) OR (id_parent_unit <> id)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 2. FOREIGN KEYS
-- =====================================================================

ALTER TABLE `akun` ADD CONSTRAINT `akun_id_jabatan_fkey`
  FOREIGN KEY (`id_jabatan`) REFERENCES `jabatan` (`id`);
ALTER TABLE `dashboard_chart` ADD CONSTRAINT `dashboard_chart_id_akun_fkey`
  FOREIGN KEY (`id_akun`) REFERENCES `akun` (`id`) ON DELETE CASCADE;
ALTER TABLE `disposisi` ADD CONSTRAINT `disposisi_id_akun_pengirim_fkey`
  FOREIGN KEY (`id_akun_pengirim`) REFERENCES `akun` (`id`);
ALTER TABLE `disposisi` ADD CONSTRAINT `disposisi_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`);
ALTER TABLE `disposisi` ADD CONSTRAINT `disposisi_no_dokumen_kerjasama_fkey`
  FOREIGN KEY (`no_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`);
ALTER TABLE `disposisi_target` ADD CONSTRAINT `disposisi_target_id_jabatan_fkey`
  FOREIGN KEY (`id_jabatan`) REFERENCES `jabatan` (`id`);
ALTER TABLE `disposisi_target` ADD CONSTRAINT `disposisi_target_no_disposisi_fkey`
  FOREIGN KEY (`no_disposisi`) REFERENCES `disposisi` (`no`) ON DELETE CASCADE;
ALTER TABLE `dokumen_kerja_sama` ADD CONSTRAINT `dokumen_kerja_sama_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`);
ALTER TABLE `dokumen_kerja_sama` ADD CONSTRAINT `dokumen_penandatangan_partner_fk`
  FOREIGN KEY (`id_penandatangan_partner`) REFERENCES `penandatangan_partner` (`id`);
ALTER TABLE `evaluasi` ADD CONSTRAINT `evaluasi_id_dokumen_kerjasama_fkey`
  FOREIGN KEY (`id_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`);
ALTER TABLE `evaluasi` ADD CONSTRAINT `evaluasi_id_jabatan_pengusul_fkey`
  FOREIGN KEY (`id_jabatan_pengusul`) REFERENCES `jabatan` (`id`);
ALTER TABLE `evaluasi` ADD CONSTRAINT `evaluasi_id_partner_contact_fkey`
  FOREIGN KEY (`id_partner_contact`) REFERENCES `partner_contact` (`id`);
ALTER TABLE `evaluasi` ADD CONSTRAINT `evaluasi_id_supersedes_fkey`
  FOREIGN KEY (`id_supersedes`) REFERENCES `evaluasi` (`no`);
ALTER TABLE `implementasi_dokumen` ADD CONSTRAINT `implementasi_dokumen_id_akun_pembuat_fkey`
  FOREIGN KEY (`id_akun_pembuat`) REFERENCES `akun` (`id`);
ALTER TABLE `implementasi_dokumen` ADD CONSTRAINT `implementasi_dokumen_no_dokumen_kerjasama_fkey`
  FOREIGN KEY (`no_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`) ON DELETE CASCADE;
ALTER TABLE `jabatan` ADD CONSTRAINT `jabatan_id_pegawai_fkey`
  FOREIGN KEY (`id_pegawai`) REFERENCES `pegawai` (`id`);
ALTER TABLE `jabatan` ADD CONSTRAINT `jabatan_id_unit_fkey`
  FOREIGN KEY (`id_unit`) REFERENCES `unit` (`id`);
ALTER TABLE `keputusan_pembaruan` ADD CONSTRAINT `keputusan_pembaruan_id_akun_fkey`
  FOREIGN KEY (`id_akun`) REFERENCES `akun` (`id`);
ALTER TABLE `keputusan_pembaruan` ADD CONSTRAINT `keputusan_pembaruan_id_dokumen_kerjasama_fkey`
  FOREIGN KEY (`id_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`);
ALTER TABLE `managed_options` ADD CONSTRAINT `managed_options_id_merged_into_fkey`
  FOREIGN KEY (`id_merged_into`) REFERENCES `managed_options` (`id`);
ALTER TABLE `notifikasi` ADD CONSTRAINT `notifikasi_id_disposisi_target_fkey`
  FOREIGN KEY (`id_disposisi_target`) REFERENCES `disposisi_target` (`no`);
ALTER TABLE `notifikasi` ADD CONSTRAINT `notifikasi_id_jabatan_penerima_fkey`
  FOREIGN KEY (`id_jabatan_penerima`) REFERENCES `jabatan` (`id`);
ALTER TABLE `notifikasi` ADD CONSTRAINT `notifikasi_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`);
ALTER TABLE `notifikasi` ADD CONSTRAINT `notifikasi_no_dokumen_kerjasama_fkey`
  FOREIGN KEY (`no_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`);
ALTER TABLE `partner` ADD CONSTRAINT `partner_id_jenis_mitra_fkey`
  FOREIGN KEY (`id_jenis_mitra`) REFERENCES `jenis_mitra` (`id`);
ALTER TABLE `partner` ADD CONSTRAINT `partner_id_merged_into_fkey`
  FOREIGN KEY (`id_merged_into`) REFERENCES `partner` (`id`);
ALTER TABLE `partner` ADD CONSTRAINT `partner_id_negara_fkey`
  FOREIGN KEY (`id_negara`) REFERENCES `negara` (`id`);
ALTER TABLE `partner` ADD CONSTRAINT `partner_primary_contact_fk`
  FOREIGN KEY (`id_partner_contact`) REFERENCES `partner_contact` (`id`);
ALTER TABLE `partner_contact` ADD CONSTRAINT `partner_contact_id_partner_fkey`
  FOREIGN KEY (`id_partner`) REFERENCES `partner` (`id`);
ALTER TABLE `partner_eval_token` ADD CONSTRAINT `partner_eval_token_id_akun_pengirim_fkey`
  FOREIGN KEY (`id_akun_pengirim`) REFERENCES `akun` (`id`);
ALTER TABLE `partner_eval_token` ADD CONSTRAINT `partner_eval_token_id_akun_reopen_fkey`
  FOREIGN KEY (`id_akun_reopen`) REFERENCES `akun` (`id`);
ALTER TABLE `partner_eval_token` ADD CONSTRAINT `partner_eval_token_id_evaluasi_fkey`
  FOREIGN KEY (`id_evaluasi`) REFERENCES `evaluasi` (`no`);
ALTER TABLE `partner_pengusul` ADD CONSTRAINT `partner_pengusul_id_partner_fkey`
  FOREIGN KEY (`id_partner`) REFERENCES `partner` (`id`);
ALTER TABLE `partner_pengusul` ADD CONSTRAINT `partner_pengusul_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE;
ALTER TABLE `penandatangan_partner` ADD CONSTRAINT `penandatangan_partner_id_partner_fkey`
  FOREIGN KEY (`id_partner`) REFERENCES `partner` (`id`);
ALTER TABLE `penandatangan_partner` ADD CONSTRAINT `penandatangan_partner_no_dokumen_kerjasama_fkey`
  FOREIGN KEY (`no_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`) ON DELETE CASCADE;
ALTER TABLE `penandatangan_petra` ADD CONSTRAINT `penandatangan_petra_no_dokumen_kerjasama_fkey`
  FOREIGN KEY (`no_dokumen_kerjasama`) REFERENCES `dokumen_kerja_sama` (`no`) ON DELETE CASCADE;
ALTER TABLE `pending_periods` ADD CONSTRAINT `pending_periods_id_akun_reaktivasi_fkey`
  FOREIGN KEY (`id_akun_reaktivasi`) REFERENCES `akun` (`id`);
ALTER TABLE `pending_periods` ADD CONSTRAINT `pending_periods_id_disposisi_target_pemicu_fkey`
  FOREIGN KEY (`id_disposisi_target_pemicu`) REFERENCES `disposisi_target` (`no`);
ALTER TABLE `pending_periods` ADD CONSTRAINT `pending_periods_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`);
ALTER TABLE `pengusul` ADD CONSTRAINT `pengusul_id_jabatan_fkey`
  FOREIGN KEY (`id_jabatan`) REFERENCES `jabatan` (`id`);
ALTER TABLE `pengusul` ADD CONSTRAINT `pengusul_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE;
ALTER TABLE `proposal_dokumen` ADD CONSTRAINT `proposal_dokumen_id_akun_pembuat_fkey`
  FOREIGN KEY (`id_akun_pembuat`) REFERENCES `akun` (`id`);
ALTER TABLE `proposal_dokumen` ADD CONSTRAINT `proposal_dokumen_id_dokumen_sebelumnya_fkey`
  FOREIGN KEY (`id_dokumen_sebelumnya`) REFERENCES `proposal_dokumen` (`id`);
ALTER TABLE `proposal_dokumen_agenda` ADD CONSTRAINT `proposal_dokumen_agenda_id_agenda_fkey`
  FOREIGN KEY (`id_agenda`) REFERENCES `agenda` (`id`);
ALTER TABLE `proposal_dokumen_agenda` ADD CONSTRAINT `proposal_dokumen_agenda_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE;
ALTER TABLE `proposal_dokumen_bidang` ADD CONSTRAINT `proposal_dokumen_bidang_id_bidang_kerjasama_fkey`
  FOREIGN KEY (`id_bidang_kerjasama`) REFERENCES `bidang_kerjasama` (`id`);
ALTER TABLE `proposal_dokumen_bidang` ADD CONSTRAINT `proposal_dokumen_bidang_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE;
ALTER TABLE `proposal_dokumen_moa` ADD CONSTRAINT `proposal_dokumen_moa_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE;
ALTER TABLE `proposal_dokumen_mou` ADD CONSTRAINT `proposal_dokumen_mou_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE;
ALTER TABLE `proposal_dokumen_sdg` ADD CONSTRAINT `proposal_dokumen_sdg_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE;
ALTER TABLE `proposal_dokumen_sdg` ADD CONSTRAINT `proposal_dokumen_sdg_nomor_sdg_fkey`
  FOREIGN KEY (`nomor_sdg`) REFERENCES `sdg` (`nomor`);
ALTER TABLE `proposal_dokumen_unit` ADD CONSTRAINT `proposal_dokumen_unit_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`) ON DELETE CASCADE;
ALTER TABLE `proposal_dokumen_unit` ADD CONSTRAINT `proposal_dokumen_unit_id_unit_fkey`
  FOREIGN KEY (`id_unit`) REFERENCES `unit` (`id`);
ALTER TABLE `proposal_status_history` ADD CONSTRAINT `proposal_status_history_id_akun_fkey`
  FOREIGN KEY (`id_akun`) REFERENCES `akun` (`id`);
ALTER TABLE `proposal_status_history` ADD CONSTRAINT `proposal_status_history_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`);
ALTER TABLE `revisi_proposal` ADD CONSTRAINT `revisi_proposal_id_akun_pengunggah_fkey`
  FOREIGN KEY (`id_akun_pengunggah`) REFERENCES `akun` (`id`);
ALTER TABLE `revisi_proposal` ADD CONSTRAINT `revisi_proposal_id_disposisi_target_peminta_fkey`
  FOREIGN KEY (`id_disposisi_target_peminta`) REFERENCES `disposisi_target` (`no`);
ALTER TABLE `revisi_proposal` ADD CONSTRAINT `revisi_proposal_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`);
ALTER TABLE `riwayat_approval` ADD CONSTRAINT `riwayat_approval_id_akun_fkey`
  FOREIGN KEY (`id_akun`) REFERENCES `akun` (`id`);
ALTER TABLE `riwayat_approval` ADD CONSTRAINT `riwayat_approval_id_disposisi_target_fkey`
  FOREIGN KEY (`id_disposisi_target`) REFERENCES `disposisi_target` (`no`);
ALTER TABLE `riwayat_approval` ADD CONSTRAINT `riwayat_approval_id_proposal_dokumen_fkey`
  FOREIGN KEY (`id_proposal_dokumen`) REFERENCES `proposal_dokumen` (`id`);
ALTER TABLE `settings` ADD CONSTRAINT `settings_updated_by_fkey`
  FOREIGN KEY (`updated_by`) REFERENCES `akun` (`id`);
ALTER TABLE `unit` ADD CONSTRAINT `unit_id_jenis_unit_fkey`
  FOREIGN KEY (`id_jenis_unit`) REFERENCES `jenis_unit` (`id`);
ALTER TABLE `unit` ADD CONSTRAINT `unit_id_parent_unit_fkey`
  FOREIGN KEY (`id_parent_unit`) REFERENCES `unit` (`id`);

-- =====================================================================
-- 3. SECONDARY INDEXES
-- =====================================================================

CREATE INDEX `akun_jabatan_idx` ON `akun` (`id_jabatan`);
CREATE INDEX `dashboard_chart_akun_idx` ON `dashboard_chart` (`id_akun`, `urutan`);
CREATE INDEX `disposisi_proposal_idx` ON `disposisi` (`id_proposal_dokumen`, `round_ke`);
CREATE INDEX `disposisi_dokumen_idx` ON `disposisi` (`no_dokumen_kerjasama`);
CREATE INDEX `disposisi_jenis_idx` ON `disposisi` (`jenis_disposisi`);
CREATE INDEX `disposisi_target_disposisi_idx` ON `disposisi_target` (`no_disposisi`);
CREATE INDEX `disposisi_target_jabatan_idx` ON `disposisi_target` (`id_jabatan`, `status`);
CREATE INDEX `disposisi_target_pending_idx` ON `disposisi_target` (`status`);
CREATE INDEX `dokumen_status_berakhir_idx` ON `dokumen_kerja_sama` (`status`, `tanggal_berakhir`);
CREATE INDEX `evaluasi_dokumen_idx` ON `evaluasi` (`id_dokumen_kerjasama`, `respondent_type`, `status`);
CREATE INDEX `implementasi_dokumen_idx` ON `implementasi_dokumen` (`no_dokumen_kerjasama`, `jenis`, `tanggal` DESC);
CREATE INDEX `jabatan_tier_idx` ON `jabatan` (`tier_disposisi`);
CREATE INDEX `jabatan_unit_idx` ON `jabatan` (`id_unit`);
CREATE INDEX `keputusan_pembaruan_dokumen_idx` ON `keputusan_pembaruan` (`id_dokumen_kerjasama`);
CREATE INDEX `managed_options_group_idx` ON `managed_options` (`option_group`);
CREATE INDEX `notifikasi_penerima_idx` ON `notifikasi` (`id_jabatan_penerima`, `waktu_kirim` DESC);
CREATE UNIQUE INDEX `notifikasi_sekali_per_target_idx` ON `notifikasi` (`id_disposisi_target`, `jenis_notifikasi`, `id_jabatan_penerima`);
CREATE INDEX `partner_negara_idx` ON `partner` (`id_negara`);
CREATE INDEX `partner_intl_idx` ON `partner` (`is_international`);
CREATE INDEX `partner_contact_partner_idx` ON `partner_contact` (`id_partner`);
CREATE INDEX `partner_eval_token_evaluasi_idx` ON `partner_eval_token` (`id_evaluasi`);
CREATE INDEX `pending_periods_proposal_idx` ON `pending_periods` (`id_proposal_dokumen`);
CREATE INDEX `proposal_status_idx` ON `proposal_dokumen` (`status_proposal`);
CREATE INDEX `proposal_pembuat_idx` ON `proposal_dokumen` (`id_akun_pembuat`);
CREATE INDEX `proposal_sebelumnya_idx` ON `proposal_dokumen` (`id_dokumen_sebelumnya`);
CREATE INDEX `proposal_status_history_proposal_idx` ON `proposal_status_history` (`id_proposal_dokumen`, `waktu`);
CREATE INDEX `revisi_proposal_idx` ON `revisi_proposal` (`id_proposal_dokumen`, `waktu_unggah`);
CREATE INDEX `riwayat_target_idx` ON `riwayat_approval` (`id_disposisi_target`);
CREATE INDEX `riwayat_proposal_idx` ON `riwayat_approval` (`id_proposal_dokumen`, `tanggal`, `waktu`);
CREATE INDEX `unit_parent_idx` ON `unit` (`id_parent_unit`);

-- =====================================================================
-- 4. VIEWS (the two that translate faithfully)
-- =====================================================================

-- v_peta_mitra — partner count per country, for the dashboard map.
CREATE OR REPLACE VIEW `v_peta_mitra` AS
SELECT n.`id`, n.`nama`, n.`kode`, n.`latitude`, n.`longitude`, n.`is_domestic`,
       COUNT(DISTINCT p.`id`)                   AS `jumlah_mitra`,
       COUNT(DISTINCT pp.`id_proposal_dokumen`) AS `jumlah_dokumen`
  FROM `negara` n
  JOIN `partner` p          ON p.`id_negara` = n.`id` AND p.`is_active` = 1
  LEFT JOIN `partner_pengusul` pp ON pp.`id_partner` = p.`id`
 WHERE n.`latitude` IS NOT NULL AND n.`longitude` IS NOT NULL
 GROUP BY n.`id`, n.`nama`, n.`kode`, n.`latitude`, n.`longitude`, n.`is_domestic`;

-- v_unit_delay_breakdown — how long each unit's in-flight documents have waited.
-- EXTRACT(epoch FROM a - b) has no MySQL equivalent, so it becomes
-- TIMESTAMPDIFF(SECOND, b, a); the result is identical.
CREATE OR REPLACE VIEW `v_unit_delay_breakdown` AS
SELECT u.`id`   AS `id_unit`,
       u.`nama` AS `unit`,
       COUNT(DISTINCT p.`id`) AS `dokumen_tertahan`,
       ROUND(AVG(TIMESTAMPDIFF(SECOND, p.`waktu_proposal_dokumen`, NOW()) / 86400.0), 1) AS `rata_rata_hari`
  FROM `proposal_dokumen` p
  JOIN `pengusul` pg ON pg.`id_proposal_dokumen` = p.`id`
  JOIN `jabatan`  j  ON j.`id` = pg.`id_jabatan`
  JOIN `unit`     u  ON u.`id` = j.`id_unit`
 WHERE p.`status_proposal` IN ('Diajukan', 'Diproses', 'Disposisi - Tier 1',
                               'Disposisi - Tier 2', 'Disposisi - Tier 3', 'Pending')
 GROUP BY u.`id`, u.`nama`
 ORDER BY `rata_rata_hari` DESC;

SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;
SET SQL_MODE = @OLD_SQL_MODE;
