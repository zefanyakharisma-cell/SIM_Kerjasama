-- Workflow actions. Each is one transaction (EC-03) and each ends by calling
-- recompute_tiers, which is the only thing that moves a document between
-- disposition states (BR-03).
--
-- These are SECURITY DEFINER because they write the append-only logs, which no
-- role may write directly. They therefore check authority themselves rather
-- than relying on RLS.

-- Ajukan — Draft becomes a submission. Starts the turnaround KPI clock (DR-05).
create function ajukan_proposal(p_id_proposal int) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_akun int := current_akun_id();
begin
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

-- IO handpicks the approving positions; routing is never automatic.
-- The tier is frozen from jabatan at send time (BR-15).
create function kirim_disposisi(
  p_id_proposal int,
  p_id_jabatan  int[],
  p_pesan       text default null,
  p_lampiran    text default null
) returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_no_disposisi int;
  v_round int;
  v_jabatan int;
  v_tier smallint;
begin
  if coalesce(array_length(p_id_jabatan, 1), 0) = 0 then
    raise exception 'A disposition needs at least one target position';
  end if;

  select coalesce(max(round_ke), 1) into v_round
    from disposisi
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

-- The four approver actions. Their blast radii differ on purpose:
--   approve   — records the approval, may unlock the next tier
--   reject    — terminal; archives the document, no resume (BR-05)
--   pending   — freezes the document and stops the clock; IO reactivation
--               resets the ENTIRE approval to tier 1 (BR-06)
--   revision  — lightweight, in-place, logged; touches no other target and
--               does not freeze (BR-07)
create function aksi_approval(
  p_no_target int,
  p_aksi      text,
  p_catatan   text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_target record;
  v_id_proposal int;
  v_akun akun;
  v_hari int;
begin
  v_akun := current_akun();

  select dt.no, dt.id_jabatan, dt.status, dt.waktu_unlock,
         d.id_proposal_dokumen, d.jenis_disposisi
    into v_target
    from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where dt.no = p_no_target
   for update of dt;

  if not found then
    raise exception 'Disposition target % does not exist', p_no_target;
  end if;

  -- A renewal request is a task, not a gate; it never takes these actions
  -- (BR-24, BR-25).
  if v_target.jenis_disposisi <> 'approval' then
    raise exception 'Target % belongs to a renewal request and has no approve/reject path (BR-24)',
      p_no_target;
  end if;

  -- Approval order is enforced here, not by hiding a button (BR-01).
  if v_target.status <> 'pending_action' then
    raise exception 'Target % is % — only a target awaiting action can be acted on (BR-01)',
      p_no_target, v_target.status;
  end if;

  if v_akun.id is null or v_akun.id_jabatan <> v_target.id_jabatan then
    raise exception 'This account does not hold the position this target is routed to (AR-01)';
  end if;

  v_id_proposal := v_target.id_proposal_dokumen;
  v_hari := hari_kerja_terpakai(v_target.waktu_unlock, now(), v_id_proposal);

  if p_aksi = 'approve' then
    update disposisi_target
       set status = 'approved',
           waktu_resolusi = now(),
           -- Frozen on resolution: a later holidays edit must not rewrite
           -- history (DR-03).
           durasi_hari_kerja = v_hari,
           status_sla = bendera_sla(v_hari)
     where no = p_no_target;

  elsif p_aksi = 'reject' then
    update disposisi_target
       set status = 'rejected', waktu_resolusi = now(),
           durasi_hari_kerja = v_hari, status_sla = bendera_sla(v_hari)
     where no = p_no_target;

    -- Terminal: the document is archived with its reason and there is no
    -- un-reject path. Continuing needs a new proposal (BR-05, BR-10).
    insert into dokumen_kerja_sama (id_proposal_dokumen, status, alasan_arsip)
    values (v_id_proposal, 'Diarsipkan', 'rejected')
    on conflict (id_proposal_dokumen) do update
      set status = 'Diarsipkan', alasan_arsip = 'rejected';

  elsif p_aksi = 'pending' then
    -- Freeze. The target stays open; the whole approval resets when IO
    -- reactivates. Never a per-approver pause (BR-06).
    insert into pending_periods (id_proposal_dokumen, id_disposisi_target_pemicu)
    values (v_id_proposal, p_no_target);

  elsif p_aksi = 'revision' then
    -- Deliberately does nothing to any target: the requesting approver keeps
    -- their open action and re-approves the fixed draft (BR-07).
    null;

  else
    raise exception 'Unknown action %; expected approve / reject / pending / revision', p_aksi;
  end if;

  insert into riwayat_approval (id_disposisi_target, id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_no_target, v_id_proposal, v_akun.id,
          case when p_aksi = 'revision' then 'revision_requested' else p_aksi end,
          p_catatan);

  perform recompute_tiers(v_id_proposal);
end;
$fn$;

-- Reactivation: close the frozen span, open a NEW round carrying the same
-- positions, and re-gate from tier 1. Every prior approval in the old round
-- stands in the history but counts for nothing — that is the whole point of
-- Pending being the heavyweight action (BR-06).
--
-- The new round is new rows rather than a reset of the old ones, so
-- riwayat_approval keeps pointing at the targets that actually acted.
create function reaktivasi_pending(p_id_proposal int) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_round int;
  v_no_disposisi int;
  v_akun int := current_akun_id();
begin
  if not current_akun_is_io() then
    raise exception 'Only IO may reactivate a frozen document (PRD §4.2)';
  end if;

  update pending_periods
     set selesai = now(), id_akun_reaktivasi = v_akun
   where id_proposal_dokumen = p_id_proposal and selesai is null;

  if not found then
    raise exception 'Proposal % is not frozen', p_id_proposal;
  end if;

  select max(round_ke) into v_round
    from disposisi
   where id_proposal_dokumen = p_id_proposal and jenis_disposisi = 'approval';

  insert into disposisi (id_proposal_dokumen, jenis_disposisi, round_ke,
                         pesan_disposisi, id_akun_pengirim)
  values (p_id_proposal, 'approval', v_round + 1,
          'Reaktivasi setelah penangguhan — approval diulang dari Tier 1', v_akun)
  returning no into v_no_disposisi;

  -- Carry over every position that was still in play, tier and all.
  insert into disposisi_target (no_disposisi, id_jabatan, tier, status)
  select v_no_disposisi, dt.id_jabatan, dt.tier, 'waiting'
    from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = p_id_proposal
     and d.jenis_disposisi = 'approval'
     and d.round_ke = v_round
     and dt.status <> 'removed';

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_id_proposal, v_akun, 'reactivated',
          'Approval direset ke Tier 1 (round ' || (v_round + 1) || ')');

  perform recompute_tiers(p_id_proposal);
end;
$fn$;

-- Live disposition editing — allowed only while in-disposition (BR-33).
create function proposal_sedang_disposisi(p_id_proposal int) returns boolean
language sql stable as $fn$
  select status_proposal in ('Diproses','Disposisi - Tier 1','Disposisi - Tier 2','Disposisi - Tier 3')
    from proposal_dokumen where id = p_id_proposal;
$fn$;

-- Add an approver to the current round. The tier now waits for one more before
-- advancing; recompute_tiers works that out (BR-34).
create function tambah_target(p_id_proposal int, p_id_jabatan int) returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_no_disposisi int;
  v_tier smallint;
  v_no_target int;
  v_round int;
begin
  if not current_akun_is_io() then
    raise exception 'Only IO may edit the approver list';
  end if;
  if not proposal_sedang_disposisi(p_id_proposal) then
    raise exception 'The approver list is frozen once the document leaves disposition (BR-33)';
  end if;

  select max(round_ke) into v_round from disposisi
   where id_proposal_dokumen = p_id_proposal and jenis_disposisi = 'approval';

  select no into v_no_disposisi from disposisi
   where id_proposal_dokumen = p_id_proposal and jenis_disposisi = 'approval'
     and round_ke = v_round
   order by no desc limit 1;

  select tier_disposisi into v_tier from jabatan where id = p_id_jabatan;
  if v_tier is null then
    raise exception 'Position % has no approval tier (BR-15)', p_id_jabatan;
  end if;

  insert into disposisi_target (no_disposisi, id_jabatan, tier, status)
  values (v_no_disposisi, p_id_jabatan, v_tier, 'waiting')
  returning no into v_no_target;

  insert into riwayat_approval (id_disposisi_target, id_proposal_dokumen, id_akun, aksi)
  values (v_no_target, p_id_proposal, current_akun_id(), 'disposition_added');

  perform recompute_tiers(p_id_proposal);
  return v_no_target;
end;
$fn$;

-- Remove a still-pending approver. If they were the last blocker, the same
-- recompute that handles an add will advance the document (BR-35). An
-- already-approved target can never be removed — the approval stands (BR-36).
create function hapus_target(p_no_target int) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_target record;
begin
  if not current_akun_is_io() then
    raise exception 'Only IO may edit the approver list';
  end if;

  select dt.no, dt.status, d.id_proposal_dokumen into v_target
    from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where dt.no = p_no_target;

  if not found then
    raise exception 'Disposition target % does not exist', p_no_target;
  end if;
  if not proposal_sedang_disposisi(v_target.id_proposal_dokumen) then
    raise exception 'The approver list is frozen once the document leaves disposition (BR-33)';
  end if;
  if v_target.status = 'approved' then
    raise exception 'Target % has already approved and cannot be removed (BR-36)', p_no_target;
  end if;

  update disposisi_target set status = 'removed' where no = p_no_target;

  insert into riwayat_approval (id_disposisi_target, id_proposal_dokumen, id_akun, aksi)
  values (p_no_target, v_target.id_proposal_dokumen, current_akun_id(), 'disposition_removed');

  perform recompute_tiers(v_target.id_proposal_dokumen);
end;
$fn$;

-- A revision replaces the draft in place. There is no file version history;
-- this log row is the trace (BR-07).
create function catat_revisi(
  p_id_proposal int,
  p_file text,
  p_catatan text default null,
  p_no_target_peminta int default null
) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  update proposal_dokumen set file_draft = p_file where id = p_id_proposal;

  insert into revisi_proposal (id_proposal_dokumen, file_proposal, id_akun_pengunggah,
                               id_disposisi_target_peminta, catatan)
  values (p_id_proposal, p_file, current_akun_id(), p_no_target_peminta, p_catatan);
end;
$fn$;

-- Activation: signing happened offline, IO records the outcome. no_dokumen is
-- typed by IO and never generated or format-checked (BR-22).
create function aktivasi_dokumen(
  p_id_proposal          int,
  p_no_dokumen           text,
  p_tanggal_tanda_tangan date,
  p_tanggal_mulai        date,
  p_tanggal_berakhir     date default null,
  p_folder_kui           text default null,
  p_no_berkas_dikti      text default null,
  p_upload_dokumen       text default null
) returns int
language plpgsql security definer set search_path = public as $fn$
declare v_no int;
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

  update proposal_dokumen set waktu_aktif = now() where id = p_id_proposal;

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_id_proposal, current_akun_id(), 'activated', p_no_dokumen);

  return v_no;
end;
$fn$;

-- Documents are never hard-deleted; going inactive is a status change that
-- always carries a reason (BR-09, BR-10).
create function arsipkan_dokumen(p_no int, p_alasan text) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_id_proposal int;
begin
  update dokumen_kerja_sama
     set status = 'Diarsipkan', alasan_arsip = p_alasan
   where no = p_no
  returning id_proposal_dokumen into v_id_proposal;

  if not found then
    raise exception 'Document % does not exist', p_no;
  end if;

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (v_id_proposal, current_akun_id(), 'archived', p_alasan);
end;
$fn$;
