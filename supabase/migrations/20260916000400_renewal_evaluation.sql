-- Schema v3 §6 — renewal & evaluation, §7 — notifications.
-- Tables land now (the schema is one deliverable); the renewal UI is Phase 3.

-- 6.1 evaluasi -------------------------------------------------------------
-- Structured, never a single text blob: the Likert columns are what make the
-- expectation-vs-satisfaction gap analytics queryable (G8, BR-28). There is no
-- file-upload path for this form.
create table evaluasi (
  no                    int generated always as identity primary key,
  id_dokumen_kerjasama  int not null references dokumen_kerja_sama (no),
  respondent_type       varchar(10) not null check (respondent_type in ('faculty','partner')),
  id_partner_contact    int references partner_contact (id),   -- partner side
  id_jabatan_pengusul   int references jabatan (id),           -- faculty side

  -- Expectation, Likert 1-5
  exp_quality           smallint check (exp_quality between 1 and 5),
  exp_relevance         smallint check (exp_relevance between 1 and 5),
  exp_productivity      smallint check (exp_productivity between 1 and 5),
  exp_sustainability    smallint check (exp_sustainability between 1 and 5),
  exp_communication     smallint check (exp_communication between 1 and 5),
  -- Satisfaction, same scale so the two grids are comparable
  sat_quality           smallint check (sat_quality between 1 and 5),
  sat_relevance         smallint check (sat_relevance between 1 and 5),
  sat_productivity      smallint check (sat_productivity between 1 and 5),
  sat_sustainability    smallint check (sat_sustainability between 1 and 5),
  sat_communication     smallint check (sat_communication between 1 and 5),

  rekomendasi           varchar(50) check (rekomendasi in ('continue','terminate')),
  continuation_mode     varchar(20) check (continuation_mode in ('same_program','add_program')),
  catatan_evaluasi      text,
  respondent_nama       varchar(150),   -- accountability record for the no-login form
  respondent_email      varchar(150),
  -- Frozen per submission; a later form change never migrates old answers (BR-31).
  form_revision         varchar(30) not null default 'F03-PM03-KUI-UKP-00',
  status                varchar(20) not null default 'pending'
                        check (status in ('pending','submitted','superseded')),
  -- A reopened re-submission links to the answer it replaces; reopen creates
  -- rows, never mutates (BR-30, DR-08).
  id_supersedes         int references evaluasi (no),
  waktu_evaluasi        timestamptz,
  waktu_dibuat          timestamptz not null default now(),
  constraint evaluasi_submitted_has_recommendation
    check (status <> 'submitted' or rekomendasi is not null)
);
create index evaluasi_dokumen_idx on evaluasi (id_dokumen_kerjasama, respondent_type, status);
comment on table evaluasi is
  'One row per (document x respondent). Analytics keep every aggregate linked
   back to id_dokumen_kerjasama so any figure drills down to the partnerships
   behind it (Q8). On a multi-partner renewal there is one partner evaluation,
   for the lead partner (BR-29).';

-- 6.2 partner_eval_token — no-login partner access -------------------------
-- The token is the credential: long, unguessable, resolved server-side, valid
-- until submitted, then inert. Reopen issues a fresh one (BR-30).
create table partner_eval_token (
  id                int generated always as identity primary key,
  id_evaluasi       int not null references evaluasi (no),
  token             char(64) not null unique,
  is_active         boolean not null default true,
  id_akun_pengirim  int references akun (id),
  waktu_kirim       timestamptz not null default now(),
  waktu_submit      timestamptz,
  waktu_reopen      timestamptz,
  id_akun_reopen    int references akun (id)
);
create index partner_eval_token_evaluasi_idx on partner_eval_token (id_evaluasi);

-- keputusan_pembaruan — the split-decision override ------------------------
-- Listed in PRD §14 as "Renewal decision" but absent from schema v3's table
-- list, so it is added here. A split is never auto-resolved: it needs a
-- recorded decision with a required reason, audited (BR-27).
create table keputusan_pembaruan (
  id                    int generated always as identity primary key,
  id_dokumen_kerjasama  int not null references dokumen_kerja_sama (no),
  keputusan             varchar(20) not null check (keputusan in ('continue','terminate')),
  alasan                text not null,      -- required; that is the whole point
  id_akun               int not null references akun (id),
  waktu                 timestamptz not null default now()
);
create index keputusan_pembaruan_dokumen_idx on keputusan_pembaruan (id_dokumen_kerjasama);

-- 7.1 notifikasi -----------------------------------------------------------
create table notifikasi (
  id                    int generated always as identity primary key,
  id_proposal_dokumen   int references proposal_dokumen (id),
  no_dokumen_kerjasama  int references dokumen_kerja_sama (no),
  -- Recipient made explicit (schema v3 §7.1 recommends it): notifications go to
  -- a position's inbox, which is a role account, so the current holder gets it.
  id_jabatan_penerima   int references jabatan (id),
  jenis_notifikasi      varchar(50) not null,
  isi                   text,
  waktu_kirim           timestamptz not null default now(),
  waktu_dibaca          timestamptz,
  status                varchar(30) not null default 'pending'
                        check (status in ('pending','sent','failed','read'))
);
create index notifikasi_penerima_idx on notifikasi (id_jabatan_penerima, waktu_kirim desc);
comment on column notifikasi.jenis_notifikasi is
  'disposition_assigned / approved / pending / revision_requested / rejected /
   expiring_soon / sla_yellow / sla_red / renewal_request_sla /
   evaluation_submitted / split_decision';
