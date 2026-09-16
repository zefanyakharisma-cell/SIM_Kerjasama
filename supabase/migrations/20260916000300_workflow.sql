-- Schema v3 §5 — workflow: dispositions, targets, the append-only logs, and the
-- pending (frozen) spans the SLA engine subtracts.

-- 5.1 disposisi ------------------------------------------------------------
-- Two structurally different things share this table and never share logic: an
-- `approval` (routed to a position, tiered, gates progress) and a
-- `renewal_request` (routed to a unit's head position, no tier, gates nothing).
-- Every read branches on jenis_disposisi first (BR-24, EC-02).
create table disposisi (
  no                    int generated always as identity primary key,
  id_proposal_dokumen   int references proposal_dokumen (id),
  no_dokumen_kerjasama  int references dokumen_kerja_sama (no),
  jenis_disposisi       varchar(30) not null
                        check (jenis_disposisi in ('approval','renewal_request')),
  -- Approval round. Bumped when a Pending reactivation resets the approval; the
  -- current round's targets are the live ones (BR-06).
  round_ke              smallint not null default 1,
  pesan_disposisi       text,
  lampiran              varchar(500),          -- optional attached document (PRD §7.4)
  id_akun_pengirim      int references akun (id),
  waktu_disposisi       timestamptz not null default now(),
  constraint disposisi_subject_matches_kind check (
    (jenis_disposisi = 'approval'        and id_proposal_dokumen is not null) or
    (jenis_disposisi = 'renewal_request' and no_dokumen_kerjasama is not null)
  )
);
create index disposisi_proposal_idx on disposisi (id_proposal_dokumen, round_ke);
create index disposisi_dokumen_idx on disposisi (no_dokumen_kerjasama);
create index disposisi_jenis_idx on disposisi (jenis_disposisi);

-- 5.2 disposisi_target -----------------------------------------------------
create table disposisi_target (
  no              int generated always as identity primary key,
  no_disposisi    int not null references disposisi (no) on delete cascade,
  -- The target position. For a renewal_request this is the owning unit's head
  -- jabatan; any account of that unit may act on it (BR-25, AR-08).
  id_jabatan      int not null references jabatan (id),
  -- Frozen from jabatan.tier_disposisi at send time, so later re-tiering never
  -- rewrites past routing (BR-15). NULL on a renewal_request.
  tier            smallint check (tier between 1 and 3),
  -- 'removed' rather than a DELETE: riwayat_approval hangs off this row and the
  -- audit is append-only, so a removed target has to keep existing (DR-02).
  status          varchar(30) not null default 'waiting'
                  check (status in ('waiting','pending_action','approved','rejected','removed')),
  waktu_unlock    timestamptz,   -- the SLA clock starts here, never at submission (BR-18)
  waktu_resolusi  timestamptz,
  batas_waktu_sla timestamptz,
  -- Frozen on resolution so a later holiday-calendar edit cannot rewrite
  -- history (DR-03).
  durasi_hari_kerja numeric(6,2),
  status_sla      varchar(20) check (status_sla in ('normal','yellow','red'))
);
create index disposisi_target_disposisi_idx on disposisi_target (no_disposisi);
create index disposisi_target_jabatan_idx on disposisi_target (id_jabatan, status);

-- 5.3 riwayat_approval — append-only approval history / audit ---------------
-- Records the acting position/account, never a person (DR-06).
--
-- Deviation from schema v3 §5.3: id_disposisi_target is nullable and
-- id_proposal_dokumen is added, so document-level events with no target
-- ("Proposal dibuat", "Diajukan") can be recorded. The dashboard Activity Log
-- reads this table and needs them.
create table riwayat_approval (
  id                  int generated always as identity primary key,
  id_disposisi_target int references disposisi_target (no),
  id_proposal_dokumen int references proposal_dokumen (id),
  id_akun             int references akun (id),
  aksi                varchar(50) not null,
  catatan             text,
  tanggal             date not null default current_date,
  waktu               time not null default localtime,
  constraint riwayat_has_subject
    check (id_disposisi_target is not null or id_proposal_dokumen is not null)
);
create index riwayat_target_idx on riwayat_approval (id_disposisi_target);
create index riwayat_proposal_idx on riwayat_approval (id_proposal_dokumen, tanggal, waktu);
comment on table riwayat_approval is
  'Append-only. aksi: created / submitted / dispositioned / approve / reject /
   pending / revision_requested / reactivated / disposition_added /
   disposition_removed / activated / archived.';

-- 5.4 revisi_proposal — revision log ---------------------------------------
-- The draft file is replaced in place (no version history); this log is the
-- trace (BR-07).
create table revisi_proposal (
  id                    int generated always as identity primary key,
  id_proposal_dokumen   int not null references proposal_dokumen (id),
  file_proposal         varchar(500) not null,   -- draft filename after this revision
  id_akun_pengunggah    int not null references akun (id),
  -- The target whose revision request this answers; lets the Discussion view
  -- pair request with fix. NULL for an IO-initiated correction.
  id_disposisi_target_peminta int references disposisi_target (no),
  catatan               text,
  waktu_unggah          timestamptz not null default now()
);
create index revisi_proposal_idx on revisi_proposal (id_proposal_dokumen, waktu_unggah);

-- 5.5 pending_periods — the SLA pause mechanism ----------------------------
-- One row per frozen span. Approval SLA subtracts every overlap (BR-08).
create table pending_periods (
  id                          int generated always as identity primary key,
  id_proposal_dokumen         int not null references proposal_dokumen (id),
  mulai                       timestamptz not null default now(),
  selesai                     timestamptz,
  id_disposisi_target_pemicu  int references disposisi_target (no),
  id_akun_reaktivasi          int references akun (id)
);
create index pending_periods_proposal_idx on pending_periods (id_proposal_dokumen);
-- At most one span open per proposal: a document is either frozen or it is not.
create unique index pending_periods_one_open_idx
  on pending_periods (id_proposal_dokumen) where selesai is null;
