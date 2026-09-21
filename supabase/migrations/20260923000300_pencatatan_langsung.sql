-- Revisi V8 §1 — KUI records an already-signed document directly.
--
-- Some MoU/MoA were signed before this system existed, or outside it. They
-- have no proposal, no disposisi and no approval trail, and aktivasi_dokumen
-- refuses anything that is not already 'Disetujui' -- so today there is no
-- door for them at all. This opens one, for IO only, and makes the resulting
-- row distinguishable from a document that really did clear three tiers.

-- ============================================================================
-- 1. The flag
-- ============================================================================
-- status_proposal deliberately stays 'Disetujui'. A tenth status value would
-- mean a new branch in laporan.ts's STATUS_PROPOSAL/STATUS_PER_TAB, in
-- status-pill.tsx and in v_daftar_dokumen.status_tampil, to express something
-- that is not "where is this document now" but "how did it get here". And
-- 'Disetujui' already lands it correctly: the disetujui tab filters on
-- status_proposal = 'Disetujui' AND status_dokumen IS NULL, and a direct entry
-- has its dokumen_kerja_sama row from the first instant -- so it never appears
-- on the awaiting-activation tab, only on aktif.
alter table proposal_dokumen
  add column is_pencatatan_langsung boolean not null default false;

comment on column proposal_dokumen.is_pencatatan_langsung is
  'True when KUI typed an already-signed document straight in, with no Ajukan
   and no disposisi. Status is Disetujui like any activated document; this
   column is what suppresses the approval panels and what reporting filters
   on.';

-- ============================================================================
-- 2. The one atomic writer -- create AND edit
-- ============================================================================
-- p_id null => create, otherwise edit. One function rather than two, because
-- an edit has to replace exactly the same tables a create fills, and splitting
-- them is how the two drift apart.
create function catat_dokumen_langsung(
  p_id         int,      -- null on create
  p_proposal   jsonb,    -- jenis_kerjasama, periode_kerjasama, sifat_periode_kerjasama,
                         -- tujuan_kerjasama, manfaat_bagi_petra, manfaat_bagi_mitra,
                         -- informasi_tambahan
  p_partner    jsonb,    -- [{id_partner, is_lead}] -- simpan_anak_proposal's shape
  p_id_jabatan int,
  p_bidang     int[],
  p_agenda     int[],
  p_unit       int[],
  p_sdg        int[],
  p_mou        jsonb,
  p_moa        jsonb,
  p_dokumen    jsonb     -- no_dokumen, tanggal_tanda_tangan, tanggal_mulai,
                         -- tanggal_berakhir, folder_kui, no_berkas_dikti,
                         -- upload_dokumen, penandatangan_petra, jabatan_petra,
                         -- penandatangan_mitra, jabatan_mitra
) returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_id           int := p_id;
  v_no           int;
  v_ttd          date := nullif(p_dokumen ->> 'tanggal_tanda_tangan','')::date;
  v_id_partner   int;
  v_id_ttd_mitra int;
begin
  if not current_akun_is_io() then
    raise exception 'Hanya KUI yang dapat mencatat dokumen secara langsung';
  end if;

  if v_id is null then
    insert into proposal_dokumen (
      jenis_kerjasama, periode_kerjasama, sifat_periode_kerjasama,
      tujuan_kerjasama, manfaat_bagi_petra, manfaat_bagi_mitra, informasi_tambahan,
      status_proposal, is_pencatatan_langsung, id_akun_pembuat,
      -- The real signing date, never now(): a 2019 MoU recorded today must not
      -- report a same-day turnaround. NULL is not an option either -- the list
      -- filters (laporan.ts terapkanFilter) range over waktu_proposal_dokumen,
      -- so a null row would silently vanish from every filtered list and every
      -- export.
      waktu_proposal_dokumen, waktu_disetujui, waktu_aktif)
    values (
      (p_proposal ->> 'jenis_kerjasama')::jenis_kerjasama_t,
      nullif(p_proposal ->> 'periode_kerjasama',''),
      nullif(p_proposal ->> 'sifat_periode_kerjasama',''),
      nullif(p_proposal ->> 'tujuan_kerjasama',''),
      nullif(p_proposal ->> 'manfaat_bagi_petra',''),
      nullif(p_proposal ->> 'manfaat_bagi_mitra',''),
      nullif(p_proposal ->> 'informasi_tambahan',''),
      'Disetujui', true, current_akun_id(),
      v_ttd, v_ttd, now())
    returning id into v_id;
  else
    -- A document that really did go through approval must never be editable
    -- through this door.
    if not exists (select 1 from proposal_dokumen
                    where id = v_id and is_pencatatan_langsung) then
      raise exception 'Dokumen % bukan pencatatan langsung', v_id;
    end if;
    update proposal_dokumen set
      jenis_kerjasama         = (p_proposal ->> 'jenis_kerjasama')::jenis_kerjasama_t,
      periode_kerjasama       = nullif(p_proposal ->> 'periode_kerjasama',''),
      sifat_periode_kerjasama = nullif(p_proposal ->> 'sifat_periode_kerjasama',''),
      tujuan_kerjasama        = nullif(p_proposal ->> 'tujuan_kerjasama',''),
      manfaat_bagi_petra      = nullif(p_proposal ->> 'manfaat_bagi_petra',''),
      manfaat_bagi_mitra      = nullif(p_proposal ->> 'manfaat_bagi_mitra',''),
      informasi_tambahan      = nullif(p_proposal ->> 'informasi_tambahan',''),
      waktu_proposal_dokumen  = v_ttd,
      waktu_disetujui         = v_ttd
    where id = v_id;
  end if;

  -- The eight child tables, through the one function that writes them.
  perform simpan_anak_proposal(v_id, p_partner, p_id_jabatan, p_bidang, p_agenda,
                               p_unit, p_proposal ->> 'jenis_kerjasama',
                               p_mou, p_moa, p_sdg);

  -- id_proposal_dokumen is UNIQUE, so this is select-then-insert-or-update
  -- rather than a blind insert.
  select no into v_no from dokumen_kerja_sama where id_proposal_dokumen = v_id;

  if v_no is null then
    insert into dokumen_kerja_sama (
      id_proposal_dokumen, no_dokumen, tanggal_tanda_tangan, tanggal_mulai,
      tanggal_berakhir, status, folder_kui, no_berkas_dikti, upload_dokumen)
    values (
      v_id, p_dokumen ->> 'no_dokumen', v_ttd,
      nullif(p_dokumen ->> 'tanggal_mulai','')::date,
      nullif(p_dokumen ->> 'tanggal_berakhir','')::date,
      'Aktif',
      nullif(p_dokumen ->> 'folder_kui',''),
      nullif(p_dokumen ->> 'no_berkas_dikti',''),
      nullif(p_dokumen ->> 'upload_dokumen',''))
    returning no into v_no;
  else
    update dokumen_kerja_sama set
      no_dokumen           = p_dokumen ->> 'no_dokumen',
      tanggal_tanda_tangan = v_ttd,
      tanggal_mulai        = nullif(p_dokumen ->> 'tanggal_mulai','')::date,
      tanggal_berakhir     = nullif(p_dokumen ->> 'tanggal_berakhir','')::date,
      folder_kui           = nullif(p_dokumen ->> 'folder_kui',''),
      no_berkas_dikti      = nullif(p_dokumen ->> 'no_berkas_dikti',''),
      -- Keep the stored path when the form sent no replacement file.
      upload_dokumen       = coalesce(nullif(p_dokumen ->> 'upload_dokumen',''), upload_dokumen)
    where no = v_no;
  end if;

  -- Signatories are replaced, not merged. The FK on dokumen_kerja_sama has to
  -- be cleared FIRST, or the delete below trips
  -- dokumen_penandatangan_partner_fk.
  update dokumen_kerja_sama set id_penandatangan_partner = null where no = v_no;
  delete from penandatangan_petra   where no_dokumen_kerjasama = v_no;
  delete from penandatangan_partner where no_dokumen_kerjasama = v_no;

  if coalesce(p_dokumen ->> 'penandatangan_petra','') <> '' then
    insert into penandatangan_petra (no_dokumen_kerjasama, nama, jabatan)
    values (v_no, p_dokumen ->> 'penandatangan_petra',
            nullif(p_dokumen ->> 'jabatan_petra',''));
  end if;

  if coalesce(p_dokumen ->> 'penandatangan_mitra','') <> '' then
    -- The lead partner signs, same rule aktivasi_dokumen uses (BR-29).
    select pp.id_partner into v_id_partner
      from partner_pengusul pp
     where pp.id_proposal_dokumen = v_id
     order by pp.is_lead desc
     limit 1;

    if v_id_partner is not null then
      insert into penandatangan_partner (id_partner, no_dokumen_kerjasama, nama, jabatan)
      values (v_id_partner, v_no, p_dokumen ->> 'penandatangan_mitra',
              nullif(p_dokumen ->> 'jabatan_mitra',''))
      returning id into v_id_ttd_mitra;
      update dokumen_kerja_sama set id_penandatangan_partner = v_id_ttd_mitra
       where no = v_no;
    end if;
  end if;

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (v_id, current_akun_id(),
          case when p_id is null then 'activated' else 'edited' end,
          p_dokumen ->> 'no_dokumen');

  return v_id;
end;
$fn$;

comment on function catat_dokumen_langsung is
  'Records an already-signed MoU/MoA that never went through the approval
   workflow, and edits one afterwards. IO only. The proposal lands on
   Disetujui with is_pencatatan_langsung set, and the dokumen_kerja_sama row
   is created in the same transaction, so the document is Aktif immediately.';

revoke execute on function catat_dokumen_langsung(
  int, jsonb, jsonb, int, int[], int[], int[], int[], jsonb, jsonb, jsonb
) from public, anon;
grant execute on function catat_dokumen_langsung(
  int, jsonb, jsonb, int, int[], int[], int[], int[], jsonb, jsonb, jsonb
) to authenticated;

-- ============================================================================
-- 3. Reporting can tell the two apart
-- ============================================================================
-- Appended column only, which is the one change create-or-replace allows on a
-- view. Body is otherwise 20260921000100_revisi_v7.sql §7 verbatim.
create or replace view v_daftar_dokumen with (security_invoker = true) as
select
  p.id                                as id_proposal,
  dk.no                               as no_dokumen_kerjasama,
  dk.no_dokumen,
  p.jenis_kerjasama::text             as jenis_kerjasama,
  p.status_proposal,
  dk.status                           as status_dokumen,
  (case
     when dk.status in ('Aktif','Akan Berakhir')
      and exists (select 1 from disposisi d
                   where d.no_dokumen_kerjasama = dk.no
                     and d.jenis_disposisi = 'renewal_request')
     then 'Disposisi Evaluasi'
     else coalesce(dk.status, p.status_proposal)
   end)::varchar(30)                  as status_tampil,
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
  p.id_akun_pembuat,
  lingkup_agg.jumlah_lingkup,
  p.is_pencatatan_langsung
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
  select string_agg(distinct u.nama, ', ' order by u.nama) as lingkup,
         count(distinct u.id)::int                         as jumlah_lingkup
    from proposal_dokumen_unit pdu
    join unit u on u.id = pdu.id_unit
   where pdu.id_proposal_dokumen = p.id
) lingkup_agg on true;
