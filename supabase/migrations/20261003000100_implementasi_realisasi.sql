-- Implementasi tab reads SIM Realisasi (client revision 2026-10-03).
--
-- The Realization Form project shipped as SIM Realisasi, in its own `realisasi`
-- schema on this same database, and it never wrote implementasi_dokumen: it
-- records each Kegiatan in realisasi.activities and ties it to the cooperation
-- documents through realisasi.activity_documents. The Implementasi tab now
-- lists those activities, and implementasi_dokumen -- empty, with no writer --
-- goes.
--
-- Two read functions, both SECURITY DEFINER, because realisasi's own RLS keys
-- on realisasi.my_role(): an SIMKS account without a realisasi.account_roles
-- row sees no activity at all. The functions therefore apply SIMKS's rule
-- instead -- whoever may read the document (boleh_baca_proposal) may see what
-- was realized under it -- and expose activity-level data only: no participant
-- identities, and never the mobility_bundle (transcripts) file.
--
-- Scope is the whole renewal chain: activity_documents.chain_id already holds
-- realisasi.chain_root() of the document the activity was recorded against, so
-- a renewed agreement keeps its predecessor's activities (BR-13 resolved at
-- read time, as 20260923000200_implementasi.sql intended). Only `verified`
-- activities are shown; drafts and those still in review stay in SIM Realisasi.
--
-- plpgsql rather than sql: the realisasi schema is created by the SIM
-- Realisasi project, not by these migrations, so a local `db reset` has no
-- such schema. A plpgsql body is resolved at call time, and each function
-- returns nothing when the schema is absent instead of failing.

drop table implementasi_dokumen;

-- ============================================================================
-- 1. The activities of one document's renewal chain
-- ============================================================================
create function implementasi_kegiatan(p_no int)
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
                     where dk.no = p_no and boleh_baca_proposal(dk.id_proposal_dokumen)) then
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

-- ============================================================================
-- 2. One IA / IR file, for the download route
-- ============================================================================
-- Readable when the caller may read any document of the chain the activity
-- belongs to -- the same rows implementasi_kegiatan would have listed it on.
create function implementasi_berkas(p_id bigint)
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
                    and boleh_baca_proposal(dk.id_proposal_dokumen))
   limit 1;
end;
$fn$;

revoke all on function implementasi_kegiatan(int)  from public, anon;
revoke all on function implementasi_berkas(bigint) from public, anon;
grant execute on function implementasi_kegiatan(int)  to authenticated;
grant execute on function implementasi_berkas(bigint) to authenticated;
