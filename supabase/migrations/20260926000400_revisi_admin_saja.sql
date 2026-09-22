-- Revisi V8 §11 — every revision goes to KUI: any disposisi role may still
-- ASK for one (aksi_approval(..., 'revision'), unchanged), but only Admin
-- uploads the fix before the next tier. The submitter no longer may.

create or replace function catat_revisi(p_id_proposal int, p_file text,
                                        p_catatan text default null,
                                        p_no_target_peminta int default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_jabatan_peminta int;
begin
  if not current_akun_is_io() then
    raise exception 'Only Admin (KUI) uploads a revised draft';
  end if;

  select dt.id_jabatan into v_jabatan_peminta
    from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where dt.no = p_no_target_peminta and d.id_proposal_dokumen = p_id_proposal;

  if v_jabatan_peminta is null or not revisi_terbuka(p_no_target_peminta) then
    raise exception 'Tidak ada permintaan revisi yang terbuka untuk dijawab';
  end if;

  update proposal_dokumen set file_draft = p_file where id = p_id_proposal;
  insert into revisi_proposal (id_proposal_dokumen, file_proposal, id_akun_pengunggah,
                               id_disposisi_target_peminta, catatan)
  values (p_id_proposal, p_file, current_akun_id(), p_no_target_peminta, p_catatan);

  insert into riwayat_approval (id_disposisi_target, id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_no_target_peminta, p_id_proposal, current_akun_id(), 'revision_submitted', p_catatan);

  perform catat_notifikasi('revision_submitted', v_jabatan_peminta, p_id_proposal,
                           null, null, p_catatan);
end;
$fn$;
