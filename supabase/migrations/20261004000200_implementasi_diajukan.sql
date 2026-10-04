-- Implementasi tab lists every submitted IA (client revision 2026-10-04).
--
-- Until now implementasi_kegiatan returned only `verified` activities, so an
-- IA a unit had already submitted in SIM Realisasi was invisible on the
-- document while it waited for verification or sat in revision. On the live
-- data that hid 11 of the 128 submitted activities (7 in_verification,
-- 4 revision_requested). The client wants every submitted IA visible on its
-- document, so the rule becomes "left the draft state": in_verification,
-- revision_requested and verified. Drafts still stay in SIM Realisasi.
--
-- The row now carries the activity's `status`, so the tab can say which ones
-- are verified. Adding an output column changes the return type, which
-- `create or replace` cannot do, so the listing is a new function,
-- implementasi_kegiatan_diajukan, and the app calls that. The old
-- implementasi_kegiatan is left as it is (no caller in the app) rather than
-- dropped here: a DROP on the live database waits on a confirmation the
-- migration tool never got, so its removal is a separate, confirmed step.
--
-- Two smaller fixes ride along:
--   Jumlah Peserta read only an `approved` participant set, and an activity in
--   verification has only a `pending` one, so it would show "—". It now takes
--   the approved set when there is one, else the newest set under review
--   (pending / revision_requested). Still a count, never the names.
--   Periode was `initcap(term) || ' ' || label`: an activity with an academic
--   year but no semester got NULL. concat_ws keeps the year.
--   Order puts activities without a start date last instead of first.
--
-- implementasi_berkas follows the same rule, so the IA of a submitted activity
-- downloads as well. Everything else is 20261004000100's body unchanged: the
-- rejected-document rule, boleh_baca_proposal, and no mobility_bundle.

create function implementasi_kegiatan_diajukan(p_no int)
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
  id_berkas_ir         bigint,
  status               text
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
         nullif(concat_ws(' ', initcap(s.term::text), ay.label), ''),
         ag.nama::text,
         (select string_agg(u.nama, ', ' order by au.is_submitter desc, u.nama)
            from realisasi.activity_units au join unit u on u.id = au.unit_id
           where au.activity_id = a.id)::text,
         a.mode::text,
         a.direction::text,
         a.venue,
         a.start_date,
         a.end_date,
         -- A count, never the names: the approved set, else the newest one
         -- still under review.
         (select (select count(*) from realisasi.participant_students ps where ps.set_version_id = v.id)
               + (select count(*) from realisasi.participant_staff pt where pt.set_version_id = v.id)
            from realisasi.participant_set_versions v
           where v.activity_id = a.id
             and v.status::text in ('approved','pending','revision_requested')
           order by (v.status::text = 'approved') desc, v.version desc limit 1)::int,
         ad.original_document_id,
         dk.no_dokumen::text,
         (select f.id from realisasi.activity_files f
           where f.activity_id = a.id and f.kind::text = 'ia' and f.is_current
           order by f.version desc limit 1),
         (select f.id from realisasi.activity_files f
           where f.activity_id = a.id and f.kind::text = 'ir' and f.is_current
           order by f.version desc limit 1),
         a.status::text
    from realisasi.activity_documents ad
    join realisasi.activities a on a.id = ad.activity_id
    left join realisasi.semesters s on s.id = a.semester_id
    left join realisasi.academic_years ay on ay.id = coalesce(s.academic_year_id, a.academic_year_id)
    left join agenda ag on ag.id = a.agenda_id
    left join dokumen_kerja_sama dk on dk.no = ad.original_document_id
   where ad.chain_id = realisasi.chain_root(p_no)
     and a.status::text <> 'draft'
   order by a.start_date desc nulls last, a.code desc;
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
     and a.status::text <> 'draft'
     and exists (select 1
                   from realisasi.activity_documents ad
                   join dokumen_kerja_sama dk on realisasi.chain_root(dk.no) = ad.chain_id
                  where ad.activity_id = a.id
                    and dk.alasan_arsip is distinct from 'rejected'
                    and boleh_baca_proposal(dk.id_proposal_dokumen))
   limit 1;
end;
$fn$;

revoke all on function implementasi_kegiatan_diajukan(int) from public, anon;
grant execute on function implementasi_kegiatan_diajukan(int) to authenticated;
