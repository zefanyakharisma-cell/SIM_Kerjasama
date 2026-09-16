-- Mandatory domain tests (rules.md §9).
--
-- Run directly against Postgres — no HTTP cycle, no framework. If any assertion
-- fails the script raises and the run stops. Needs supabase/seed.sql applied.
--
--   npm run db:test          (see scripts/run-db-tests.mjs)
--
-- Covers §9.1 tier gating with a gap · §9.2 pending reset · §9.3 SLA
-- pause/resume · §9.4 revision vs pending · §9.5 live disposition editing ·
-- §9.6 business-day arithmetic · §9.12 Lingkup cascade. §9.7-9.11 and §9.13
-- arrive with the sweeps, renewal and RLS work they test.

-- ===========================================================================
-- §9.1 — Tier gating with a gap: tiers 1 and 3 populated, tier 2 empty.
-- The empty tier must SKIP, not deadlock (BR-02).
-- ===========================================================================
do $t$
declare v_p int; v_t1 int; v_t3 int; v_s text; v_st text;
begin
  perform set_config('simks.akun_id','7',true);
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Draft',7) returning id into v_p;

  perform ajukan_proposal(v_p);
  perform kirim_disposisi(v_p, array[1,6], 'uji celah tier');

  select dt.no into v_t1 from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p and dt.tier = 1;
  select dt.no into v_t3 from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p and dt.tier = 3;

  select status into v_s from disposisi_target where no = v_t1;
  if v_s <> 'pending_action' then raise exception 'FAIL 9.1a: tier 1 should open, got %', v_s; end if;
  select status into v_s from disposisi_target where no = v_t3;
  if v_s <> 'waiting' then raise exception 'FAIL 9.1b: tier 3 should be locked, got %', v_s; end if;
  select status_proposal into v_st from proposal_dokumen where id = v_p;
  if v_st <> 'Disposisi - Tier 1' then raise exception 'FAIL 9.1c: got %', v_st; end if;

  perform set_config('simks.akun_id','1',true);
  perform aksi_approval(v_t1, 'approve', 'setuju');

  select status into v_s from disposisi_target where no = v_t3;
  if v_s <> 'pending_action' then
    raise exception 'FAIL 9.1d: empty tier 2 deadlocked tier 3, got %', v_s;
  end if;
  select status_proposal into v_st from proposal_dokumen where id = v_p;
  if v_st <> 'Disposisi - Tier 3' then raise exception 'FAIL 9.1e: got %', v_st; end if;

  perform set_config('simks.akun_id','6',true);
  perform aksi_approval(v_t3, 'approve');
  select status_proposal into v_st from proposal_dokumen where id = v_p;
  if v_st <> 'Disetujui' then raise exception 'FAIL 9.1f: got %', v_st; end if;
  if (select waktu_disetujui from proposal_dokumen where id = v_p) is null then
    raise exception 'FAIL 9.1g: waktu_disetujui not captured (DR-05)';
  end if;

  raise notice 'PASS 9.1 tier gating with a gap';

  delete from riwayat_approval where id_proposal_dokumen = v_p;
  delete from disposisi_target where no_disposisi in (select no from disposisi where id_proposal_dokumen = v_p);
  delete from disposisi where id_proposal_dokumen = v_p;
  delete from proposal_dokumen where id = v_p;
end
$t$;

-- ===========================================================================
-- §9.2 pending reset · §9.4 revision vs pending · §9.3 SLA pause/resume
-- ===========================================================================
do $t$
declare
  v_p int; v_pb int; v_t1 int; v_t2 int; v_s text; v_st text;
  v_round int; v_n int; a int; b int; c int;
begin
  perform set_config('simks.akun_id','7',true);
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoA','Draft',7) returning id into v_p;
  perform ajukan_proposal(v_p);
  perform kirim_disposisi(v_p, array[1,3], 'uji pending');

  select dt.no into v_t1 from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p and dt.tier = 1;
  select dt.no into v_t2 from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p and dt.tier = 2;

  perform set_config('simks.akun_id','1',true);
  perform aksi_approval(v_t1, 'approve');

  -- §9.4 — a revision is lightweight: it leaves siblings alone and never freezes.
  perform set_config('simks.akun_id','3',true);
  perform aksi_approval(v_t2, 'revision', 'mohon perbaiki periode');

  select status into v_s from disposisi_target where no = v_t2;
  if v_s <> 'pending_action' then raise exception 'FAIL 9.4a: revision moved the target to %', v_s; end if;
  select status into v_s from disposisi_target where no = v_t1;
  if v_s <> 'approved' then raise exception 'FAIL 9.4b: revision disturbed a sibling, got %', v_s; end if;
  if exists (select 1 from pending_periods where id_proposal_dokumen = v_p) then
    raise exception 'FAIL 9.4c: revision froze the document';
  end if;
  select status_proposal into v_st from proposal_dokumen where id = v_p;
  if v_st <> 'Disposisi - Tier 2' then raise exception 'FAIL 9.4d: got %', v_st; end if;

  -- §9.2 — pending is the heavyweight one: freeze, then full reset.
  perform aksi_approval(v_t2, 'pending', 'ada yang mendasar keliru');
  select status_proposal into v_st from proposal_dokumen where id = v_p;
  if v_st <> 'Pending' then raise exception 'FAIL 9.2a: got %', v_st; end if;
  if not exists (select 1 from pending_periods where id_proposal_dokumen = v_p and selesai is null) then
    raise exception 'FAIL 9.2b: no open frozen span opened';
  end if;

  perform set_config('simks.akun_id','7',true);
  perform reaktivasi_pending(v_p);

  select max(round_ke) into v_round from disposisi where id_proposal_dokumen = v_p;
  if v_round <> 2 then raise exception 'FAIL 9.2c: round_ke is %, expected 2', v_round; end if;
  if exists (select 1 from pending_periods where id_proposal_dokumen = v_p and selesai is null) then
    raise exception 'FAIL 9.2d: frozen span not closed on reactivation';
  end if;

  select count(*) into v_n from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p and d.round_ke = 2 and dt.status = 'approved';
  if v_n <> 0 then raise exception 'FAIL 9.2e: % approvals survived the reset', v_n; end if;

  select status_proposal into v_st from proposal_dokumen where id = v_p;
  if v_st <> 'Disposisi - Tier 1' then
    raise exception 'FAIL 9.2f: approval did not restart at tier 1, got %', v_st;
  end if;
  raise notice 'PASS 9.2 pending reset / 9.4 revision vs pending';

  -- §9.3 — the same window, one proposal frozen part of it. The difference must
  -- be exactly the business days inside the frozen span (BR-08).
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Draft',7) returning id into v_pb;

  a := hari_kerja_terpakai('2026-06-01'::timestamptz, '2026-06-12'::timestamptz, v_pb);
  insert into pending_periods (id_proposal_dokumen, mulai, selesai)
  values (v_pb, '2026-06-04'::timestamptz, '2026-06-09'::timestamptz);
  b := hari_kerja_terpakai('2026-06-01'::timestamptz, '2026-06-12'::timestamptz, v_pb);

  select count(*) into c
    from generate_series('2026-06-02'::date, '2026-06-12'::date, interval '1 day') g(h)
   where is_hari_kerja(g.h::date)
     and g.h::date between '2026-06-04'::date and '2026-06-09'::date;

  if c = 0 then raise exception 'FAIL 9.3a: test window contains no frozen business days'; end if;
  if a - b <> c then
    raise exception 'FAIL 9.3b: frozen days not netted out — open %, frozen %, span %', a, b, c;
  end if;
  raise notice 'PASS 9.3 SLA pause/resume (open % days, frozen-adjusted % days)', a, b;

  delete from pending_periods where id_proposal_dokumen in (v_p, v_pb);
  delete from riwayat_approval where id_proposal_dokumen = v_p;
  delete from disposisi_target where no_disposisi in (select no from disposisi where id_proposal_dokumen = v_p);
  delete from disposisi where id_proposal_dokumen = v_p;
  delete from proposal_dokumen where id in (v_p, v_pb);
end
$t$;

-- ===========================================================================
-- §9.5 live disposition editing · §9.6 business days · §9.12 Lingkup cascade
-- ===========================================================================
do $t$
declare v_p int; v_t1 int; v_t2a int; v_t2b int; v_s text; v_st text; v_ok boolean;
begin
  perform set_config('simks.akun_id','7',true);
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Draft',7) returning id into v_p;
  perform ajukan_proposal(v_p);
  perform kirim_disposisi(v_p, array[1,3], 'uji live edit');

  select dt.no into v_t1 from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p and dt.tier = 1;
  select dt.no into v_t2a from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p and dt.id_jabatan = 3;

  -- BR-01: a locked target cannot be acted on, however you reach it.
  begin
    perform set_config('simks.akun_id','3',true);
    perform aksi_approval(v_t2a, 'approve');
    raise exception 'FAIL BR-01: a tier-2 target was acted on while tier 1 was open';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
  end;

  perform set_config('simks.akun_id','1',true);
  perform aksi_approval(v_t1, 'approve');

  -- Add to the current tier: the tier must now wait for one more (BR-34).
  perform set_config('simks.akun_id','7',true);
  v_t2b := tambah_target(v_p, 4);
  select status into v_s from disposisi_target where no = v_t2b;
  if v_s <> 'pending_action' then raise exception 'FAIL 9.5a: added target is %', v_s; end if;

  perform set_config('simks.akun_id','3',true);
  perform aksi_approval(v_t2a, 'approve');
  select status_proposal into v_st from proposal_dokumen where id = v_p;
  if v_st <> 'Disposisi - Tier 2' then
    raise exception 'FAIL 9.5b: advanced with a blocker still open, got %', v_st;
  end if;

  -- An already-approved target can never be removed (BR-36).
  perform set_config('simks.akun_id','7',true);
  v_ok := false;
  begin perform hapus_target(v_t2a); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL 9.5c: an approved target was removed'; end if;

  -- Removing the LAST blocker advances the document (BR-35).
  perform hapus_target(v_t2b);
  select status_proposal into v_st from proposal_dokumen where id = v_p;
  if v_st <> 'Disetujui' then
    raise exception 'FAIL 9.5d: removing the last blocker did not advance, got %', v_st;
  end if;

  -- Editing is refused once the document leaves disposition (BR-33).
  v_ok := false;
  begin perform tambah_target(v_p, 5); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL 9.5e: approver list edited after approval'; end if;
  raise notice 'PASS 9.5 live disposition editing';

  -- §9.6 — business days
  if is_hari_kerja('2026-08-17') then raise exception 'FAIL 9.6a: holiday counted as a business day'; end if;
  if is_hari_kerja('2026-06-06') then raise exception 'FAIL 9.6b: Saturday counted'; end if;
  if is_hari_kerja('2026-06-07') then raise exception 'FAIL 9.6c: Sunday counted'; end if;
  if not is_hari_kerja('2026-06-08') then raise exception 'FAIL 9.6d: Monday not counted'; end if;
  if extract(isodow from tambah_hari_kerja('2026-06-05'::timestamptz, 1)) <> 1 then
    raise exception 'FAIL 9.6e: Friday + 1 business day did not land on Monday';
  end if;
  raise notice 'PASS 9.6 business-day arithmetic';

  -- §9.12 — recursive cascade and the derived tri-state
  if (select count(*) from unit_descendants(4)) <> 4 then
    raise exception 'FAIL 9.12a: SBM should have 4 descendants, got %',
      (select count(*) from unit_descendants(4));
  end if;
  if not exists (select 1 from unit_descendants(4) where id = 7) then
    raise exception 'FAIL 9.12b: cascade did not reach the grandchild level';
  end if;

  insert into proposal_dokumen_unit (id_proposal_dokumen, id_unit)
  select v_p, id from unit_descendants(4);
  if unit_seleksi_status(v_p, 4) <> 'checked' then
    raise exception 'FAIL 9.12c: all descendants selected but parent is %', unit_seleksi_status(v_p, 4);
  end if;

  delete from proposal_dokumen_unit where id_proposal_dokumen = v_p and id_unit = 8;
  if unit_seleksi_status(v_p, 4) <> 'indeterminate' then
    raise exception 'FAIL 9.12d: one child unchecked but parent is %', unit_seleksi_status(v_p, 4);
  end if;

  delete from proposal_dokumen_unit where id_proposal_dokumen = v_p;
  if unit_seleksi_status(v_p, 4) <> 'unchecked' then
    raise exception 'FAIL 9.12e: nothing selected but parent is %', unit_seleksi_status(v_p, 4);
  end if;
  raise notice 'PASS 9.12 Lingkup recursive cascade with tri-state';

  delete from riwayat_approval where id_proposal_dokumen = v_p;
  delete from disposisi_target where no_disposisi in (select no from disposisi where id_proposal_dokumen = v_p);
  delete from disposisi where id_proposal_dokumen = v_p;
  delete from proposal_dokumen where id = v_p;
end
$t$;
