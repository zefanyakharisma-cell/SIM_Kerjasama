-- Revisi V8 §2 — Implementation Arrangement / Implementation Report.
--
-- This IS the Phase 4 table that 20260917000400_renewal.sql and
-- 20260917000700_api.sql both refer to as "the Realization System's table
-- [which] does not exist yet". It is created here, with its read surface; the
-- Realization Form project supplies the writer.
--
-- BR-13 ("an arrangement references exactly one ACTIVE MoU/MoA, and renewal
-- transfers that reference to the successor") is NOT implemented as a
-- renewal-time UPDATE here, on purpose. resolusi_penerus(no) already exists to
-- answer "given the document I hold a reference to, which one should I be
-- pointing at now?", and the API comment says the Realization System calls it.
-- A row therefore keeps pointing at the document it was actually recorded
-- against -- which is the honest record -- and the successor is resolved at
-- read time by the function built for it. Rewriting the reference on archive
-- would lose which document the arrangement was really made under.

-- ============================================================================
-- 1. The record
-- ============================================================================
-- Hangs off dokumen_kerja_sama, not proposal_dokumen: an arrangement or a
-- realization report only means anything for an agreement that was actually
-- signed, so a Draft or Ditolak proposal can never carry one. The FK makes
-- that a constraint instead of a convention.
--
-- One table, not two: Arrangement and Report carry the same five fields and
-- differ only by `jenis`. Two tables would double the RLS, the index and the
-- tab query to express one CHECK.
create table implementasi_dokumen (
  no                   int generated always as identity primary key,
  no_dokumen_kerjasama int not null references dokumen_kerja_sama (no) on delete cascade,
  -- 'arrangement' = the agreed plan (IA); 'report' = the realization report (IR).
  jenis                varchar(20) not null
                       check (jenis in ('arrangement','report')),
  judul                varchar(200) not null,
  deskripsi            text,
  tanggal              date not null,
  berkas               varchar(500),   -- path in the dokumen-kerjasama bucket
  status               varchar(20) not null default 'draft'
                       check (status in ('draft','submitted','verified')),
  id_akun_pembuat      int not null references akun (id),
  waktu_dibuat         timestamptz not null default now()
);

-- The tab's only query: one document, split by jenis, newest first.
create index implementasi_dokumen_idx
  on implementasi_dokumen (no_dokumen_kerjasama, jenis, tanggal desc);

comment on table implementasi_dokumen is
  'Implementation Arrangement (the agreed plan) and Implementation Report (the
   realization), for a signed cooperation document. Read-only in the app for
   now: the Implementasi tab lists it, the Realization Form project writes it.';

-- ============================================================================
-- 2. RLS
-- ============================================================================
alter table implementasi_dokumen enable row level security;

-- Read follows the document's own read rule, through its proposal -- the same
-- single rule every other child of a proposal defers to.
create policy implementasi_baca on implementasi_dokumen for select to authenticated
  using (exists (select 1 from dokumen_kerja_sama dk
                  where dk.no = implementasi_dokumen.no_dokumen_kerjasama
                    and boleh_baca_proposal(dk.id_proposal_dokumen)));

-- KUI only, for now -- the same rule dokumen_kelola uses. When the Realization
-- Form lets a proposing unit file its own report, that project adds the second
-- (permissive) policy; writing one now would be a policy with no writer.
create policy implementasi_kelola on implementasi_dokumen for all to authenticated
  using (current_akun_is_io()) with check (current_akun_is_io());

-- No new storage prefix and no new storage policy: dokumen_kerjasama_unggah
-- already lets any IO account write anywhere in the bucket, and
-- dokumen_kerjasama_baca's permissive branch already covers every prefix
-- outside draft/ disposisi/ revisi/. A prefix policy belongs with the
-- non-IO writer that will need it.
