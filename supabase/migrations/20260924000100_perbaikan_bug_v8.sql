-- Bug-fix pass over the V8 schema. Six findings, each in the style of the
-- migration it corrects; every function is superseded forward with
-- `create or replace` / `alter` -- no earlier migration is edited (DR-01).

-- ============================================================================
-- 1. simpan_anak_proposal accepted a partner-less proposal (DR-01).
--
-- A proposal without a mitra is not a proposal: partner_pengusul is what every
-- downstream read joins through (v_daftar_dokumen's nama_mitra/negara, the
-- lead-partner lookup in aktivasi_dokumen, the renewal evaluation's contact),
-- and `[]` produced a row set of zero with no complaint at all. The guard lives
-- HERE, in the one function every writer routes through -- proposal.ts's create
-- and edit, and catat_dokumen_langsung (20260923000300) which delegates to it --
-- rather than in each caller.
--
-- Latest prior definition: 20260923000100_sdg.sql (the 10-argument p_sdg
-- version). Body preserved verbatim apart from the added guard.
--
-- `create or replace`, not drop+create: the signature is unchanged, so the ACL
-- survives -- the revoke/grant below is re-issued anyway, because this codebase
-- revokes from public/anon by default (20260916000900_hardening.sql) and a
-- silently ungranted RPC is the exact failure mode that is hard to spot.
-- ============================================================================
create or replace function simpan_anak_proposal(
  p_id         int,
  p_partner    jsonb,  -- [{id_partner, is_lead}]
  p_id_jabatan int,
  p_bidang     int[],
  p_agenda     int[],
  p_unit       int[],
  p_jenis      text,
  p_mou        jsonb,  -- {ringkasan_kegiatan}
  p_moa        jsonb,  -- {hak_petra, hak_calon_mitra, kewajiban_petra, kewajiban_calon_mitra}
  p_sdg        int[] default '{}'
) returns void
language plpgsql set search_path = public as $fn$
begin
  if p_jenis is null or p_jenis not in ('MoU', 'MoA') then
    raise exception 'jenis_kerjasama must be MoU or MoA, got %', p_jenis;
  end if;

  -- DR-01: at least one mitra pengusul. Checked before the deletes below, so a
  -- rejected save leaves the existing child rows exactly as they were.
  if p_partner is null or jsonb_array_length(p_partner) = 0 then
    raise exception 'Proposal wajib memiliki minimal satu mitra pengusul';
  end if;

  delete from partner_pengusul where id_proposal_dokumen = p_id;
  delete from pengusul where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_bidang where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_agenda where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_unit where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_mou where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_moa where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_sdg where id_proposal_dokumen = p_id;

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

  if coalesce(array_length(p_sdg, 1), 0) > 0 then
    insert into proposal_dokumen_sdg (id_proposal_dokumen, nomor_sdg)
    select p_id, s from unnest(p_sdg) s;
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

revoke execute on function simpan_anak_proposal(
  int, jsonb, int, int[], int[], int[], text, jsonb, jsonb, int[]
) from public, anon;
grant execute on function simpan_anak_proposal(
  int, jsonb, int, int[], int[], int[], text, jsonb, jsonb, int[]
) to authenticated;

-- ============================================================================
-- 2. The dokumen-kerjasama bucket had no upload limits at all.
--
-- Created in 20260917001000_kerja_sama_report.sql with `public = false` and
-- nothing else, so any authenticated account passing one of the insert policies
-- could push a file of any size and any type into it. The RLS policies decide
-- WHO may write WHERE; the bucket decides HOW BIG and WHAT. Both are needed.
--
-- 20 MB, matched by the client-side pre-check in src/lib/unggah.ts -- the client
-- check is for the error message, this one is the boundary that actually holds.
-- MIME list: the three formats the Unggah Dokumen fields accept (PDF, .doc,
-- .docx).
-- ============================================================================
update storage.buckets
   set file_size_limit = 20971520,   -- 20 MB, in bytes
       allowed_mime_types = array[
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
       ]
 where id = 'dokumen-kerjasama';

-- ============================================================================
-- 3. The expiry-reminder cadence was hardcoded (DR-04).
--
-- `case when v_sisa_hari <= 60 then 7 else 30 end` -- three magic numbers in a
-- function whose every other threshold already reads from `settings`
-- (expiring_soon_months, renewal_red_days, ...). Changing the reminder rhythm
-- meant a migration; now it is a row.
--
-- Latest prior definition: 20260921000100_revisi_v7.sql (which superseded the
-- 20260918000700_status_evaluasi.sql body -- the same literals appeared there,
-- but that version is already dead code). Same signature, so the
-- `revoke ... from public, anon, authenticated` of 20260916001000_sweeps.sql
-- stands; pg_cron runs it as the superuser owner.
--
-- Defaults reproduce today's behaviour exactly: 60 / 7 / 30.
-- ============================================================================
create or replace function sapu_kedaluarsa()
returns table (ditandai int, diarsipkan int, diingatkan int)
language plpgsql security definer set search_path = public as $fn$
declare
  d record;
  v_ditandai int := 0;
  v_diarsipkan int := 0;
  v_diingatkan int := 0;
  v_sisa_hari int;
  v_jeda int;
  v_io int;
  -- Read once per sweep, not once per document (DR-04).
  v_ambang_dekat int := pengaturan('reminder_near_days','60')::int;
  v_jeda_dekat   int := pengaturan('reminder_near_cadence_days','7')::int;
  v_jeda_jauh    int := pengaturan('reminder_far_cadence_days','30')::int;
begin
  v_ditandai := segarkan_status_berakhir();

  update dokumen_kerja_sama
     set status = 'Diarsipkan',
         alasan_arsip = case when status_gerbang_pembaruan(no) = 'terminate'
                             then 'not_renewed' else 'expired_without_renewal' end
   where status in ('Aktif','Akan Berakhir')
     and tanggal_berakhir is not null
     and tanggal_berakhir < current_date;
  get diagnostics v_diarsipkan = row_count;

  for d in
    select dk.no, dk.tanggal_berakhir, p.id as id_proposal
      from dokumen_kerja_sama dk
      join proposal_dokumen p on p.id = dk.id_proposal_dokumen
     where dk.status = 'Akan Berakhir' and dk.tanggal_berakhir is not null
  loop
    v_sisa_hari := d.tanggal_berakhir - current_date;
    v_jeda := case when v_sisa_hari <= v_ambang_dekat then v_jeda_dekat else v_jeda_jauh end;

    if exists (select 1 from disposisi
                where no_dokumen_kerjasama = d.no
                  and jenis_disposisi = 'renewal_request') then
      continue;
    end if;

    if exists (
      select 1 from notifikasi
       where no_dokumen_kerjasama = d.no
         and jenis_notifikasi = 'expiring_soon'
         and waktu_kirim > now() - (v_jeda || ' days')::interval
    ) then
      continue;
    end if;

    for v_io in select * from jabatan_io() loop
      insert into notifikasi (jenis_notifikasi, id_jabatan_penerima,
                              no_dokumen_kerjasama, id_proposal_dokumen, isi, status)
      values ('expiring_soon', v_io, d.no, d.id_proposal,
              format('Dokumen berakhir pada %s (%s hari lagi).',
                     d.tanggal_berakhir, v_sisa_hari),
              'pending');
      v_diingatkan := v_diingatkan + 1;
    end loop;
  end loop;

  return query select v_ditandai, v_diarsipkan, v_diingatkan;
end;
$fn$;

-- The three rows themselves are seeded in seed.sql next to the other
-- thresholds; they are deliberately NOT inserted here. settings.key is unique,
-- and `supabase db reset` runs seed.sql after every migration -- an insert here
-- would collide with the seed. An already-running database simply falls through
-- to the defaults above, which are today's numbers, until an admin creates the
-- rows in Master Data (the same arrangement renewal_red_days and friends have).

-- expiry_cadence ('monthly_then_weekly_2mo') was seeded but read by nothing --
-- it described the cadence in prose while the code carried the numbers. The
-- three keys above replace it; the dead key is dropped here and removed from
-- seed.sql. A setting nobody reads is worse than no setting: it invites an
-- admin to change it and expect an effect.
delete from settings where key = 'expiry_cadence';

-- ============================================================================
-- 4. BR-19: the holiday-calendar warning only fired on a wholly EMPTY table.
--
-- seed.sql carried 2026 only, so on 1 Jan 2027 every 2027 holiday would have
-- been counted as a business day -- silently, because `exists (select 1 from
-- holidays)` was still true. And an SLA figure is frozen on resolution (DR-03),
-- so a wrong figure is wrong forever. The check now runs per calendar year
-- SPANNED BY THE COUNT, which is the only granularity that matches how the
-- table is maintained (the SKB 3 Menteri is published one year at a time).
--
-- Latest prior definition: 20260916000500_functions_core.sql (20260916000900
-- only did `alter function ... set search_path`, which create-or-replace on the
-- same signature preserves along with the grants from 20260916000900:35 and
-- 20260917000800:55). Body otherwise unchanged.
-- ============================================================================
create or replace function hari_kerja_terpakai(
  p_mulai timestamptz,
  p_sampai timestamptz,
  p_id_proposal int
) returns int
language plpgsql stable set search_path = public as $fn$
declare
  v_jumlah int;
  v_tahun int;
begin
  if p_mulai is null then return 0; end if;

  -- A holiday calendar that stops short of the year being counted must warn
  -- loudly, never silently count public holidays as business days (BR-19).
  -- Per-year, not merely "the table has rows": a 2026-only calendar is empty
  -- as far as a 2027 count is concerned.
  for v_tahun in
    select generate_series(extract(year from p_mulai::date)::int,
                           extract(year from coalesce(p_sampai, now())::date)::int)
  loop
    if not exists (
      select 1 from holidays where extract(year from tanggal)::int = v_tahun
    ) then
      raise warning 'holidays has no entry for %: business-day SLA for that year excludes weekends but no public holidays (BR-19)',
        v_tahun;
    end if;
  end loop;

  select count(*) into v_jumlah
  from generate_series(
         (p_mulai::date) + 1,
         (coalesce(p_sampai, now())::date),
         interval '1 day'
       ) as g(hari)
  where is_hari_kerja(g.hari::date)
    -- ...and the day was not spent frozen.
    and not exists (
      select 1 from pending_periods pp
      where pp.id_proposal_dokumen = p_id_proposal
        and g.hari::date >= pp.mulai::date
        and g.hari::date <= coalesce(pp.selesai, 'infinity'::timestamptz)::date
    );

  return v_jumlah;
end;
$fn$;

-- Same signature, so the ACL survives the replace -- re-issued regardless,
-- because 20260916000900_hardening.sql revokes from public/anon by default and
-- this function is called from the client through the reporting views.
revoke execute on function hari_kerja_terpakai(timestamptz, timestamptz, int) from public, anon;
grant execute on function hari_kerja_terpakai(timestamptz, timestamptz, int) to authenticated;

-- ============================================================================
-- 5. The nightly SLA sweep had no usable index.
--
-- sapu_sla() (20260916001000_sweeps.sql) scans `disposisi_target` on
-- `status = 'pending_action'` alone. The only index on the column is the
-- composite (id_jabatan, status) from 20260916000300_workflow.sql:54, whose
-- leading column the sweep does not filter on -- so it cannot serve the scan.
-- A partial index on the one status the sweep cares about is a fraction of the
-- table (resolved targets never re-enter it) and also serves the "my open
-- disposisi" counts.
-- ============================================================================
create index disposisi_target_pending_idx
  on disposisi_target (status)
  where status = 'pending_action';

-- ============================================================================
-- 6. revisi/<id>/ was writable at ANY document state.
--
-- dokumen_kerjasama_unggah_revisi (20260920000200_revisi_disposisi.sql) checked
-- only "the caller created this proposal" -- so the creator of a long-archived,
-- rejected or still-Draft proposal could keep writing files into its revision
-- folder forever. Its sibling dokumen_kerjasama_unggah_draf
-- (20260918000100_perbaikan_bug.sql) has always carried the matching state
-- condition (`status_proposal = 'Draft'`); this mirrors it.
--
-- WHICH STATES ARE ALLOWED, and why: not a status whitelist but the state that
-- actually authorises a revision upload -- an OPEN revision request on one of
-- the proposal's disposition targets, which is precisely the precondition
-- catat_revisi() itself enforces ('Tidak ada permintaan revisi yang terbuka
-- untuk dijawab'). That is the tighter, non-drifting equivalent of a status
-- list: it is true only while the proposal is mid-disposition with an approver
-- waiting (Diproses / Disposisi - Tier 1..3, and Pending when a tier was frozen
-- with a request still open), and false in Draft, Disetujui and Ditolak. The
-- coarse status guard is kept as well, so a terminal proposal is refused even
-- if a stale open request were ever left behind.
--
-- A policy has no ACL of its own, so drop+create needs no re-grant; the helper
-- revisi_terbuka(int) it calls is already granted to authenticated
-- (20260920000200:23) and is security definer.
-- ============================================================================
drop policy dokumen_kerjasama_unggah_revisi on storage.objects;
create policy dokumen_kerjasama_unggah_revisi on storage.objects for insert
  to authenticated with check (
    bucket_id = 'dokumen-kerjasama'
    and (storage.foldername(name))[1] = 'revisi'
    and (storage.foldername(name))[2] ~ '^[0-9]+$'
    and exists (
      select 1 from proposal_dokumen p
       where p.id = (storage.foldername(name))[2]::int
         and p.id_akun_pembuat = current_akun_id()
         and p.status_proposal not in ('Draft', 'Disetujui', 'Ditolak')
         and exists (
           select 1
             from disposisi_target dt
             join disposisi d on d.no = dt.no_disposisi
            where d.id_proposal_dokumen = p.id
              and revisi_terbuka(dt.no)
         )
    )
  );
