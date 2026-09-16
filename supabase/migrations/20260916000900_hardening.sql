-- Hardening pass, driven by the Supabase security advisors after RLS landed.
--
-- Supabase publishes every function in `public` as a PostgREST RPC endpoint, so
-- a SECURITY DEFINER function with no authority check of its own is reachable
-- by anyone holding the anon key. The advisor caught the exposure, and reading
-- the functions back showed four that checked nothing at all:
-- ajukan_proposal, kirim_disposisi, catat_revisi and arsipkan_dokumen.
-- Authorization is server-side on every action (AR-02).

-- --------------------------------------------------------------------------
-- 1. Close the RPC surface.
-- --------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function and `anon` inherits
-- it through PUBLIC, so revoking from `anon` alone changes nothing. Revoke the
-- default grant, then hand EXECUTE back deliberately.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- Predicates the RLS policies evaluate as the querying role, plus the account
-- lookup the app needs. Each answers only about the caller's own access.
grant execute on function current_akun()                  to authenticated;
grant execute on function current_akun_id()               to authenticated;
grant execute on function current_akun_is_io()            to authenticated;
grant execute on function akun_punya_target(int)          to authenticated;
grant execute on function proposal_sudah_aktif(int)       to authenticated;
grant execute on function boleh_baca_proposal(int)        to authenticated;
grant execute on function proposal_sedang_disposisi(int)  to authenticated;
grant execute on function unit_descendants(int)           to authenticated;
grant execute on function unit_seleksi_status(int, int)   to authenticated;
grant execute on function pengaturan(text, text)          to authenticated;
grant execute on function is_hari_kerja(date)             to authenticated;
grant execute on function tambah_hari_kerja(timestamptz, int)                 to authenticated;
grant execute on function hari_kerja_terpakai(timestamptz, timestamptz, int)  to authenticated;
grant execute on function bendera_sla(int)                to authenticated;

-- The workflow actions. Each checks its own authority; the grant only decides
-- who may reach the check.
grant execute on function ajukan_proposal(int)                     to authenticated;
grant execute on function kirim_disposisi(int, int[], text, text)  to authenticated;
grant execute on function aksi_approval(int, text, text)           to authenticated;
grant execute on function reaktivasi_pending(int)                  to authenticated;
grant execute on function tambah_target(int, int)                  to authenticated;
grant execute on function hapus_target(int)                        to authenticated;
grant execute on function catat_revisi(int, text, text, int)       to authenticated;
grant execute on function arsipkan_dokumen(int, text)              to authenticated;
grant execute on function aktivasi_dokumen(int, text, date, date, date, text, text, text)
  to authenticated;

-- recompute_tiers is deliberately absent from the grants: it is internal,
-- called by the action functions as the owner. No client reaches it.

-- --------------------------------------------------------------------------
-- 2. The missing authority checks.
-- --------------------------------------------------------------------------

-- A submitter may submit their own draft; IO may submit any.
create or replace function ajukan_proposal(p_id_proposal int) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_akun int := current_akun_id();
begin
  if v_akun is null then
    raise exception 'Authentication required';
  end if;
  if not (current_akun_is_io() or exists (
            select 1 from proposal_dokumen
             where id = p_id_proposal and id_akun_pembuat = v_akun)) then
    raise exception 'Only IO or the proposal owner may submit it';
  end if;

  update proposal_dokumen
     set status_proposal = 'Diajukan',
         waktu_proposal_dokumen = coalesce(waktu_proposal_dokumen, now())
   where id = p_id_proposal and status_proposal = 'Draft';
  if not found then
    raise exception 'Proposal % is not a Draft and cannot be submitted', p_id_proposal;
  end if;

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi)
  values (p_id_proposal, v_akun, 'submitted');
end;
$fn$;

-- IO handpicks approvers; routing is never automatic and never anyone else's.
create or replace function kirim_disposisi(p_id_proposal int, p_id_jabatan int[],
                                           p_pesan text default null,
                                           p_lampiran text default null)
returns int
language plpgsql security definer set search_path = public as $fn$
declare v_no_disposisi int; v_round int; v_jabatan int; v_tier smallint;
begin
  if not current_akun_is_io() then
    raise exception 'Only IO assigns dispositions';
  end if;
  if coalesce(array_length(p_id_jabatan, 1), 0) = 0 then
    raise exception 'A disposition needs at least one target position';
  end if;

  select coalesce(max(round_ke), 1) into v_round from disposisi
   where id_proposal_dokumen = p_id_proposal and jenis_disposisi = 'approval';

  insert into disposisi (id_proposal_dokumen, jenis_disposisi, round_ke,
                         pesan_disposisi, lampiran, id_akun_pengirim)
  values (p_id_proposal, 'approval', v_round, p_pesan, p_lampiran, current_akun_id())
  returning no into v_no_disposisi;

  foreach v_jabatan in array p_id_jabatan loop
    select tier_disposisi into v_tier from jabatan where id = v_jabatan;
    if v_tier is null then
      raise exception 'Position % has no approval tier; it cannot be an approver (BR-15)', v_jabatan;
    end if;
    insert into disposisi_target (no_disposisi, id_jabatan, tier, status)
    values (v_no_disposisi, v_jabatan, v_tier, 'waiting');
  end loop;

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_id_proposal, current_akun_id(), 'dispositioned', p_pesan);

  perform recompute_tiers(p_id_proposal);
  return v_no_disposisi;
end;
$fn$;

-- IO fixes the draft in place when an approver asks for a revision (BR-07).
create or replace function catat_revisi(p_id_proposal int, p_file text,
                                        p_catatan text default null,
                                        p_no_target_peminta int default null)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if not current_akun_is_io() then
    raise exception 'Only IO uploads a revised draft';
  end if;
  update proposal_dokumen set file_draft = p_file where id = p_id_proposal;
  insert into revisi_proposal (id_proposal_dokumen, file_proposal, id_akun_pengunggah,
                               id_disposisi_target_peminta, catatan)
  values (p_id_proposal, p_file, current_akun_id(), p_no_target_peminta, p_catatan);
end;
$fn$;

-- Archival is irreversible in practice and always IO's call.
create or replace function arsipkan_dokumen(p_no int, p_alasan text) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_id_proposal int;
begin
  if not current_akun_is_io() then
    raise exception 'Only IO archives a document';
  end if;
  update dokumen_kerja_sama set status = 'Diarsipkan', alasan_arsip = p_alasan
   where no = p_no
  returning id_proposal_dokumen into v_id_proposal;
  if not found then
    raise exception 'Document % does not exist', p_no;
  end if;
  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (v_id_proposal, current_akun_id(), 'archived', p_alasan);
end;
$fn$;

-- --------------------------------------------------------------------------
-- 3. Pin search_path everywhere, so a caller cannot shadow a table name and
--    change what an unqualified reference resolves to.
-- --------------------------------------------------------------------------
alter function current_akun_id() set search_path = public;
alter function current_akun_is_io() set search_path = public;
alter function unit_descendants(int) set search_path = public;
alter function unit_seleksi_status(int, int) set search_path = public;
alter function pengaturan(text, text) set search_path = public;
alter function is_hari_kerja(date) set search_path = public;
alter function tambah_hari_kerja(timestamptz, int) set search_path = public;
alter function hari_kerja_terpakai(timestamptz, timestamptz, int) set search_path = public;
alter function bendera_sla(int) set search_path = public;
alter function proposal_sedang_disposisi(int) set search_path = public;
alter function enforce_auto_renewed_no_end_date() set search_path = public;

comment on table partner_eval_token is
  'RLS enabled with NO policy, deliberately: no logged-in account reads this
   table. A partner token is resolved by an Edge Function on the service role,
   scoped to exactly one evaluasi and exposing nothing else (AR-07).';
