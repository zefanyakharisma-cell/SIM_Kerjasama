-- Schema v3 §3 — proposal core, and §4 — the active document.

create type jenis_kerjasama_t as enum ('MoU', 'MoA');

-- 3.1 proposal_dokumen -----------------------------------------------------
create table proposal_dokumen (
  id                       int generated always as identity primary key,
  jenis_kerjasama          jenis_kerjasama_t not null,
  periode_kerjasama        varchar(50),                  -- e.g. "5 Tahun"
  sifat_periode_kerjasama  varchar(45)
                           check (sifat_periode_kerjasama in ('Kedua Belah Pihak','Auto Renewed')),
  -- The literal UI vocabulary (schema v3 §3.2). recompute_tiers is the single
  -- writer of the "Disposisi - Tier N" values, so the surfaced tier and the open
  -- targets can never disagree (EC-07).
  status_proposal          varchar(30) not null default 'Draft'
                           check (status_proposal in (
                             'Draft','Diajukan','Diproses',
                             'Disposisi - Tier 1','Disposisi - Tier 2','Disposisi - Tier 3',
                             'Pending','Disetujui','Ditolak')),
  tujuan_kerjasama         text,        -- sourced from managed_options, stored denormalized
  manfaat_bagi_petra       text,
  manfaat_bagi_mitra       text,        -- a single shared value even on multi-partner (Q1)
  informasi_tambahan       text,
  file_draft               varchar(500),-- current draft; overwritten in place (BR-07)
  id_dokumen_sebelumnya    int references proposal_dokumen (id),  -- predecessor on a Perpanjangan
  id_akun_pembuat          int not null references akun (id),
  waktu_dibuat             timestamptz not null default now(),
  -- Null while Draft; set on Ajukan. Start of the turnaround KPI (DR-05).
  waktu_proposal_dokumen   timestamptz,
  waktu_disetujui          timestamptz,  -- last approval -- the "< 1 bulan" KPI boundary
  waktu_aktif              timestamptz,  -- activation; captured, not the KPI boundary
  status_sla               varchar(30)
);
create index proposal_status_idx on proposal_dokumen (status_proposal);
create index proposal_pembuat_idx on proposal_dokumen (id_akun_pembuat);
create index proposal_sebelumnya_idx on proposal_dokumen (id_dokumen_sebelumnya);

comment on column proposal_dokumen.id_dokumen_sebelumnya is
  'Set on a Perpanjangan proposal. Its presence IS the renewal flag -- no second
   boolean to drift out of step with it.';

-- 3.3 / 3.4 joins ----------------------------------------------------------
create table proposal_dokumen_bidang (
  id_proposal_dokumen int not null references proposal_dokumen (id) on delete cascade,
  id_bidang_kerjasama int not null references bidang_kerjasama (id),
  primary key (id_proposal_dokumen, id_bidang_kerjasama)
);

create table proposal_dokumen_agenda (
  id_proposal_dokumen int not null references proposal_dokumen (id) on delete cascade,
  id_agenda           int not null references agenda (id),
  primary key (id_proposal_dokumen, id_agenda)
);

-- 3.5 / 3.6 type-specific bodies ------------------------------------------
create table proposal_dokumen_mou (
  id_proposal_dokumen int primary key references proposal_dokumen (id) on delete cascade,
  ringkasan_kegiatan  text not null
);

create table proposal_dokumen_moa (
  id_proposal_dokumen     int primary key references proposal_dokumen (id) on delete cascade,
  hak_petra               text not null,
  hak_calon_mitra         text not null,
  kewajiban_petra         text not null,
  kewajiban_calon_mitra   text not null
);

-- 3.7 partner_pengusul — document <-> partner, used even for one partner (DR-01)
create table partner_pengusul (
  id_partner          int not null references partner (id),
  id_proposal_dokumen int not null references proposal_dokumen (id) on delete cascade,
  -- The lead partner, whose evaluation is collected on a multi-partner renewal (BR-29).
  is_lead             boolean not null default false,
  primary key (id_partner, id_proposal_dokumen)
);
create unique index partner_pengusul_one_lead_idx
  on partner_pengusul (id_proposal_dokumen) where is_lead;

-- 3.8 pengusul — the Section II proposing position(s)
create table pengusul (
  id_jabatan          int not null references jabatan (id),
  id_proposal_dokumen int not null references proposal_dokumen (id) on delete cascade,
  primary key (id_jabatan, id_proposal_dokumen)
);

-- 3.9 proposal_dokumen_unit — Lingkup Kerja Sama ---------------------------
-- The explicit selected set from the recursive cascade. A parent's
-- indeterminate (partial) state is derived at read time, never stored (BR-38).
create table proposal_dokumen_unit (
  id_proposal_dokumen int not null references proposal_dokumen (id) on delete cascade,
  id_unit             int not null references unit (id),
  primary key (id_proposal_dokumen, id_unit)
);

-- 4.1 dokumen_kerja_sama ---------------------------------------------------
create table dokumen_kerja_sama (
  no                        int generated always as identity primary key,
  id_proposal_dokumen       int not null unique references proposal_dokumen (id),
  no_dokumen                varchar(50),   -- typed by IO, never generated (BR-22)
  tanggal_tanda_tangan      date,
  tanggal_mulai             date,
  tanggal_berakhir          date,          -- NULL for Auto Renewed (BR-11)
  status                    varchar(30) not null default 'Aktif'
                            check (status in ('Aktif','Akan Berakhir','Kedaluarsa','Diarsipkan')),
  alasan_arsip              varchar(40)
                            check (alasan_arsip in ('rejected','expired_without_renewal',
                                                    'superseded_by_renewal','terminated_early')),
  upload_dokumen            varchar(500),  -- signed file path
  folder_kui                varchar(100),
  no_berkas_dikti           varchar(100),
  id_penandatangan_partner  int,           -- FK added after the table exists
  waktu_dibuat              timestamptz not null default now(),
  -- Going inactive always records a reason; there is no generic archive (BR-10).
  constraint arsip_needs_reason
    check (status <> 'Diarsipkan' or alasan_arsip is not null)
);
create index dokumen_status_berakhir_idx on dokumen_kerja_sama (status, tanggal_berakhir);

-- 4.2 penandatangan_petra --------------------------------------------------
-- With role-based accounts there is no person table, so the human who signs the
-- physical document is captured as text (DR-06).
create table penandatangan_petra (
  id                     int generated always as identity primary key,
  no_dokumen_kerjasama   int not null references dokumen_kerja_sama (no) on delete cascade,
  nama                   varchar(150) not null,
  jabatan                varchar(150)
);

-- 4.3 penandatangan_partner ------------------------------------------------
create table penandatangan_partner (
  id                     int generated always as identity primary key,
  id_partner             int not null references partner (id),
  no_dokumen_kerjasama   int not null references dokumen_kerja_sama (no) on delete cascade,
  nama                   varchar(150) not null,
  jabatan                varchar(150)
);

alter table dokumen_kerja_sama add constraint dokumen_penandatangan_partner_fk
  foreign key (id_penandatangan_partner) references penandatangan_partner (id);

-- Auto Renewed => no end date (BR-11). The rule spans two tables, so it is a
-- trigger rather than a check constraint.
create function enforce_auto_renewed_no_end_date() returns trigger
language plpgsql as $fn$
declare
  v_sifat varchar(45);
begin
  select sifat_periode_kerjasama into v_sifat
    from proposal_dokumen where id = new.id_proposal_dokumen;

  if v_sifat = 'Auto Renewed' and new.tanggal_berakhir is not null then
    raise exception 'Auto Renewed document % may not carry an end date (BR-11)', new.no;
  end if;
  return new;
end;
$fn$;

create trigger dokumen_auto_renewed_guard
  before insert or update on dokumen_kerja_sama
  for each row execute function enforce_auto_renewed_no_end_date();
