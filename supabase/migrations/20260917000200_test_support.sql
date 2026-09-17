-- Test support.
--
-- Every test block ends by removing the rows it created, and doing that inline
-- means repeating the same seven deletes in dependency order in every block —
-- which is where a test suite starts leaving debris behind. One function, in
-- one order, used by every block.
--
-- This is the only place in the schema that deletes a proposal. It exists for
-- tests alone: EXECUTE is granted to nobody, so no client and no route can
-- reach it, and BR-09 (documents are never hard-deleted) is untouched.
create function bersihkan_proposal_uji(p_id_proposal int) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_no int;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'bersihkan_proposal_uji is a test-only seam';
  end if;

  select no into v_no from dokumen_kerja_sama where id_proposal_dokumen = p_id_proposal;

  delete from notifikasi
   where id_proposal_dokumen = p_id_proposal
      or no_dokumen_kerjasama = v_no;
  delete from partner_eval_token
   where id_evaluasi in (select no from evaluasi where id_dokumen_kerjasama = v_no);
  delete from evaluasi where id_dokumen_kerjasama = v_no;
  delete from keputusan_pembaruan where id_dokumen_kerjasama = v_no;
  delete from penandatangan_petra where no_dokumen_kerjasama = v_no;
  delete from penandatangan_partner where no_dokumen_kerjasama = v_no;
  delete from riwayat_approval where id_proposal_dokumen = p_id_proposal;
  delete from revisi_proposal where id_proposal_dokumen = p_id_proposal;
  delete from pending_periods where id_proposal_dokumen = p_id_proposal;
  delete from disposisi_target
   where no_disposisi in (select no from disposisi
                           where id_proposal_dokumen = p_id_proposal
                              or no_dokumen_kerjasama = v_no);
  delete from disposisi
   where id_proposal_dokumen = p_id_proposal or no_dokumen_kerjasama = v_no;
  delete from dokumen_kerja_sama where id_proposal_dokumen = p_id_proposal;
  delete from proposal_dokumen where id = p_id_proposal;
end;
$fn$;

revoke execute on function bersihkan_proposal_uji(int) from public, anon, authenticated;
