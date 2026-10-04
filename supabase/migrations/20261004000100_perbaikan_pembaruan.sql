-- Perbaikan Pembaruan — a rejected Perpanjangan is not a successor.
--
-- Rejecting a proposal (aksi_target 'reject') inserts its dokumen_kerja_sama
-- row as Diarsipkan / 'rejected', with no number and no dates. For a renewal
-- proposal that row hangs off the predecessor through
-- proposal_dokumen.id_dokumen_sebelumnya, and every "who is the successor?"
-- reader took it at face value.
--
-- Live proof (doc 52, its Perpanjangan 151; run in a rolled-back transaction):
--   reject 151                     -> dokumen_kerja_sama no 55, 'rejected'
--   resolusi_penerus(52)           -> no 55, langkah 1
--   v_pembaruan(52).id_proposal_penerus -> 151
--   buat_proposal_perpanjangan(52) -> succeeds, proposal 152
--   v_pembaruan where no = 52      -> TWO rows (penerus 151 and 152)
--
-- What it broke:
--   v_pembaruan          — after the rejection the Pembaruan tab said
--     "Proposal perpanjangan sudah dibuat" and hid the upload, so the unit
--     could never try again. Had a second draft got in, the view returned two
--     rows per document, PembaruanPanel's maybeSingle() failed, and the tab
--     fell back to "Belum ada permintaan pembaruan" with a send form the
--     database then refuses.
--   buat_proposal_perpanjangan — no guard against a successor already in
--     flight: a double submit created two live Perpanjangan proposals.
--   resolusi_penerus     — the Realization API was told to move its
--     references onto the rejected, never-signed document.
--   implementasi_kegiatan / implementasi_berkas — the rejected row has a
--     dokumen no, so the Implementasi tab opened on the rejected proposal and
--     listed the original agreement's SIM Realisasi activities under it.
--
-- Rule applied everywhere below: a successor is a renewal proposal that is not
-- Ditolak; a document of the chain is one whose alasan_arsip is not
-- 'rejected'. Each function is its previous body with only that change;
-- `create or replace` keeps the ACLs, so the existing grants stand.

-- 1 ------------------------------------------------------------------
-- The newest non-rejected successor, at most one, so the view is one row per
-- document. Columns keep their names, positions and types.
create or replace view v_pembaruan with (security_invoker = true) as
select
  dk.no                       as no_dokumen_kerjasama,
  dk.id_proposal_dokumen      as id_proposal,
  dk.no_dokumen,
  dk.status                   as status_dokumen,
  dk.tanggal_berakhir,
  dk.tanggal_berakhir - current_date as sisa_hari,
  mitra.nama_mitra,
  unitp.unit_pengusul,
  d.no                        as no_disposisi,
  d.waktu_disposisi,
  (current_date - d.waktu_disposisi::date) as usia_permintaan_hari,
  ev.no_evaluasi_faculty,
  ev.status_faculty,
  ev.rekomendasi_faculty,
  ev.no_evaluasi_partner,
  ev.status_partner,
  ev.rekomendasi_partner,
  ev.token_partner,
  (case when status_gerbang_pembaruan(dk.no) = 'terbuka' and dk.pembaruan_dimulai_at is null
        then 'siap'
        else status_gerbang_pembaruan(dk.no) end) as gerbang,
  penerus.id                  as id_proposal_penerus,
  dk.pembaruan_dimulai_at
from dokumen_kerja_sama dk
join disposisi d on d.no_dokumen_kerjasama = dk.no
                and d.jenis_disposisi = 'renewal_request'
left join lateral (
  select
    max(case when e.respondent_type = 'faculty' then e.no end)                as no_evaluasi_faculty,
    max((case when e.respondent_type = 'faculty' then e.status end)::text)      as status_faculty,
    max((case when e.respondent_type = 'faculty' then e.rekomendasi end)::text) as rekomendasi_faculty,
    max(case when e.respondent_type = 'partner' then e.no end)                as no_evaluasi_partner,
    max((case when e.respondent_type = 'partner' then e.status end)::text)      as status_partner,
    max((case when e.respondent_type = 'partner' then e.rekomendasi end)::text) as rekomendasi_partner,
    max(case when e.respondent_type = 'partner' then t.token end)             as token_partner
    from evaluasi e
    left join partner_eval_token t on t.id_evaluasi = e.no and t.is_active
   where e.id_dokumen_kerjasama = dk.no and e.status <> 'superseded'
) ev on true
left join lateral (
  select string_agg(pr.nama, ', ' order by pp.is_lead desc, pr.nama) as nama_mitra
    from partner_pengusul pp
    join partner pr on pr.id = pp.id_partner
   where pp.id_proposal_dokumen = dk.id_proposal_dokumen
) mitra on true
left join lateral (
  select string_agg(u.nama, ', ') as unit_pengusul
    from pengusul pg
    join jabatan j on j.id = pg.id_jabatan
    join unit u on u.id = j.id_unit
   where pg.id_proposal_dokumen = dk.id_proposal_dokumen
) unitp on true
left join lateral (
  select p.id
    from proposal_dokumen p
   where p.id_dokumen_sebelumnya = dk.id_proposal_dokumen
     and p.status_proposal <> 'Ditolak'
   order by p.id desc
   limit 1
) penerus on true;

-- 2 ------------------------------------------------------------------
create or replace function buat_proposal_perpanjangan(p_no_dokumen int, p_file text default null)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_gerbang text;
  v_lama proposal_dokumen;
  v_baru int;
  v_unit int;
begin
  v_gerbang := status_gerbang_pembaruan(p_no_dokumen);
  if v_gerbang <> 'terbuka' then
    raise exception
      'Pembaruan belum dapat diajukan: gerbang evaluasi berstatus %. Kedua evaluasi harus masuk dan keduanya merekomendasikan lanjut (BR-26).',
      v_gerbang;
  end if;

  -- V8 §16: evaluation agreement alone is not enough — Admin must have pressed
  -- Mulai Proses Pembaruan first. 20260926000300 moved the storage policy
  -- (boleh_unggah_perpanjangan) and v_pembaruan.gerbang onto that rule but
  -- left this RPC behind, so the Server Action could still create a successor
  -- with a null file before the process was opened. That closed every open
  -- renewal_request target and made Admin's own start card disappear.
  if not exists (select 1 from dokumen_kerja_sama dk
                  where dk.no = p_no_dokumen
                    and dk.pembaruan_dimulai_at is not null) then
    raise exception
      'Pembaruan belum dibuka: Admin harus menekan Mulai Proses Pembaruan lebih dulu (V8 §16).';
  end if;

  select p.* into v_lama
    from dokumen_kerja_sama dk join proposal_dokumen p on p.id = dk.id_proposal_dokumen
   where dk.no = p_no_dokumen
     for update of dk;   -- serialises two submits of the same renewal

  -- One live successor at a time. A Ditolak one does not count: after a
  -- rejection the unit uploads a fresh draft against the same open process.
  if exists (select 1 from proposal_dokumen p
              where p.id_dokumen_sebelumnya = v_lama.id
                and p.status_proposal <> 'Ditolak') then
    raise exception
      'Proposal perpanjangan untuk dokumen ini sudah dibuat dan masih berjalan.';
  end if;

  select j.id_unit into v_unit
    from pengusul pg join jabatan j on j.id = pg.id_jabatan
   where pg.id_proposal_dokumen = v_lama.id limit 1;

  if not (current_akun_is_io() or akun_milik_unit(v_unit)) then
    raise exception 'Only an account of the owning unit uploads the renewal draft (AR-08)';
  end if;

  -- The predecessor link IS the renewal flag; there is no second boolean.
  insert into proposal_dokumen (
    jenis_kerjasama, periode_kerjasama, sifat_periode_kerjasama, status_proposal,
    tujuan_kerjasama, manfaat_bagi_petra, manfaat_bagi_mitra, informasi_tambahan,
    file_draft, id_dokumen_sebelumnya, id_akun_pembuat, waktu_proposal_dokumen)
  values (
    v_lama.jenis_kerjasama, v_lama.periode_kerjasama, v_lama.sifat_periode_kerjasama,
    'Diajukan', v_lama.tujuan_kerjasama, v_lama.manfaat_bagi_petra,
    v_lama.manfaat_bagi_mitra, v_lama.informasi_tambahan,
    p_file, v_lama.id, current_akun_id(), now())
  returning id into v_baru;

  -- Everything that describes the partnership carries over; only the approval
  -- itself starts again.
  insert into partner_pengusul (id_partner, id_proposal_dokumen, is_lead)
  select id_partner, v_baru, is_lead from partner_pengusul where id_proposal_dokumen = v_lama.id;
  insert into pengusul (id_jabatan, id_proposal_dokumen)
  select id_jabatan, v_baru from pengusul where id_proposal_dokumen = v_lama.id;
  insert into proposal_dokumen_agenda (id_proposal_dokumen, id_agenda)
  select v_baru, id_agenda from proposal_dokumen_agenda where id_proposal_dokumen = v_lama.id;
  insert into proposal_dokumen_bidang (id_proposal_dokumen, id_bidang_kerjasama)
  select v_baru, id_bidang_kerjasama from proposal_dokumen_bidang where id_proposal_dokumen = v_lama.id;
  insert into proposal_dokumen_unit (id_proposal_dokumen, id_unit)
  select v_baru, id_unit from proposal_dokumen_unit where id_proposal_dokumen = v_lama.id;
  -- proposal_dokumen_sdg arrived in 20260923000100, after this function was
  -- written, and was the one child table it never carried over. The loss was
  -- permanent: the successor is created straight into 'Diajukan', and
  -- proposal_ubah only lets a submitter edit while the status is Draft, so the
  -- unit could not put the tags back.
  insert into proposal_dokumen_sdg (id_proposal_dokumen, nomor_sdg)
  select v_baru, nomor_sdg from proposal_dokumen_sdg where id_proposal_dokumen = v_lama.id;

  insert into proposal_dokumen_mou (id_proposal_dokumen, ringkasan_kegiatan)
  select v_baru, ringkasan_kegiatan from proposal_dokumen_mou where id_proposal_dokumen = v_lama.id;
  insert into proposal_dokumen_moa (id_proposal_dokumen, hak_petra, hak_calon_mitra,
                                    kewajiban_petra, kewajiban_calon_mitra)
  select v_baru, hak_petra, hak_calon_mitra, kewajiban_petra, kewajiban_calon_mitra
    from proposal_dokumen_moa where id_proposal_dokumen = v_lama.id;

  -- The renewal request completes by the draft arriving — not by an approve or
  -- a reject, which it never had (BR-25).
  update disposisi_target dt
     set status = 'approved', waktu_resolusi = now()
    from disposisi d
   where d.no = dt.no_disposisi
     and d.no_dokumen_kerjasama = p_no_dokumen
     and d.jenis_disposisi = 'renewal_request'
     and dt.status = 'pending_action';

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (v_baru, current_akun_id(), 'submitted',
          'Draf pembaruan diunggah oleh unit pemilik; proposal Perpanjangan dibuat.');

  return v_baru;
end;
$fn$;

-- 3 ------------------------------------------------------------------
-- Walks only through signed successors. A rejected renewal leaves the
-- reference where it is (langkah 0) instead of moving it onto a document that
-- never existed as an agreement.
create or replace function resolusi_penerus(p_no_dokumen int)
returns table (no_dokumen_kerjasama int, no_dokumen varchar, status varchar,
               alasan_arsip varchar, langkah int)
language sql stable security definer set search_path = public as $fn$
  with recursive rantai as (
    select dk.no, dk.id_proposal_dokumen, dk.no_dokumen, dk.status,
           dk.alasan_arsip, 0 as langkah
      from dokumen_kerja_sama dk
     where dk.no = p_no_dokumen
    union all
    select dk.no, dk.id_proposal_dokumen, dk.no_dokumen, dk.status,
           dk.alasan_arsip, r.langkah + 1
      from rantai r
      join proposal_dokumen p on p.id_dokumen_sebelumnya = r.id_proposal_dokumen
      join dokumen_kerja_sama dk on dk.id_proposal_dokumen = p.id
     where r.langkah < 20
       and dk.alasan_arsip is distinct from 'rejected'
  )
  select no, no_dokumen, status, alasan_arsip, langkah
    from rantai
   order by langkah desc, no desc
   limit 1;
$fn$;

-- 4 ------------------------------------------------------------------
-- 20261003000100's bodies, with the rejected-document rule added to the
-- caller's access check (implementasi_kegiatan) and to the chain membership
-- test (implementasi_berkas).
create or replace function implementasi_kegiatan(p_no int)
returns table (
  id                   uuid,
  kode                 text,
  nama                 text,
  periode              text,
  jenis_kegiatan       text,
  unit_pelaksana       text,
  mode                 text,
  arah                 text,
  tempat               text,
  tanggal_mulai        date,
  tanggal_selesai      date,
  jumlah_peserta       int,
  no_dokumen_asal      int,
  nomor_dokumen_asal   text,
  id_berkas_ia         bigint,
  id_berkas_ir         bigint
)
language plpgsql stable security definer set search_path = public as $fn$
begin
  if to_regnamespace('realisasi') is null
     or not exists (select 1 from dokumen_kerja_sama dk
                     where dk.no = p_no
                       and dk.alasan_arsip is distinct from 'rejected'
                       and boleh_baca_proposal(dk.id_proposal_dokumen)) then
    return;
  end if;

  return query
  select a.id,
         a.code,
         a.name,
         initcap(s.term::text) || ' ' || ay.label,
         ag.nama::text,
         (select string_agg(u.nama, ', ' order by au.is_submitter desc, u.nama)
            from realisasi.activity_units au join unit u on u.id = au.unit_id
           where au.activity_id = a.id)::text,
         a.mode::text,
         a.direction::text,
         a.venue,
         a.start_date,
         a.end_date,
         -- A count from the approved participant set, never the names.
         (select (select count(*) from realisasi.participant_students ps where ps.set_version_id = v.id)
               + (select count(*) from realisasi.participant_staff pt where pt.set_version_id = v.id)
            from realisasi.participant_set_versions v
           where v.activity_id = a.id and v.status::text = 'approved'
           order by v.version desc limit 1)::int,
         ad.original_document_id,
         dk.no_dokumen::text,
         (select f.id from realisasi.activity_files f
           where f.activity_id = a.id and f.kind::text = 'ia' and f.is_current
           order by f.version desc limit 1),
         (select f.id from realisasi.activity_files f
           where f.activity_id = a.id and f.kind::text = 'ir' and f.is_current
           order by f.version desc limit 1)
    from realisasi.activity_documents ad
    join realisasi.activities a on a.id = ad.activity_id
    left join realisasi.semesters s on s.id = a.semester_id
    left join realisasi.academic_years ay on ay.id = coalesce(s.academic_year_id, a.academic_year_id)
    left join agenda ag on ag.id = a.agenda_id
    left join dokumen_kerja_sama dk on dk.no = ad.original_document_id
   where ad.chain_id = realisasi.chain_root(p_no)
     and a.status::text = 'verified'
   order by a.start_date desc, a.code desc;
end;
$fn$;

create or replace function implementasi_berkas(p_id bigint)
returns table (nama_berkas text, mime text, isi bytea)
language plpgsql stable security definer set search_path = public as $fn$
begin
  if to_regnamespace('realisasi') is null then
    return;
  end if;

  return query
  select f.filename, coalesce(b.mime, f.mime, 'application/octet-stream'), b.data
    from realisasi.activity_files f
    join realisasi.activities a on a.id = f.activity_id
    join realisasi.file_blobs b on b.path = f.storage_path
   where f.id = p_id
     and f.kind::text in ('ia','ir')
     and a.status::text = 'verified'
     and exists (select 1
                   from realisasi.activity_documents ad
                   join dokumen_kerja_sama dk on realisasi.chain_root(dk.no) = ad.chain_id
                  where ad.activity_id = a.id
                    and dk.alasan_arsip is distinct from 'rejected'
                    and boleh_baca_proposal(dk.id_proposal_dokumen))
   limit 1;
end;
$fn$;
