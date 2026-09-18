-- Bug-fix pass over Phases 2-4. Eight independent findings; grouped by file
-- below, each with the rule ID it protects, in the same style as the
-- migrations it corrects.

-- ============================================================================
-- 1. aktivasi_dokumen: two overloads, one of them missing the renewal branch.
--
-- 20260917001100 added a 12-param overload (signatories) instead of replacing
-- the 8-param one from 20260917000400 (renewal archiving). The app calls with
-- named p_penandatangan_* args, so it always hit the 12-param body, which
-- never archived a renewal's predecessor (BR-12) — and a 5-positional-arg
-- caller (the tests) was ambiguous between the two. One signature, both
-- branches.
-- ============================================================================
drop function if exists aktivasi_dokumen(int, text, date, date, date, text, text, text);

create or replace function aktivasi_dokumen(
  p_id_proposal          int,
  p_no_dokumen           text,
  p_tanggal_tanda_tangan date,
  p_tanggal_mulai        date,
  p_tanggal_berakhir     date default null,
  p_folder_kui           text default null,
  p_no_berkas_dikti      text default null,
  p_upload_dokumen       text default null,
  p_penandatangan_petra  text default null,
  p_jabatan_petra        text default null,
  p_penandatangan_mitra  text default null,
  p_jabatan_mitra        text default null
) returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_no int;
  v_id_partner int;
  v_id_penandatangan_partner int;
  v_sebelumnya int;
begin
  if not current_akun_is_io() then
    raise exception 'Only IO activates a document';
  end if;

  if (select status_proposal from proposal_dokumen where id = p_id_proposal) <> 'Disetujui' then
    raise exception 'Only a fully approved proposal can be activated';
  end if;

  insert into dokumen_kerja_sama (
    id_proposal_dokumen, no_dokumen, tanggal_tanda_tangan, tanggal_mulai,
    tanggal_berakhir, status, folder_kui, no_berkas_dikti, upload_dokumen)
  values (
    p_id_proposal, p_no_dokumen, p_tanggal_tanda_tangan, p_tanggal_mulai,
    p_tanggal_berakhir, 'Aktif', p_folder_kui, p_no_berkas_dikti, p_upload_dokumen)
  returning no into v_no;

  if p_penandatangan_petra is not null and p_penandatangan_petra <> '' then
    insert into penandatangan_petra (no_dokumen_kerjasama, nama, jabatan)
    values (v_no, p_penandatangan_petra, nullif(p_jabatan_petra, ''));
  end if;

  if p_penandatangan_mitra is not null and p_penandatangan_mitra <> '' then
    -- The lead partner signs; on a single-partner document there is only one
    -- choice anyway (BR-29 already treats the lead as the one of record).
    select pp.id_partner into v_id_partner
      from partner_pengusul pp
     where pp.id_proposal_dokumen = p_id_proposal
     order by pp.is_lead desc
     limit 1;

    insert into penandatangan_partner (id_partner, no_dokumen_kerjasama, nama, jabatan)
    values (v_id_partner, v_no, p_penandatangan_mitra, nullif(p_jabatan_mitra, ''))
    returning id into v_id_penandatangan_partner;

    update dokumen_kerja_sama set id_penandatangan_partner = v_id_penandatangan_partner
     where no = v_no;
  end if;

  update proposal_dokumen set waktu_aktif = now() where id = p_id_proposal;

  select id_dokumen_sebelumnya into v_sebelumnya
    from proposal_dokumen where id = p_id_proposal;

  if v_sebelumnya is not null then
    update dokumen_kerja_sama
       set status = 'Diarsipkan', alasan_arsip = 'superseded_by_renewal'
     where id_proposal_dokumen = v_sebelumnya;

    insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
    values (v_sebelumnya, current_akun_id(), 'archived',
            'superseded_by_renewal — digantikan oleh dokumen ' || p_no_dokumen);
    -- Any future Implementation Arrangement transfers to the successor here;
    -- the Realization System's table does not exist yet (Phase 4).
  end if;

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_id_proposal, current_akun_id(), 'activated', p_no_dokumen);

  return v_no;
end;
$fn$;

grant execute on function aktivasi_dokumen(
  int, text, date, date, date, text, text, text, text, text, text, text
) to authenticated;

-- ============================================================================
-- 2. agregasi_grafik's default status filter excluded 'Akan Berakhir', which
-- is still an active agreement (the daily sweep only relabels it; see the
-- Aktif/Akan Berakhir/Kedaluarsa/Diarsipkan lifecycle). Same signature, so the
-- existing grant stands.
-- ============================================================================
create or replace function agregasi_grafik(p_config jsonb)
returns table (label text, nilai bigint)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_grouping text := coalesce(p_config ->> 'grouping', 'negara');
  v_sumber   text := coalesce(p_config ->> 'sumber_data', 'dokumen');
  v_maks     int  := least(coalesce((p_config ->> 'maks')::int, 10), 50);
  v_f_status text := nullif(p_config #>> '{filter,status}', '');
  v_f_jenis  text := nullif(p_config #>> '{filter,dokumen}', '');
  v_f_fak    text := nullif(p_config #>> '{filter,fakultas}', '');
  v_f_region text := nullif(p_config #>> '{filter,region}', '');
begin
  if v_grouping not in ('negara','jenis','status','fakultas','bulan') then
    raise exception 'Unknown grouping %', v_grouping;
  end if;
  if v_sumber not in ('dokumen','mitra') then
    raise exception 'Unknown metric %', v_sumber;
  end if;

  return query
  with dasar as (
    select d.*,
           case when d.is_international then 'Internasional' else 'Domestik' end as region
      from v_daftar_dokumen d
     -- Status defaults to every still-current agreement, not only 'Aktif' —
     -- 'Akan Berakhir' is the same agreement, just past the sweep's warning
     -- threshold. The archive stays a filter value, never a global toggle
     -- (PRD §8.2).
     where (v_f_status is null or d.status_tampil = v_f_status)
       and (v_f_status is not null or d.status_dokumen in ('Aktif','Akan Berakhir'))
       and (v_f_jenis is null or d.jenis_kerjasama = v_f_jenis)
       and (v_f_fak is null or d.unit_pengusul ilike '%' || v_f_fak || '%')
  ),
  disaring as (
    select * from dasar
     where v_f_region is null
        or (v_f_region = 'Internasional' and is_international)
        or (v_f_region = 'Domestik' and not is_international)
  ),
  dikelompokkan as (
    select
      case v_grouping
        when 'negara'   then coalesce(negara, 'Tidak diketahui')
        when 'jenis'    then jenis_kerjasama
        when 'status'   then status_tampil
        when 'fakultas' then coalesce(unit_pengusul, 'Tanpa unit')
        when 'bulan'    then to_char(coalesce(tanggal_mulai, waktu_proposal_dokumen::date),
                                     'YYYY-MM')
      end as label,
      id_proposal,
      nama_mitra
    from disaring
  )
  select g.label,
         case when v_sumber = 'mitra'
              then count(distinct g.nama_mitra)
              else count(distinct g.id_proposal) end as nilai
    from dikelompokkan g
   where g.label is not null
   group by g.label
   order by case when v_grouping = 'bulan' then null else 2 end desc nulls last,
            case when v_grouping = 'bulan' then g.label end
   limit v_maks;
end;
$fn$;

-- ============================================================================
-- 3. Draft edit data loss: proposal.ts deleted seven child tables and
-- re-inserted with no error checks and no transaction — a failed insert left
-- the draft with rows silently gone. One SECURITY INVOKER function (RLS still
-- applies, same as the direct table writes it replaces) does the delete+insert
-- atomically, so either all seven tables land or the whole call rolls back.
-- ============================================================================
create function simpan_anak_proposal(
  p_id         int,
  p_partner    jsonb,  -- [{id_partner, is_lead}]
  p_id_jabatan int,
  p_bidang     int[],
  p_agenda     int[],
  p_unit       int[],
  p_jenis      text,
  p_mou        jsonb,  -- {ringkasan_kegiatan}
  p_moa        jsonb   -- {hak_petra, hak_calon_mitra, kewajiban_petra, kewajiban_calon_mitra}
) returns void
language plpgsql set search_path = public as $fn$
begin
  if p_jenis is null or p_jenis not in ('MoU', 'MoA') then
    raise exception 'jenis_kerjasama must be MoU or MoA, got %', p_jenis;
  end if;

  delete from partner_pengusul where id_proposal_dokumen = p_id;
  delete from pengusul where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_bidang where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_agenda where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_unit where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_mou where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_moa where id_proposal_dokumen = p_id;

  insert into partner_pengusul (id_partner, id_proposal_dokumen, is_lead)
  select (x ->> 'id_partner')::int, p_id, coalesce((x ->> 'is_lead')::boolean, false)
    from jsonb_array_elements(coalesce(p_partner, '[]'::jsonb)) x;

  if p_id_jabatan is not null then
    insert into pengusul (id_jabatan, id_proposal_dokumen) values (p_id_jabatan, p_id);
  end if;

  if coalesce(array_length(p_bidang, 1), 0) > 0 then
    insert into proposal_dokumen_bidang (id_proposal_dokumen, id_bidang_kerjasama)
    select p_id, b from unnest(p_bidang) b;
  end if;

  if coalesce(array_length(p_agenda, 1), 0) > 0 then
    insert into proposal_dokumen_agenda (id_proposal_dokumen, id_agenda)
    select p_id, a from unnest(p_agenda) a;
  end if;

  if coalesce(array_length(p_unit, 1), 0) > 0 then
    insert into proposal_dokumen_unit (id_proposal_dokumen, id_unit)
    select p_id, u from unnest(p_unit) u;
  end if;

  if p_jenis = 'MoU' then
    insert into proposal_dokumen_mou (id_proposal_dokumen, ringkasan_kegiatan)
    values (p_id, coalesce(p_mou ->> 'ringkasan_kegiatan', ''));
  else
    insert into proposal_dokumen_moa (id_proposal_dokumen, hak_petra, hak_calon_mitra,
                                      kewajiban_petra, kewajiban_calon_mitra)
    values (p_id, coalesce(p_moa ->> 'hak_petra', ''), coalesce(p_moa ->> 'hak_calon_mitra', ''),
            coalesce(p_moa ->> 'kewajiban_petra', ''), coalesce(p_moa ->> 'kewajiban_calon_mitra', ''));
  end if;
end;
$fn$;

comment on function simpan_anak_proposal is
  'Replaces the seven child rows of a proposal atomically (create and edit
   alike). SECURITY INVOKER on purpose: it runs under the caller''s RLS, the
   same *_tulis policies that gated the direct table writes it replaces.';

grant execute on function simpan_anak_proposal(
  int, jsonb, int, int[], int[], int[], text, jsonb, jsonb
) to authenticated;

-- ============================================================================
-- 4. Draft upload: the only storage insert policy required io_admin, so a
-- submitter's own draft upload was always silently rejected. Adds a second
-- (permissive — policies OR together) insert policy for the draft's own
-- creator, scoped to their own proposal id and only while it is still Draft.
-- ============================================================================
create policy dokumen_kerjasama_unggah_draf on storage.objects for insert
  to authenticated with check (
    bucket_id = 'dokumen-kerjasama'
    and (storage.foldername(name))[1] = 'draft'
    and (storage.foldername(name))[2] ~ '^[0-9]+$'
    and exists (
      select 1 from proposal_dokumen p
       where p.id = (storage.foldername(name))[2]::int
         and p.id_akun_pembuat = current_akun_id()
         and p.status_proposal = 'Draft'
    )
  );

-- ============================================================================
-- 5. Private-draft files were readable by anyone with the anon/authenticated
-- key, since the select policy only matched bucket_id. Objects filed under
-- draft/<id>/ or disposisi/<id>/ now require boleh_baca_proposal(<id>); every
-- other path (e.g. activated documents) keeps the previous, simpler rule.
-- ============================================================================
drop policy dokumen_kerjasama_baca on storage.objects;
create policy dokumen_kerjasama_baca on storage.objects for select
  to authenticated using (
    bucket_id = 'dokumen-kerjasama'
    and (
      -- IS DISTINCT FROM, not NOT IN: a path with no folder at all (first
      -- segment NULL) must fall through to the permissive branch, not into
      -- NULL/deny (BR: fail open only for paths outside draft/disposisi).
      (
        (storage.foldername(name))[1] is distinct from 'draft'
        and (storage.foldername(name))[1] is distinct from 'disposisi'
      )
      or (
        (storage.foldername(name))[2] ~ '^[0-9]+$'
        and boleh_baca_proposal((storage.foldername(name))[2]::int)
      )
    )
  );

-- ============================================================================
-- 6. Primary-contact update: only io_admin may update partner (rls.sql's
-- master-data loop), so a submitter's `update partner set id_partner_contact`
-- was silently blocked by RLS — no error, no effect. A SECURITY DEFINER
-- function does the update after checking the contact actually belongs to the
-- partner, so a submitter can set it without needing partner-wide write access.
--
-- H1 fix: the original version only checked "logged in" + "contact belongs to
-- partner", which combined with partner_contact_buat (any authenticated user
-- may insert a contact for ANY partner) let any account hijack the primary
-- contact of any partner — and that contact is who receives the renewal
-- evaluation token (20260917000400_renewal.sql). Authorization is now: IO, or
-- the proposal is the caller's own Draft AND the partner is actually attached
-- to it via partner_pengusul. A submitter can still set the primary contact of
-- a partner they attach to their OWN draft — that is the product requirement
-- (Revisi V4 §1.a), not a residual bug; IO Admin owns cleanup afterwards.
-- ============================================================================
create function set_kontak_utama(p_id_proposal int, p_id_partner int, p_id_kontak int) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if current_akun_id() is null then
    raise exception 'Login diperlukan untuk mengubah kontak utama mitra';
  end if;

  if not current_akun_is_io() and not exists (
    select 1
      from proposal_dokumen pd
      join partner_pengusul pp on pp.id_proposal_dokumen = pd.id
     where pd.id = p_id_proposal
       and pd.id_akun_pembuat = current_akun_id()
       and pd.status_proposal = 'Draft'
       and pp.id_partner = p_id_partner
  ) then
    raise exception 'Tidak berwenang mengubah kontak utama mitra % pada proposal %',
      p_id_partner, p_id_proposal;
  end if;

  if not exists (
    select 1 from partner_contact where id = p_id_kontak and id_partner = p_id_partner
  ) then
    raise exception 'Kontak % bukan milik mitra %', p_id_kontak, p_id_partner;
  end if;

  update partner set id_partner_contact = p_id_kontak where id = p_id_partner;
end;
$fn$;

grant execute on function set_kontak_utama(int, int, int) to authenticated;

-- ============================================================================
-- 8. riwayat_tulis let any authenticated account insert any row, forging id_akun
-- and aksi both. Tightened to: the row must be the caller's own, on a proposal
-- they can read, and the aksi must be one the client is actually allowed to
-- write directly (everything else -- approve/reject/activated/archived/... --
-- comes only from the SECURITY DEFINER workflow functions, which bypass RLS
-- and are unaffected by this policy).
--
-- M1 fix: boleh_baca_proposal is true for every reader of an active document
-- (AR-04), so "can read it" let ANY logged-in account log 'created'/'edited'
-- against a proposal it never touched. Narrowed to: the caller is IO, or the
-- caller created the proposal_dokumen row the entry points at.
-- ============================================================================
drop policy riwayat_tulis on riwayat_approval;
create policy riwayat_tulis on riwayat_approval for insert to authenticated
  with check (
    id_akun = current_akun_id()
    and aksi in ('created', 'edited')
    and id_proposal_dokumen is not null
    and (
      current_akun_is_io()
      or exists (
        select 1 from proposal_dokumen p
         where p.id = riwayat_approval.id_proposal_dokumen
           and p.id_akun_pembuat = current_akun_id()
      )
    )
  );
