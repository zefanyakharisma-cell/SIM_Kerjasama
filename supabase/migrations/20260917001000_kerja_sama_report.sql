-- Revision V2 — Kerja Sama Aktif report: list columns, document report tabs
-- (Informasi Mitra / Kerja Sama yang Diusulkan / Unit Pengusul), a real PDF
-- upload alongside a Google Drive link, and — a deliberate reversal of the
-- role-based-only account model (schema.md override #1, DR-06) — a `pegawai`
-- (employee) entity so a jabatan's contact person (name, phone) can be shown
-- without inventing free-text fields that drift from master data.

-- --------------------------------------------------------------------------
-- 1. pegawai — a real person record, distinct from akun (which stays the
--    role-based login/audit identity). One pegawai can be the named contact
--    for a jabatan; nothing about riwayat_approval or akun's own semantics
--    changes — this only adds a place to look up a name and phone number.
-- --------------------------------------------------------------------------
create table pegawai (
  id        int generated always as identity primary key,
  nama      varchar(150) not null,
  email     varchar(255),
  no_hp     varchar(30),
  is_active boolean not null default true
);

alter table jabatan
  add column id_pegawai int references pegawai (id);
comment on column jabatan.id_pegawai is
  'The named contact currently holding/reachable for this position. Nullable —
   not every jabatan has one on file. Assigning this is what "automatically
   includes" Nama Kontak/No.HP wherever the jabatan is shown (e.g. Unit
   Pengusul on the Kerja Sama Aktif report) — the jabatan itself is looked up
   once, not copied per document.';

alter table pegawai enable row level security;
create policy pegawai_baca on pegawai for select to authenticated
  using (current_akun_id() is not null);
create policy pegawai_kelola on pegawai for all to authenticated
  using (current_akun_is_io())
  with check (current_akun_is_io());

-- --------------------------------------------------------------------------
-- 2. Document file — upload OR a Google Drive link, either is enough for the
--    View tab's preview/download. upload_dokumen already existed (unused);
--    link_gdrive is the second way in.
-- --------------------------------------------------------------------------
alter table dokumen_kerja_sama
  add column link_gdrive varchar(500);
comment on column dokumen_kerja_sama.upload_dokumen is
  'Path within the dokumen-kerjasama storage bucket. Either this or
   link_gdrive is enough to render a document link; neither is required.';
comment on column dokumen_kerja_sama.link_gdrive is
  'A Google Drive share link, as an alternative to uploading the PDF here.';

insert into storage.buckets (id, name, public)
values ('dokumen-kerjasama', 'dokumen-kerjasama', false)
on conflict (id) do nothing;

-- Signed URLs still need a select policy on storage.objects — this is what
-- lets an authenticated account's client generate one for a file in this
-- bucket; the app never makes the bucket itself public.
create policy dokumen_kerjasama_baca on storage.objects for select
  to authenticated using (bucket_id = 'dokumen-kerjasama');
create policy dokumen_kerjasama_unggah on storage.objects for insert
  to authenticated with check (bucket_id = 'dokumen-kerjasama' and current_akun_is_io());
create policy dokumen_kerjasama_ubah on storage.objects for update
  to authenticated using (bucket_id = 'dokumen-kerjasama' and current_akun_is_io());
create policy dokumen_kerjasama_hapus on storage.objects for delete
  to authenticated using (bucket_id = 'dokumen-kerjasama' and current_akun_is_io());

-- --------------------------------------------------------------------------
-- 3. v_daftar_dokumen — add Agenda Kerja Sama, Pengusul (jabatan) and Lingkup
--    (unit scope) so the Kerja Sama Aktif list can show them without a
--    second round-trip per row. Existing columns and their order are
--    untouched; these are appended.
-- --------------------------------------------------------------------------
create or replace view v_daftar_dokumen with (security_invoker = true) as
select
  p.id                                as id_proposal,
  dk.no                               as no_dokumen_kerjasama,
  dk.no_dokumen,
  p.jenis_kerjasama::text             as jenis_kerjasama,
  p.status_proposal,
  dk.status                           as status_dokumen,
  coalesce(dk.status, p.status_proposal) as status_tampil,
  dk.alasan_arsip,
  p.status_sla,
  p.periode_kerjasama,
  p.sifat_periode_kerjasama,
  p.waktu_proposal_dokumen,
  p.waktu_disetujui,
  p.waktu_aktif,
  dk.tanggal_tanda_tangan,
  dk.tanggal_mulai,
  dk.tanggal_berakhir,
  case when dk.tanggal_berakhir is not null
       then dk.tanggal_berakhir - current_date end as sisa_hari,
  dk.folder_kui,
  dk.no_berkas_dikti,
  dk.upload_dokumen,
  dk.link_gdrive,
  p.id_dokumen_sebelumnya,
  (p.id_dokumen_sebelumnya is not null) as is_perpanjangan,
  mitra.nama_mitra,
  mitra.is_international,
  mitra.negara,
  pengusul_unit.unit_pengusul,
  pengusul_unit.jabatan_pengusul,
  agenda_agg.agenda,
  lingkup_agg.lingkup,
  p.id_akun_pembuat
from proposal_dokumen p
left join dokumen_kerja_sama dk on dk.id_proposal_dokumen = p.id
left join lateral (
  select string_agg(pr.nama, ', ' order by pp.is_lead desc, pr.nama) as nama_mitra,
         bool_or(pr.is_international)                                as is_international,
         string_agg(distinct n.nama, ', ')                           as negara
    from partner_pengusul pp
    join partner pr on pr.id = pp.id_partner
    join negara n on n.id = pr.id_negara
   where pp.id_proposal_dokumen = p.id
) mitra on true
left join lateral (
  select string_agg(distinct u.nama, ', ' order by u.nama) as unit_pengusul,
         string_agg(distinct j.nama, ', ' order by j.nama) as jabatan_pengusul
    from pengusul pg
    join jabatan j on j.id = pg.id_jabatan
    join unit u on u.id = j.id_unit
   where pg.id_proposal_dokumen = p.id
) pengusul_unit on true
left join lateral (
  select string_agg(distinct ag.nama, ', ' order by ag.nama) as agenda
    from proposal_dokumen_agenda pda
    join agenda ag on ag.id = pda.id_agenda
   where pda.id_proposal_dokumen = p.id
) agenda_agg on true
left join lateral (
  select string_agg(distinct u.nama, ', ' order by u.nama) as lingkup
    from proposal_dokumen_unit pdu
    join unit u on u.id = pdu.id_unit
   where pdu.id_proposal_dokumen = p.id
) lingkup_agg on true;

comment on view v_daftar_dokumen is
  'The Cari Kerja Sama tabs, the per-column filters and two of the three Excel
   exports all read this. security_invoker keeps RLS in force. Agenda/Pengusul/
   Lingkup are aggregated per document for the Kerja Sama Aktif report.';
