-- Revisi V8 §2 — a document does not go straight from "everyone approved" to
-- "activated": KUI prints it and it goes into physical signing first. "Siap
-- TTD" sits between Disetujui and Aktif; aktivasi_dokumen now requires it
-- instead of Disetujui, and only Admin may make that transition.

alter table proposal_dokumen drop constraint proposal_dokumen_status_proposal_check;
alter table proposal_dokumen add constraint proposal_dokumen_status_proposal_check
  check (status_proposal in (
    'Draft','Diajukan','Diproses',
    'Disposisi - Tier 1','Disposisi - Tier 2','Disposisi - Tier 3',
    'Pending','Disetujui','Siap TTD','Ditolak'));

-- Admin-only, and only from Disetujui — the same tier-gate guard aktivasi
-- itself uses, so a document cannot skip the print/signing step.
create function tandai_siap_ttd(p_id_proposal int) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if not current_akun_is_io() then
    raise exception 'Only Admin marks a document Siap TTD';
  end if;

  if (select status_proposal from proposal_dokumen where id = p_id_proposal) <> 'Disetujui' then
    raise exception 'Only a Disetujui proposal can be marked Siap TTD';
  end if;

  update proposal_dokumen set status_proposal = 'Siap TTD' where id = p_id_proposal;

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_id_proposal, current_akun_id(), 'siap_ttd',
          'Dokumen dicetak, memasuki proses tanda tangan.');
end;
$fn$;

grant execute on function tandai_siap_ttd(int) to authenticated;

-- aktivasi_dokumen: same body as 20260918000100_perbaikan_bug.sql, only the
-- required status changes (Disetujui -> Siap TTD).
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

  if (select status_proposal from proposal_dokumen where id = p_id_proposal) <> 'Siap TTD' then
    raise exception 'Only a Siap TTD proposal can be activated';
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
    -- One partner of record signs; with Mitra Utama removed (V8 §8) there is
    -- no more designated lead, so the first partner joined is the one of
    -- record — deterministic, not "whichever the client happened to send".
    select pp.id_partner into v_id_partner
      from partner_pengusul pp
     where pp.id_proposal_dokumen = p_id_proposal
     order by pp.id
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
  end if;

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_id_proposal, current_akun_id(), 'activated', p_no_dokumen);

  return v_no;
end;
$fn$;

grant execute on function aktivasi_dokumen(
  int, text, date, date, date, text, text, text, text, text, text, text
) to authenticated;
