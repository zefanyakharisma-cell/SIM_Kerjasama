-- Revisi V8 §12 — replace the flat legacy role list with the four roles the
-- university actually assigns: admin, user, user_staff, approver.
--
-- Approval itself stays derived from disposisi_target (AR-01) — nothing here
-- touches that axis. This migration only changes the other axis, "what can
-- this account do": reach settings/master data (admin), or create a proposal
-- at all (everyone except approver — Rektorat-only, approve-only per V8 §12.4).

-- ---------------------------------------------------------------------------
-- 1. Backfill, then swap the constraint. Must drop first: the old constraint
--    would reject the new values before a single row is updated.
-- ---------------------------------------------------------------------------
alter table akun drop constraint akun_role_check;

-- io_staff already collapsed into io_admin in V7 (20260921000100 §1); both
-- become admin, keeping every KUI duty (incl. revision uploads) unchanged.
update akun set role = 'admin' where role in ('io_admin', 'io_staff');

-- Dekan / Kepala UP become "user" (create + approve); every other account
-- that could create today (submitter, viewer) becomes "user_staff" (create
-- only) unless its jabatan name says otherwise. Best-effort: an admin
-- corrects individual accounts afterwards in Master Data.
update akun a
   set role = 'user'
  from jabatan j
 where a.id_jabatan = j.id
   and a.role in ('submitter', 'viewer')
   and (j.nama ilike '%dekan%'
        or j.nama ilike '%kepala up%'
        or j.nama ilike '%kepala unit pengelola%');

update akun set role = 'user_staff' where role in ('submitter', 'viewer');

alter table akun add constraint akun_role_check
  check (role in ('admin', 'user', 'user_staff', 'approver'));

-- ---------------------------------------------------------------------------
-- 2. Helpers. Same signatures as before, so every existing call site (RLS
--    policies, Server Actions, current_akun_is_io() in src/) keeps working
--    unchanged — only what counts as "IO" moves from two roles to one.
-- ---------------------------------------------------------------------------
create or replace function current_akun_is_io() returns boolean
language sql stable as $fn$
  select coalesce((current_akun()).role = 'admin', false);
$fn$;

create or replace function jabatan_io() returns setof int
language sql stable set search_path = public as $fn$
  select distinct id_jabatan from akun
   where role = 'admin' and is_active;
$fn$;

-- New: who may author a proposal. Only Approver (Rektorat) is excluded —
-- everyone else could create today and keeps that (V8 §12).
create function current_akun_dapat_buat() returns boolean
language sql stable as $fn$
  select coalesce((current_akun()).role <> 'approver', false);
$fn$;

grant execute on function current_akun_dapat_buat() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS: every "_kelola" policy literally gated on 'io_admin' moves to
--    'admin'. Same table list as 20260916000800_rls.sql,
--    20260917001200_jenis_mitra.sql and 20260917001300_split_tujuan_manfaat.sql.
-- ---------------------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array['negara','jenis_unit','unit','jabatan','agenda',
                           'bidang_kerjasama','managed_options','settings',
                           'holidays','dashboard_chart','partner','partner_contact',
                           'jenis_mitra','tujuan_kerjasama','manfaat_petra','manfaat_mitra']
  loop
    execute format('drop policy %I on %I', t || '_kelola', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using ((current_akun()).role = ''admin'')
         with check ((current_akun()).role = ''admin'')',
      t || '_kelola', t);
  end loop;
end
$rls$;

drop policy akun_kelola on akun;
create policy akun_kelola on akun for all to authenticated
  using ((current_akun()).role = 'admin')
  with check ((current_akun()).role = 'admin');

-- Approver may never author or keep editing a proposal of their own.
drop policy proposal_buat on proposal_dokumen;
create policy proposal_buat on proposal_dokumen for insert to authenticated
  with check (id_akun_pembuat = current_akun_id() and current_akun_dapat_buat());

drop policy proposal_ubah on proposal_dokumen;
create policy proposal_ubah on proposal_dokumen for update to authenticated
  using (current_akun_is_io()
         or (id_akun_pembuat = current_akun_id() and status_proposal = 'Draft'))
  with check (current_akun_is_io()
         or (id_akun_pembuat = current_akun_id() and status_proposal in ('Draft','Diajukan')
             and current_akun_dapat_buat()));

-- ---------------------------------------------------------------------------
-- 4. The one function that read the role literally rather than through a
--    helper (20260917000500_analytics_admin.sql).
-- ---------------------------------------------------------------------------
create or replace function gabung_partner(p_dari int, p_ke int) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if (select role from akun where id = current_akun_id()) <> 'admin' then
    raise exception 'Only IO Admin merges partner records';
  end if;
  if p_dari = p_ke then
    raise exception 'A partner cannot be merged into itself';
  end if;
  if not exists (select 1 from partner where id = p_dari and is_active)
     or not exists (select 1 from partner where id = p_ke and is_active) then
    raise exception 'Both partners must exist and be active';
  end if;

  delete from partner_pengusul pp
   where pp.id_partner = p_dari
     and exists (select 1 from partner_pengusul lain
                  where lain.id_partner = p_ke
                    and lain.id_proposal_dokumen = pp.id_proposal_dokumen);

  update partner_pengusul set id_partner = p_ke where id_partner = p_dari;
  update partner_contact  set id_partner = p_ke where id_partner = p_dari;
  update penandatangan_partner set id_partner = p_ke where id_partner = p_dari;

  update partner set id_partner_contact = coalesce(
      id_partner_contact,
      (select id from partner_contact where id_partner = p_ke order by id limit 1))
   where id = p_ke;

  update partner
     set id_merged_into = p_ke, is_active = false, id_partner_contact = null
   where id = p_dari;
end;
$fn$;
