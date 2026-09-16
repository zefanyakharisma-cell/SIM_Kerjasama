-- Row-Level Security IS the access model, not a copy of it (EC-05).
-- Two axes (PRD §12): a stored app role on akun for "what can this account do",
-- and a DERIVED approver status -- an open disposisi_target matching the
-- account's jabatan -- for "can this account act on this document" (AR-01).

-- --------------------------------------------------------------------------
-- Helpers. STABLE so the planner evaluates them once per statement rather than
-- once per row.
-- --------------------------------------------------------------------------

-- Is this account an approver on this proposal? Derived, never stored.
create function akun_punya_target(p_id_proposal int) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
     where d.id_proposal_dokumen = p_id_proposal
       and dt.id_jabatan = (current_akun()).id_jabatan
       and dt.status <> 'removed'
  );
$fn$;

-- Is this proposal already a partnership record? Active documents are readable
-- by every logged-in user, files included -- a deliberate IO decision (AR-04).
create function proposal_sudah_aktif(p_id_proposal int) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from dokumen_kerja_sama where id_proposal_dokumen = p_id_proposal
  );
$fn$;

-- The one read rule, in one place. In-progress documents stay restricted to IO
-- and the accounts with a target on them (AR-05); a submitter reaches their own
-- (AR-03).
create function boleh_baca_proposal(p_id_proposal int) returns boolean
language sql stable security definer set search_path = public as $fn$
  select current_akun_is_io()
      or proposal_sudah_aktif(p_id_proposal)
      or akun_punya_target(p_id_proposal)
      or exists (select 1 from proposal_dokumen
                  where id = p_id_proposal and id_akun_pembuat = current_akun_id());
$fn$;

-- --------------------------------------------------------------------------
-- Master data — readable by any authenticated account, written by IO Admin.
-- --------------------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array['negara','jenis_unit','unit','jabatan','agenda',
                           'bidang_kerjasama','managed_options','settings',
                           'holidays','dashboard_chart','partner','partner_contact']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated using (current_akun_id() is not null)',
      t || '_baca', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using ((current_akun()).role = ''io_admin'')
         with check ((current_akun()).role = ''io_admin'')',
      t || '_kelola', t);
  end loop;
end
$rls$;

-- Partners grow by inline creation from the proposal form, so any account may
-- add one -- IO Admin owns merging and cleanup, not creation.
create policy partner_buat on partner for insert to authenticated
  with check (current_akun_id() is not null);
create policy partner_contact_buat on partner_contact for insert to authenticated
  with check (current_akun_id() is not null);

-- --------------------------------------------------------------------------
-- akun — every account can see the position directory (the approval UI names
-- positions and holders). Only IO Admin may change it.
-- --------------------------------------------------------------------------
alter table akun enable row level security;
create policy akun_baca on akun for select to authenticated
  using (current_akun_id() is not null);
create policy akun_kelola on akun for all to authenticated
  using ((current_akun()).role = 'io_admin')
  with check ((current_akun()).role = 'io_admin');

-- --------------------------------------------------------------------------
-- Proposals
-- --------------------------------------------------------------------------
alter table proposal_dokumen enable row level security;

create policy proposal_baca on proposal_dokumen for select to authenticated
  using (boleh_baca_proposal(id));

-- Anyone who can log in may propose; the row is stamped with their own account.
create policy proposal_buat on proposal_dokumen for insert to authenticated
  with check (id_akun_pembuat = current_akun_id());

-- IO corrects documents throughout; a submitter only while it is still a Draft.
create policy proposal_ubah on proposal_dokumen for update to authenticated
  using (current_akun_is_io()
         or (id_akun_pembuat = current_akun_id() and status_proposal = 'Draft'))
  with check (current_akun_is_io()
         or (id_akun_pembuat = current_akun_id() and status_proposal in ('Draft','Diajukan')));

-- No delete policy anywhere: documents are never hard-deleted (BR-09).

-- Child tables inherit the parent's read rule and IO's write rule.
do $rls$
declare t text;
begin
  foreach t in array array['proposal_dokumen_bidang','proposal_dokumen_agenda',
                           'proposal_dokumen_mou','proposal_dokumen_moa',
                           'partner_pengusul','pengusul','proposal_dokumen_unit']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated
         using (boleh_baca_proposal(id_proposal_dokumen))', t || '_baca', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (current_akun_is_io() or exists (
                  select 1 from proposal_dokumen p
                   where p.id = %I.id_proposal_dokumen
                     and p.id_akun_pembuat = current_akun_id()
                     and p.status_proposal = ''Draft''))
         with check (current_akun_is_io() or exists (
                  select 1 from proposal_dokumen p
                   where p.id = %I.id_proposal_dokumen
                     and p.id_akun_pembuat = current_akun_id()
                     and p.status_proposal = ''Draft''))',
      t || '_tulis', t, t, t);
  end loop;
end
$rls$;

-- --------------------------------------------------------------------------
-- Partnership records — readable by every authenticated account (AR-04).
-- --------------------------------------------------------------------------
alter table dokumen_kerja_sama enable row level security;
create policy dokumen_baca on dokumen_kerja_sama for select to authenticated
  using (current_akun_id() is not null);
create policy dokumen_kelola on dokumen_kerja_sama for all to authenticated
  using (current_akun_is_io()) with check (current_akun_is_io());

alter table penandatangan_petra enable row level security;
create policy penandatangan_petra_baca on penandatangan_petra for select to authenticated
  using (current_akun_id() is not null);
create policy penandatangan_petra_kelola on penandatangan_petra for all to authenticated
  using (current_akun_is_io()) with check (current_akun_is_io());

alter table penandatangan_partner enable row level security;
create policy penandatangan_partner_baca on penandatangan_partner for select to authenticated
  using (current_akun_id() is not null);
create policy penandatangan_partner_kelola on penandatangan_partner for all to authenticated
  using (current_akun_is_io()) with check (current_akun_is_io());

-- --------------------------------------------------------------------------
-- Workflow
-- --------------------------------------------------------------------------
alter table disposisi enable row level security;
create policy disposisi_baca on disposisi for select to authenticated
  using (id_proposal_dokumen is null or boleh_baca_proposal(id_proposal_dokumen));
create policy disposisi_kelola on disposisi for all to authenticated
  using (current_akun_is_io()) with check (current_akun_is_io());

alter table disposisi_target enable row level security;
create policy disposisi_target_baca on disposisi_target for select to authenticated
  using (exists (select 1 from disposisi d where d.no = no_disposisi
                   and (d.id_proposal_dokumen is null
                        or boleh_baca_proposal(d.id_proposal_dokumen))));

-- This is tier gating enforced at the database: an account may only touch a
-- target routed to its own position, and only while that target is actually
-- awaiting action (BR-01). The workflow functions are SECURITY DEFINER and run
-- above this, but nothing else can get underneath it.
create policy disposisi_target_aksi on disposisi_target for update to authenticated
  using (id_jabatan = (current_akun()).id_jabatan and status = 'pending_action')
  with check (id_jabatan = (current_akun()).id_jabatan);

create policy disposisi_target_kelola on disposisi_target for all to authenticated
  using (current_akun_is_io()) with check (current_akun_is_io());

-- Append-only logs: select and insert, never update or delete (DR-02).
alter table riwayat_approval enable row level security;
create policy riwayat_baca on riwayat_approval for select to authenticated
  using (id_proposal_dokumen is null or boleh_baca_proposal(id_proposal_dokumen));
create policy riwayat_tulis on riwayat_approval for insert to authenticated
  with check (current_akun_id() is not null);

alter table revisi_proposal enable row level security;
create policy revisi_baca on revisi_proposal for select to authenticated
  using (boleh_baca_proposal(id_proposal_dokumen));
create policy revisi_tulis on revisi_proposal for insert to authenticated
  with check (current_akun_is_io());

alter table pending_periods enable row level security;
create policy pending_baca on pending_periods for select to authenticated
  using (boleh_baca_proposal(id_proposal_dokumen));
create policy pending_kelola on pending_periods for all to authenticated
  using (current_akun_is_io()) with check (current_akun_is_io());

-- --------------------------------------------------------------------------
-- Renewal, evaluation, notifications
-- --------------------------------------------------------------------------
alter table evaluasi enable row level security;
create policy evaluasi_baca on evaluasi for select to authenticated
  using (current_akun_id() is not null);
create policy evaluasi_kelola on evaluasi for all to authenticated
  using (current_akun_is_io()) with check (current_akun_is_io());

-- No authenticated policy at all: the partner token path is unauthenticated and
-- runs through an Edge Function on the service role, scoped to exactly one
-- evaluasi (AR-07). Nothing in the app reads this table directly.
alter table partner_eval_token enable row level security;

alter table keputusan_pembaruan enable row level security;
create policy keputusan_baca on keputusan_pembaruan for select to authenticated
  using (current_akun_id() is not null);
create policy keputusan_tulis on keputusan_pembaruan for insert to authenticated
  with check (current_akun_is_io());

alter table notifikasi enable row level security;
create policy notifikasi_baca on notifikasi for select to authenticated
  using (id_jabatan_penerima = (current_akun()).id_jabatan or current_akun_is_io());
create policy notifikasi_tandai on notifikasi for update to authenticated
  using (id_jabatan_penerima = (current_akun()).id_jabatan)
  with check (id_jabatan_penerima = (current_akun()).id_jabatan);
