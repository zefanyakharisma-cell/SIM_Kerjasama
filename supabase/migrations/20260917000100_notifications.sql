-- Phase 2 — workflow notifications (PRD §13.2, Design §7).
--
-- Every triggering event already writes exactly one riwayat_approval row, and
-- riwayat_approval is append-only, so one trigger over it catches every event
-- on every path -- including paths written later. The alternative, a
-- catat_notifikasi call inside each action function, is the same behaviour
-- spread over nine places that must each remember (BR-21: notification never
-- rolls back a transition, so this stays a plain insert and nothing raises).

-- Who owns a proposal, as a position: notifications go to a position's inbox,
-- which is a role account, so the current holder receives it (DR-06).
create function jabatan_pemilik_proposal(p_id_proposal int) returns int
language sql stable security definer set search_path = public as $fn$
  select a.id_jabatan from proposal_dokumen p
    join akun a on a.id = p.id_akun_pembuat
   where p.id = p_id_proposal;
$fn$;

-- An approver's inbox item. Fired when the target actually OPENS, not when it
-- is created: a tier-3 approver told to act while tier 1 is still running
-- would be told to do something the database will refuse (BR-01, BR-18).
create function notifikasi_target_terbuka() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_proposal int; v_dokumen int; v_jenis text;
begin
  if new.status <> 'pending_action'
     or (tg_op = 'UPDATE' and old.status = 'pending_action') then
    return new;
  end if;

  select d.id_proposal_dokumen, d.no_dokumen_kerjasama, d.jenis_disposisi
    into v_proposal, v_dokumen, v_jenis
    from disposisi d where d.no = new.no_disposisi;

  -- A renewal request is a task, not a gate, and says so (BR-24).
  perform catat_notifikasi(
    case when v_jenis = 'approval' then 'disposition_assigned'
         else 'renewal_request_assigned' end,
    new.id_jabatan, v_proposal, v_dokumen, new.no,
    case when v_jenis = 'approval'
         then 'Sebuah dokumen menunggu persetujuan jabatan Anda.'
         else 'Permintaan pembaruan dokumen ditujukan ke unit Anda.' end);
  return new;
end;
$fn$;

create trigger disposisi_target_notifikasi
  after insert or update of status on disposisi_target
  for each row execute function notifikasi_target_terbuka();

-- Everything else: the outcome of an action, told to the people who care about
-- the outcome -- IO, who chase, and the unit that submitted it.
create function notifikasi_dari_riwayat() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_jenis text;
  v_pemilik int;
  v_io int;
begin
  v_jenis := case new.aksi
    when 'approve'            then 'approved'
    when 'reject'             then 'rejected'
    when 'pending'            then 'pending'
    when 'revision_requested' then 'revision_requested'
    when 'reactivated'        then 'reactivated'
    else null end;

  if v_jenis is null or new.id_proposal_dokumen is null then
    return new;
  end if;

  v_pemilik := jabatan_pemilik_proposal(new.id_proposal_dokumen);
  if v_pemilik is not null then
    perform catat_notifikasi(v_jenis, v_pemilik, new.id_proposal_dokumen,
                             null, null, new.catatan);
  end if;

  for v_io in select * from jabatan_io() loop
    if v_io is distinct from v_pemilik then
      perform catat_notifikasi(v_jenis, v_io, new.id_proposal_dokumen,
                               null, null, new.catatan);
    end if;
  end loop;

  return new;
end;
$fn$;

create trigger riwayat_approval_notifikasi
  after insert on riwayat_approval
  for each row execute function notifikasi_dari_riwayat();

-- The unique index that makes the sweeps idempotent keys on a target, so these
-- event notifications (no target) fall outside it -- correctly: two revision
-- requests from the same approver are two events and deserve two notices.

grant execute on function jabatan_pemilik_proposal(int) to authenticated;

comment on function notifikasi_dari_riwayat is
  'One trigger over the append-only log, so every workflow event notifies on
   every path. Never raises: a notification failure must not roll back a
   transition (BR-21).';
