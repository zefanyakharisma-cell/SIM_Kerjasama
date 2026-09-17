-- Disetujui tab's activation form (revision V3): records both signatories
-- inline instead of as a separate follow-up step. New trailing, defaulted
-- parameters only — the existing call sites keep working unchanged.
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

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_id_proposal, current_akun_id(), 'activated', p_no_dokumen);

  return v_no;
end;
$fn$;
