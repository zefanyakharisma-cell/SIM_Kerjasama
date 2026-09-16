-- Schema v3 §2 — master data.
-- Ported from the MySQL .mwb model: INT AUTO_INCREMENT -> identity,
-- TINYINT(1) -> boolean, DATETIME -> timestamptz. Indonesian names kept (EC-09).

-- 2.1 negara ---------------------------------------------------------------
create table negara (
  id          int generated always as identity primary key,
  kode        varchar(3)   not null unique,
  nama        varchar(100) not null unique,
  -- The canonical domestic/international source. Never compare country names (BR-16).
  is_domestic boolean      not null default false
);

-- 2.2 jenis_unit -----------------------------------------------------------
create table jenis_unit (
  id    int generated always as identity primary key,
  jenis varchar(100) not null unique   -- 'Unit Akademik' / 'Unit Pembantu'
);

-- 2.3 unit -----------------------------------------------------------------
-- One self-referential tree of arbitrary depth (Faculty -> Prodi -> Program).
-- Merges the .mwb's parent_unit + unit (schema v3 override 3).
create table unit (
  id             int generated always as identity primary key,
  nama           varchar(150) not null,
  id_parent_unit int references unit (id),
  id_jenis_unit  int not null references jenis_unit (id),
  is_active      boolean not null default true,
  constraint unit_not_own_parent check (id_parent_unit is null or id_parent_unit <> id)
);
create index unit_parent_idx on unit (id_parent_unit);

-- 2.4 jabatan --------------------------------------------------------------
create table jabatan (
  id             int generated always as identity primary key,
  nama           varchar(150) not null,
  id_unit        int not null references unit (id),
  -- 1-3, or NULL for a non-approver position. Stored explicitly, never inferred
  -- from nama: "Kepala Bagian Sekretariat Rektorat" is tier 1 while every other
  -- "Kepala" is tier 2 (BR-15, BR-16).
  tier_disposisi smallint check (tier_disposisi between 1 and 3)
);
create index jabatan_tier_idx on jabatan (tier_disposisi);
create index jabatan_unit_idx on jabatan (id_unit);

-- 2.5 akun -----------------------------------------------------------------
-- Role-based login accounts: the account IS the position, so an office-holder
-- change needs no data change and the audit identifies positions, not people
-- (DR-06). Replaces the .mwb's pegawai.
--
-- Deviation from schema v3 §2.5: no `password` column. Supabase Auth owns
-- credentials; akun carries the authorization identity and joins to auth.users.
create table akun (
  id           int generated always as identity primary key,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  id_jabatan   int not null references jabatan (id),
  email        varchar(150) not null unique,   -- role email, e.g. dekan-fti@petra.ac.id
  role         varchar(30)  not null check (role in ('submitter','io_staff','io_admin','viewer')),
  is_active    boolean not null default true
);
create index akun_jabatan_idx on akun (id_jabatan);
comment on column akun.role is
  'What this account may do. "Approver" is never stored here: it is derived per
   document from an open disposisi_target matching id_jabatan (AR-01).';

-- 2.6 / 2.7 partner + contact ---------------------------------------------
create table partner (
  id                 int generated always as identity primary key,
  nama               varchar(200) not null,
  is_international   boolean not null,             -- set from negara.is_domestic (DR-07)
  id_negara          int not null references negara (id),
  kota               varchar(100),
  alamat             varchar(255),
  no_telp            varchar(30),
  homepage           varchar(255),                 -- also used for duplicate detection
  afiliasi_group     varchar(150),
  jaringan_bisnis    varchar(150),                 -- open item O5: free text for now
  jenis_bisnis       varchar(150),
  informasi_tambahan text,
  id_partner_contact int,                          -- FK added below (circular)
  latitude           numeric(9,6),                 -- Peta Mitra Global; geocoded
  longitude          numeric(9,6),
  id_merged_into     int references partner (id),  -- set when merged away (BR-14)
  is_active          boolean not null default true
);
create index partner_negara_idx on partner (id_negara);
create index partner_intl_idx on partner (is_international) where is_active;

create table partner_contact (
  id         int generated always as identity primary key,
  id_partner int not null references partner (id),
  nama       varchar(150) not null,
  jabatan    varchar(150),        -- free text: partner titles are not in our master
  email      varchar(150),
  no_telp    varchar(30)
);
create index partner_contact_partner_idx on partner_contact (id_partner);
alter table partner add constraint partner_primary_contact_fk
  foreign key (id_partner_contact) references partner_contact (id);

-- 2.8 / 2.9 agenda + bidang ------------------------------------------------
create table agenda (
  id           int generated always as identity primary key,
  nama         varchar(200) not null unique,
  -- Flags "Adendum/Amandemen" so the addendum path is detected without
  -- string-matching Indonesian text (BR-16).
  is_amendment boolean not null default false
);

create table bidang_kerjasama (
  id   int generated always as identity primary key,
  nama varchar(50) not null unique
);

-- 2.10 managed_options -----------------------------------------------------
-- Backs the grow-then-reuse dropdowns. New values publish immediately; the
-- admin area deactivates or merges, never deletes while referenced (BR-23).
create table managed_options (
  id             int generated always as identity primary key,
  option_group   varchar(30) not null
                 check (option_group in ('tujuan','manfaat_petra','manfaat_mitra','jabatan_freetext')),
  value          varchar(1000) not null,
  usage_count    int not null default 0,
  id_merged_into int references managed_options (id),
  is_active      boolean not null default true
);
create index managed_options_group_idx on managed_options (option_group) where is_active;

-- 2.11 settings ------------------------------------------------------------
-- Every threshold comes from here; no magic 2/4/6/30/60/90 in code (DR-04).
create table settings (
  id         int generated always as identity primary key,
  key        varchar(100) not null unique,
  value      text not null,
  updated_by int references akun (id),
  updated_at timestamptz not null default now()
);

-- 2.12 holidays ------------------------------------------------------------
-- Required for business-day SLA counting; an empty table must warn, never
-- silently count calendar days (BR-19).
create table holidays (
  id         int generated always as identity primary key,
  tanggal    date not null unique,
  keterangan varchar(255)
);

-- 2.13 dashboard_chart -----------------------------------------------------
create table dashboard_chart (
  id              int generated always as identity primary key,
  judul           varchar(150) not null,
  jenis_grafik    varchar(20) not null check (jenis_grafik in
                  ('batang_vertikal','batang_horizontal','donut','garis','area','radar','treemap')),
  config          jsonb not null,   -- grouping, metric, stack, ordering, max categories, Filter Data
  urutan          smallint not null check (urutan between 1 and 5),
  is_visible      boolean not null default true,
  id_akun_pembuat int references akun (id)
);
