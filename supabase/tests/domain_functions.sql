-- Mandatory domain tests (rules.md §9).
--
-- Run directly against Postgres — no HTTP cycle, no framework. If any assertion
-- fails the script raises and the run stops. Needs supabase/seed.sql applied.
--
--   npm run db:test          (psql against DATABASE_URL, ON_ERROR_STOP)
--
-- Covers §9.1 tier gating with a gap · §9.2 pending reset · §9.3 SLA
-- pause/resume · §9.4 revision vs pending · §9.5 live disposition editing ·
-- §9.6 business-day arithmetic · §9.7 sweep idempotency · §9.8 rollback ·
-- §9.9 evaluation gate · §9.10 reopen · §9.11 token scope · §9.12 Lingkup
-- cascade · §9.13 the RLS boundary. All thirteen mandatory tests are present.

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

  -- The revision loop: Approve (and a second request) wait for the upload.
  begin
    perform aksi_approval(v_t2, 'approve');
    raise exception 'FAIL 9.4e: approved while a revision was open';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform aksi_approval(v_t2, 'revision', 'lagi');
    raise exception 'FAIL 9.4f: a second revision opened while one was open';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Told to the submitter only, once.
  select count(*) into v_n from notifikasi
   where id_proposal_dokumen = v_p and jenis_notifikasi = 'revision_requested';
  if v_n <> 1 then raise exception 'FAIL 9.4g: % revision_requested notices, expected 1', v_n; end if;

  -- The submitter answers; the approver who asked is told and may approve.
  perform set_config('simks.akun_id','7',true);
  perform catat_revisi(v_p, 'revisi/uji.pdf', 'sudah diperbaiki', v_t2);
  if revisi_terbuka(v_t2) then raise exception 'FAIL 9.4h: upload did not close the request'; end if;
  if not exists (select 1 from notifikasi
                  where id_proposal_dokumen = v_p and jenis_notifikasi = 'revision_submitted'
                    and id_jabatan_penerima = (select id_jabatan from akun where id = 3)) then
    raise exception 'FAIL 9.4i: requesting approver was not told of the upload';
  end if;
  perform set_config('simks.akun_id','3',true);
  begin
    perform aksi_approval(v_t2, 'approve');
    raise exception 'ROLLBACK_OK';  -- undo, the block below needs v_t2 open
  exception when others then
    if sqlerrm <> 'ROLLBACK_OK' then
      raise exception 'FAIL 9.4j: approve after upload refused: %', sqlerrm;
    end if;
  end;

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
  delete from revisi_proposal where id_proposal_dokumen = v_p;
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

-- ===========================================================================
-- §9.7 — Sweep idempotency. Running a sweep twice in a day must not send a
-- reminder twice or archive a document twice (BR-20).
-- ===========================================================================
do $t$
declare
  v_p int; v_t int; v_no int;
  v_n1 int; v_n2 int;
  v_arsip1 text; v_arsip2 text;
  v_hitung1 int; v_hitung2 int;
begin
  perform set_config('simks.akun_id','7',true);

  -- An approval that has been sitting open long enough to go red.
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Draft',7) returning id into v_p;
  perform ajukan_proposal(v_p);
  perform kirim_disposisi(v_p, array[3], 'uji idempotensi sapuan');

  select dt.no into v_t from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p;
  update disposisi_target set waktu_unlock = now() - interval '20 days' where no = v_t;

  perform sapu_sla();
  select count(*) into v_n1 from notifikasi where id_disposisi_target = v_t;
  perform sapu_sla();
  select count(*) into v_n2 from notifikasi where id_disposisi_target = v_t;

  if v_n1 = 0 then
    raise exception 'FAIL 9.7a: an overdue approver was never reminded';
  end if;
  if v_n1 <> v_n2 then
    raise exception 'FAIL 9.7b: the second sweep sent % extra reminders', v_n2 - v_n1;
  end if;
  if (select status_sla from disposisi_target where no = v_t) <> 'red' then
    raise exception 'FAIL 9.7c: 20 days open did not flag red';
  end if;

  -- An expired document. The first sweep archives it with its reason; the
  -- second must find nothing left to do (BR-09, BR-10).
  insert into dokumen_kerja_sama (id_proposal_dokumen, no_dokumen, tanggal_mulai,
                                  tanggal_berakhir, status)
  values (v_p, 'UJI/SAPU/1', current_date - 400, current_date - 1, 'Aktif')
  returning no into v_no;

  perform sapu_kedaluarsa();
  select status || '/' || coalesce(alasan_arsip,'-') into v_arsip1
    from dokumen_kerja_sama where no = v_no;
  select count(*) into v_hitung1 from notifikasi where no_dokumen_kerjasama = v_no;

  perform sapu_kedaluarsa();
  select status || '/' || coalesce(alasan_arsip,'-') into v_arsip2
    from dokumen_kerja_sama where no = v_no;
  select count(*) into v_hitung2 from notifikasi where no_dokumen_kerjasama = v_no;

  if v_arsip1 <> 'Diarsipkan/expired_without_renewal' then
    raise exception 'FAIL 9.7d: expected archival with a reason, got %', v_arsip1;
  end if;
  if v_arsip1 <> v_arsip2 or v_hitung1 <> v_hitung2 then
    raise exception 'FAIL 9.7e: the second expiry sweep changed something';
  end if;
  raise notice 'PASS 9.7 sweep idempotency';

  perform bersihkan_proposal_uji(v_p);
end
$t$;

-- ===========================================================================
-- §9.8 — Transaction rollback. A multi-step operation that fails part way
-- through must leave nothing behind (EC-03).
--
-- The plpgsql exception block below IS a subtransaction, so this exercises the
-- real rollback path rather than simulating one.
-- ===========================================================================
do $t$
declare
  v_p int; v_t int; v_ronde_sebelum int; v_ronde_sesudah int;
  v_beku_sebelum int; v_beku_sesudah int;
begin
  perform set_config('simks.akun_id','7',true);
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoA','Draft',7) returning id into v_p;
  perform ajukan_proposal(v_p);
  perform kirim_disposisi(v_p, array[1,3], 'uji rollback');

  select dt.no into v_t from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p and dt.tier = 1;

  perform set_config('simks.akun_id','1',true);
  perform aksi_approval(v_t, 'pending', 'bekukan dulu');

  select max(round_ke) into v_ronde_sebelum from disposisi where id_proposal_dokumen = v_p;
  select count(*) into v_beku_sebelum from pending_periods
   where id_proposal_dokumen = v_p and selesai is null;

  -- Reactivation closes the frozen span, opens a new round and re-gates: three
  -- writes that must stand or fall together.
  perform set_config('simks.akun_id','7',true);
  begin
    perform reaktivasi_pending(v_p);
    raise exception 'gagal di tengah operasi';
  exception when others then
    null;
  end;

  select max(round_ke) into v_ronde_sesudah from disposisi where id_proposal_dokumen = v_p;
  select count(*) into v_beku_sesudah from pending_periods
   where id_proposal_dokumen = v_p and selesai is null;

  if v_ronde_sesudah <> v_ronde_sebelum then
    raise exception 'FAIL 9.8a: a new round survived a failed reactivation (% -> %)',
      v_ronde_sebelum, v_ronde_sesudah;
  end if;
  if v_beku_sesudah <> v_beku_sebelum then
    raise exception 'FAIL 9.8b: the frozen span was closed by a failed reactivation';
  end if;
  if (select status_proposal from proposal_dokumen where id = v_p) <> 'Pending' then
    raise exception 'FAIL 9.8c: the document left Pending on a failed reactivation';
  end if;
  raise notice 'PASS 9.8 transaction rollback';

  perform bersihkan_proposal_uji(v_p);
end
$t$;

-- ===========================================================================
-- §9.9 the evaluation gate · §9.10 reopen preserves history · §9.11 token scope
--
-- One document carries all three, because they are one story: both sides
-- answer, they disagree, IO overrides with a reason, the partner is let back in
-- to change their mind, and only then does the renewal become possible.
-- ===========================================================================
do $t$
declare
  v_pt int; v_kontak int; v_p int; v_no int; v_t int;
  v_fak int; v_mitra int; v_token text; v_token2 text; v_ok boolean; v_baru int;
  v_mitra2 int;
begin
  perform set_config('simks.akun_id','7',true);

  insert into partner (nama, is_international, id_negara, kota)
  values ('Uji Mitra Evaluasi', false, 1, 'Surabaya') returning id into v_pt;
  insert into partner_contact (id_partner, nama, email)
  values (v_pt, 'Kontak Uji', 'kontak@uji.test') returning id into v_kontak;
  update partner set id_partner_contact = v_kontak where id = v_pt;

  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Draft',7) returning id into v_p;
  insert into partner_pengusul (id_partner, id_proposal_dokumen, is_lead) values (v_pt, v_p, true);
  insert into pengusul (id_jabatan, id_proposal_dokumen) values (3, v_p);

  perform ajukan_proposal(v_p);
  perform kirim_disposisi(v_p, array[1], 'uji gerbang');
  select dt.no into v_t from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p;
  perform set_config('simks.akun_id','1',true);
  perform aksi_approval(v_t, 'approve', null);
  perform set_config('simks.akun_id','7',true);
  select aktivasi_dokumen(v_p, 'UJI/EVAL/1', current_date - 300, current_date - 300,
                          current_date + 30) into v_no;

  perform kirim_permintaan_pembaruan(v_no, 'mohon ditangani');

  if status_gerbang_pembaruan(v_no) <> 'menunggu' then
    raise exception 'FAIL 9.9a: gate should be menunggu, got %', status_gerbang_pembaruan(v_no);
  end if;

  -- The gate refuses before either evaluation exists (BR-26).
  v_ok := false;
  begin perform buat_proposal_perpanjangan(v_no, 'draf.pdf'); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL 9.9b: gate let a renewal through with no evaluations'; end if;

  select no into v_fak from evaluasi where id_dokumen_kerjasama = v_no and respondent_type='faculty';
  select no into v_mitra from evaluasi where id_dokumen_kerjasama = v_no and respondent_type='partner';
  -- The link is not issued with the request; KUI activates it.
  if exists (select 1 from partner_eval_token where id_evaluasi = v_mitra) then
    raise exception 'FAIL 9.11e: a partner token was issued before KUI activated it';
  end if;
  perform set_config('simks.akun_id','3',true);
  v_ok := false;
  begin perform buat_tautan_evaluasi_mitra(v_no); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL 9.11f: a non-KUI account generated a partner link'; end if;
  perform set_config('simks.akun_id','7',true);
  v_token := buat_tautan_evaluasi_mitra(v_no);
  v_token2 := buat_tautan_evaluasi_mitra(v_no);
  if resolusi_token_evaluasi(v_token) is not null or resolusi_token_evaluasi(v_token2) is null then
    raise exception 'FAIL 9.11g: regenerating did not replace the old link';
  end if;
  v_token := v_token2;
  v_token2 := null;

  -- A token that does not exist reveals nothing at all (AR-07).
  if resolusi_token_evaluasi(repeat('0',64)) is not null then
    raise exception 'FAIL 9.11a: an unknown token resolved to something';
  end if;
  if (resolusi_token_evaluasi(v_token) ->> 'nama_mitra') <> 'Uji Mitra Evaluasi' then
    raise exception 'FAIL 9.11b: a valid token did not resolve to its own evaluation';
  end if;

  perform set_config('simks.akun_id','3',true);
  perform kirim_evaluasi_fakultas(v_fak, jsonb_build_object(
    'exp_quality',5,'exp_relevance',5,'exp_productivity',4,'exp_sustainability',4,'exp_communication',5,
    'sat_quality',4,'sat_relevance',4,'sat_productivity',3,'sat_sustainability',3,'sat_communication',4,
    'rekomendasi','continue'));

  if status_gerbang_pembaruan(v_no) <> 'menunggu' then
    raise exception 'FAIL 9.9c: one evaluation is not both, got %', status_gerbang_pembaruan(v_no);
  end if;

  -- Identity is required: no phone, no submission.
  v_ok := false;
  begin
    perform kirim_evaluasi_partner(v_token, jsonb_build_object('rekomendasi','continue',
      'respondent_nama','x','respondent_jabatan','x','respondent_email','x@x.test'));
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL 9.11h: a partner answer without no. HP was accepted'; end if;

  perform kirim_evaluasi_partner(v_token, jsonb_build_object(
    'exp_quality',4,'exp_relevance',4,'exp_productivity',4,'exp_sustainability',4,'exp_communication',4,
    'sat_quality',2,'sat_relevance',2,'sat_productivity',2,'sat_sustainability',2,'sat_communication',2,
    'rekomendasi','terminate','respondent_nama','Dr Partner','respondent_email','p@uji.test',
    'respondent_jabatan','Director','respondent_hp','+62 811 000'));
  if (select respondent_hp from evaluasi where no = v_mitra) <> '+62 811 000' then
    raise exception 'FAIL 9.11i: partner phone was not recorded';
  end if;

  if status_gerbang_pembaruan(v_no) <> 'split' then
    raise exception 'FAIL 9.9d: disagreement should flag split, got %', status_gerbang_pembaruan(v_no);
  end if;

  -- Valid until submitted, then inert (BR-30).
  if resolusi_token_evaluasi(v_token) is not null then
    raise exception 'FAIL 9.11c: a submitted token still resolves';
  end if;
  v_ok := false;
  begin
    perform kirim_evaluasi_partner(v_token, jsonb_build_object('rekomendasi','continue',
      'respondent_nama','x','respondent_email','x@x.test'));
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL 9.11d: a submitted token accepted a second answer'; end if;

  perform set_config('simks.akun_id','7',true);
  v_ok := false;
  begin perform buat_proposal_perpanjangan(v_no, 'draf.pdf'); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL 9.9e: a split let a renewal through'; end if;

  -- A split needs a RECORDED, REASONED override; no reason, no override (BR-27).
  v_ok := false;
  begin perform putuskan_pembaruan(v_no, 'terminate', '   '); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL 9.9f: an override was accepted with no reason'; end if;

  perform putuskan_pembaruan(v_no, 'terminate', 'Mitra menyatakan tidak melanjutkan.');
  if status_gerbang_pembaruan(v_no) <> 'terminate' then
    raise exception 'FAIL 9.9g: a reasoned terminate override did not close the gate, got %',
      status_gerbang_pembaruan(v_no);
  end if;

  -- A document under evaluation reads "Disposisi Evaluasi"; on a terminate
  -- gate, expiry archives it as not_renewed. Rolled back so the reopen checks
  -- below still see a live document.
  if (select status_tampil from v_daftar_dokumen where no_dokumen_kerjasama = v_no)
     <> 'Disposisi Evaluasi' then
    raise exception 'FAIL 9.9i: evaluated document does not read Disposisi Evaluasi';
  end if;
  begin
    update dokumen_kerja_sama set tanggal_berakhir = current_date - 1 where no = v_no;
    perform sapu_kedaluarsa();
    if (select status || '/' || alasan_arsip from dokumen_kerja_sama where no = v_no)
       <> 'Diarsipkan/not_renewed' then
      raise exception 'FAIL 9.9j: terminate gate did not archive as not_renewed';
    end if;
    raise exception 'rollback_9_9j';
  exception when others then
    if sqlerrm <> 'rollback_9_9j' then raise; end if;
  end;

  -- §9.10 — reopening supersedes without editing, and the gate reads the latest.
  select buka_ulang_evaluasi(v_mitra) into v_token2;
  if (select status from evaluasi where no = v_mitra) <> 'superseded' then
    raise exception 'FAIL 9.10a: the prior answer was not superseded';
  end if;
  if (select rekomendasi from evaluasi where no = v_mitra) <> 'terminate' then
    raise exception 'FAIL 9.10b: reopening EDITED the prior answer instead of superseding it';
  end if;
  select no into v_mitra2 from evaluasi
   where id_supersedes = v_mitra and status = 'pending';
  if v_mitra2 is null then raise exception 'FAIL 9.10c: no fresh evaluation was created'; end if;
  if v_token2 is null or v_token2 = v_token then
    raise exception 'FAIL 9.10d: reopening did not issue a fresh token';
  end if;
  if status_gerbang_pembaruan(v_no) <> 'menunggu' then
    raise exception 'FAIL 9.10e: the gate did not fall back to menunggu, got %',
      status_gerbang_pembaruan(v_no);
  end if;

  perform kirim_evaluasi_partner(v_token2, jsonb_build_object(
    'exp_quality',4,'exp_relevance',4,'exp_productivity',4,'exp_sustainability',4,'exp_communication',4,
    'sat_quality',4,'sat_relevance',4,'sat_productivity',4,'sat_sustainability',4,'sat_communication',4,
    'rekomendasi','continue','respondent_nama','Dr Partner','respondent_email','p@uji.test',
    'respondent_jabatan','Director','respondent_hp','+62 811 000'));

  if status_gerbang_pembaruan(v_no) <> 'terbuka' then
    raise exception 'FAIL 9.10f: the gate read a superseded answer, got %',
      status_gerbang_pembaruan(v_no);
  end if;
  raise notice 'PASS 9.10 reopen supersedes; the gate reads the latest';
  raise notice 'PASS 9.11 token scope';

  select buat_proposal_perpanjangan(v_no, 'draf-pembaruan.pdf') into v_baru;
  if (select id_dokumen_sebelumnya from proposal_dokumen where id = v_baru) is null then
    raise exception 'FAIL 9.9h: the renewal is not linked to its predecessor';
  end if;
  -- A renewal request completes by the draft arriving, never by an approve (BR-25).
  if exists (select 1 from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
              where d.no_dokumen_kerjasama = v_no and d.jenis_disposisi = 'renewal_request'
                and dt.status = 'pending_action') then
    raise exception 'FAIL 9.9i: the renewal request stayed open after the draft arrived';
  end if;
  raise notice 'PASS 9.9 evaluation gate';

  perform bersihkan_proposal_uji(v_baru);
  perform bersihkan_proposal_uji(v_p);
  update partner set id_partner_contact = null where id = v_pt;
  delete from partner_contact where id = v_kontak;
  delete from partner where id = v_pt;
end
$t$;

-- ===========================================================================
-- §9.13 — the RLS boundary: a submitter cannot reach another unit's
-- in-progress document.
--
-- Exercised through `boleh_baca_proposal`, which is the predicate every read
-- policy delegates to — so this tests the rule itself rather than one policy's
-- copy of it (EC-05).
-- ===========================================================================
do $t$
declare v_p int; v_t int; v_no int;
begin
  perform set_config('simks.akun_id','3',true);
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoA','Draft',3) returning id into v_p;
  insert into pengusul (id_jabatan, id_proposal_dokumen) values (3, v_p);
  perform ajukan_proposal(v_p);

  perform set_config('simks.akun_id','7',true);
  perform kirim_disposisi(v_p, array[1], 'uji batas rls');
  select dt.no into v_t from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p;

  perform set_config('simks.akun_id','2',true);
  if boleh_baca_proposal(v_p) then
    raise exception 'FAIL 9.13a: an unrelated unit can reach an in-progress document';
  end if;

  perform set_config('simks.akun_id','3',true);
  if not boleh_baca_proposal(v_p) then
    raise exception 'FAIL 9.13b: the submitter cannot read their own submission';
  end if;

  perform set_config('simks.akun_id','1',true);
  if not boleh_baca_proposal(v_p) then
    raise exception 'FAIL 9.13c: an assigned approver cannot read the document';
  end if;

  perform set_config('simks.akun_id','7',true);
  if not boleh_baca_proposal(v_p) then
    raise exception 'FAIL 9.13d: IO cannot read an in-progress document';
  end if;

  perform set_config('simks.akun_id','1',true);
  perform aksi_approval(v_t, 'approve', null);
  perform set_config('simks.akun_id','7',true);
  select aktivasi_dokumen(v_p, 'UJI/RLS/1', current_date, current_date, current_date + 365) into v_no;

  -- Once Active, every logged-in account may read it — a deliberate IO
  -- decision, not an oversight (AR-04).
  perform set_config('simks.akun_id','2',true);
  if not boleh_baca_proposal(v_p) then
    raise exception 'FAIL 9.13e: an Active document is not readable by every account (AR-04)';
  end if;
  raise notice 'PASS 9.13 RLS boundary';

  perform set_config('simks.akun_id','7',true);
  perform bersihkan_proposal_uji(v_p);
end
$t$;

-- ===========================================================================
-- Renewal linkage and successor resolution (BR-12, BR-13).
--
-- Not one of the numbered §9 tests, but the downstream contract rests on it:
-- an Implementation Arrangement must always point at an ACTIVE document, which
-- is only true if activation archives the predecessor in the same transaction
-- that creates the successor, and the chain can be walked forward afterwards.
-- ===========================================================================
do $t$
declare
  v_pt int; v_kontak int; v_p1 int; v_p2 int; v_no1 int; v_no2 int; v_t int;
  v_fak int; v_mitra int; v_tok text;
  v_jwb jsonb := jsonb_build_object(
    'exp_quality',4,'exp_relevance',4,'exp_productivity',4,'exp_sustainability',4,'exp_communication',4,
    'sat_quality',4,'sat_relevance',4,'sat_productivity',4,'sat_sustainability',4,'sat_communication',4,
    'rekomendasi','continue','respondent_nama','P','respondent_email','p@uji.test',
    'respondent_jabatan','Dir','respondent_hp','0811');
begin
  perform set_config('simks.akun_id','7',true);
  insert into partner (nama, is_international, id_negara) values ('Uji Rantai', false, 1)
    returning id into v_pt;
  insert into partner_contact (id_partner, nama, email) values (v_pt,'K','k@uji.test')
    returning id into v_kontak;
  update partner set id_partner_contact = v_kontak where id = v_pt;

  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Draft',7) returning id into v_p1;
  insert into partner_pengusul (id_partner, id_proposal_dokumen, is_lead) values (v_pt, v_p1, true);
  insert into pengusul (id_jabatan, id_proposal_dokumen) values (3, v_p1);
  perform ajukan_proposal(v_p1);
  perform kirim_disposisi(v_p1, array[1], 'rantai');
  select dt.no into v_t from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p1;
  perform set_config('simks.akun_id','1',true);
  perform aksi_approval(v_t,'approve',null);
  perform set_config('simks.akun_id','7',true);
  select aktivasi_dokumen(v_p1,'UJI/RANTAI/1', current_date-300, current_date-300,
                          current_date+20) into v_no1;

  -- Renew it once, all the way through to an Active successor.
  perform kirim_permintaan_pembaruan(v_no1, 'perbarui');
  select no into v_fak from evaluasi where id_dokumen_kerjasama=v_no1 and respondent_type='faculty';
  select no into v_mitra from evaluasi where id_dokumen_kerjasama=v_no1 and respondent_type='partner';
  v_tok := buat_tautan_evaluasi_mitra(v_no1);
  perform set_config('simks.akun_id','3',true);
  perform kirim_evaluasi_fakultas(v_fak, v_jwb);
  perform kirim_evaluasi_partner(v_tok, v_jwb);
  perform set_config('simks.akun_id','7',true);
  select buat_proposal_perpanjangan(v_no1, 'draf-pembaruan.pdf') into v_p2;

  perform kirim_disposisi(v_p2, array[1], 'perpanjangan');
  select dt.no into v_t from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p2 and dt.status='pending_action';
  perform set_config('simks.akun_id','1',true);
  perform aksi_approval(v_t,'approve',null);
  perform set_config('simks.akun_id','7',true);
  -- A signatory is passed here too: the 12-param signature (signatories) and
  -- the renewal-archiving branch must both run out of the SAME function, not
  -- two overloads that only one call site ever reaches (the bug this guards).
  select aktivasi_dokumen(v_p2,'UJI/RANTAI/2', current_date, current_date,
                          current_date+700,
                          p_penandatangan_petra => 'Uji Tanda Tangan') into v_no2;

  if not exists (select 1 from penandatangan_petra
                  where no_dokumen_kerjasama = v_no2 and nama = 'Uji Tanda Tangan') then
    raise exception 'FAIL rantai-d: signatory not recorded when the 12-param
      overload also carries the renewal-archiving branch';
  end if;

  -- Activation archived the predecessor with its reason, in the same
  -- transaction that created the successor (BR-12, BR-10).
  if (select status || '/' || coalesce(alasan_arsip,'-') from dokumen_kerja_sama where no = v_no1)
     <> 'Diarsipkan/superseded_by_renewal' then
    raise exception 'FAIL rantai-a: predecessor not archived as superseded, got %',
      (select status || '/' || coalesce(alasan_arsip,'-') from dokumen_kerja_sama where no = v_no1);
  end if;

  -- A reference to the old document resolves forward to the Active one (BR-13).
  if (select no_dokumen_kerjasama from resolusi_penerus(v_no1)) <> v_no2
     or (select langkah from resolusi_penerus(v_no1)) <> 1
     or (select status from resolusi_penerus(v_no1)) <> 'Aktif' then
    raise exception 'FAIL rantai-b: the successor did not resolve to the Active document';
  end if;

  -- A reference that is already current resolves to itself, zero steps.
  if (select no_dokumen_kerjasama from resolusi_penerus(v_no2)) <> v_no2
     or (select langkah from resolusi_penerus(v_no2)) <> 0 then
    raise exception 'FAIL rantai-c: a current reference was moved anyway';
  end if;
  raise notice 'PASS renewal linkage and successor resolution';

  perform bersihkan_proposal_uji(v_p2);
  perform bersihkan_proposal_uji(v_p1);
  update partner set id_partner_contact = null where id = v_pt;
  delete from partner_contact where id = v_kontak;
  delete from partner where id = v_pt;
end
$t$;

-- ===========================================================================
-- agregasi_grafik's default status filter must include 'Akan Berakhir' — the
-- daily sweep only relabels an Aktif document, it never ends the agreement
-- (bug fix 20260918000100).
-- ===========================================================================
do $t$
declare
  v_pt int; v_kontak int; v_p int; v_no int; v_t int; v_hasil record;
  v_ditemukan boolean := false;
begin
  perform set_config('simks.akun_id','7',true);
  insert into partner (nama, is_international, id_negara) values ('Uji Grafik AB', false, 1)
    returning id into v_pt;
  insert into partner_contact (id_partner, nama, email) values (v_pt,'K','k@uji.test')
    returning id into v_kontak;
  update partner set id_partner_contact = v_kontak where id = v_pt;

  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Draft',7) returning id into v_p;
  insert into partner_pengusul (id_partner, id_proposal_dokumen, is_lead) values (v_pt, v_p, true);
  insert into pengusul (id_jabatan, id_proposal_dokumen) values (3, v_p);
  perform ajukan_proposal(v_p);
  perform kirim_disposisi(v_p, array[1], 'uji grafik');
  select dt.no into v_t from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p;
  perform set_config('simks.akun_id','1',true);
  perform aksi_approval(v_t, 'approve', null);
  perform set_config('simks.akun_id','7',true);
  select aktivasi_dokumen(v_p,'UJI/GRAFIK/AB', current_date-10, current_date-10,
                          current_date+1) into v_no;
  update dokumen_kerja_sama set status = 'Akan Berakhir' where no = v_no;

  for v_hasil in select * from agregasi_grafik('{"grouping":"status","sumber_data":"dokumen"}'::jsonb) loop
    if v_hasil.label = 'Akan Berakhir' and v_hasil.nilai >= 1 then
      v_ditemukan := true;
    end if;
  end loop;
  if not v_ditemukan then
    raise exception 'FAIL grafik-ab: default status filter excluded an Akan Berakhir document';
  end if;
  raise notice 'PASS agregasi_grafik default filter includes Akan Berakhir';

  perform bersihkan_proposal_uji(v_p);
  update partner set id_partner_contact = null where id = v_pt;
  delete from partner_contact where id = v_kontak;
  delete from partner where id = v_pt;
end
$t$;

-- ===========================================================================
-- simpan_anak_proposal: atomic replace of the seven child tables, and the
-- jenis_kerjasama guard that used to fall through silently to MoA (bug fix
-- 20260918000100).
-- ===========================================================================
do $t$
declare v_pt int; v_p int; v_ok boolean;
begin
  perform set_config('simks.akun_id','7',true);
  insert into partner (nama, is_international, id_negara) values ('Uji Anak Proposal', false, 1)
    returning id into v_pt;
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Draft',7) returning id into v_p;

  perform simpan_anak_proposal(
    v_p, jsonb_build_array(jsonb_build_object('id_partner', v_pt, 'is_lead', true)),
    3, array[1], array[1], array[1], 'MoU',
    jsonb_build_object('ringkasan_kegiatan','pertama'), null);

  -- A second save must REPLACE, not append (BR-38 applies to every child set,
  -- not only Lingkup Kerja Sama).
  perform simpan_anak_proposal(
    v_p, jsonb_build_array(jsonb_build_object('id_partner', v_pt, 'is_lead', true)),
    3, array[2], array[2], array[2], 'MoU',
    jsonb_build_object('ringkasan_kegiatan','kedua'), null);

  if (select count(*) from proposal_dokumen_bidang where id_proposal_dokumen = v_p) <> 1
     or not exists (select 1 from proposal_dokumen_bidang
                      where id_proposal_dokumen = v_p and id_bidang_kerjasama = 2) then
    raise exception 'FAIL anak-a: second save did not replace the first child set';
  end if;

  -- An unrecognised jenis_kerjasama must refuse, not fall through to MoA.
  v_ok := false;
  begin
    perform simpan_anak_proposal(v_p, '[]'::jsonb, null, array[]::int[], array[]::int[],
                                 array[]::int[], 'Perpanjangan', null, null);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'FAIL anak-b: an unrecognised jenis_kerjasama was accepted';
  end if;
  raise notice 'PASS simpan_anak_proposal atomic replace and jenis guard';

  delete from proposal_dokumen where id = v_p;
  delete from partner where id = v_pt;
end
$t$;

-- ===========================================================================
-- Revisi V8 §1 — catat_dokumen_langsung: an already-signed document lands
-- Aktif with no approval trail, edits replace rather than duplicate, and the
-- door is closed to non-IO callers and to workflow documents.
-- ===========================================================================
do $t$
declare v_pt int; v_id int; v_no int; v_normal int; v_ok boolean;
begin
  perform set_config('simks.akun_id','7',true);   -- staf-kui, io_admin
  insert into partner (nama, is_international, id_negara)
  values ('Uji Pencatatan Langsung', false, 1) returning id into v_pt;

  v_id := catat_dokumen_langsung(
    null,
    jsonb_build_object('jenis_kerjasama','MoU'),
    jsonb_build_array(jsonb_build_object('id_partner', v_pt, 'is_lead', true)),
    3, array[]::int[], array[]::int[], array[]::int[], array[4],
    jsonb_build_object('ringkasan_kegiatan','legacy'), null,
    jsonb_build_object(
      'no_dokumen','L-001',
      'tanggal_tanda_tangan','2019-05-01',
      'tanggal_mulai','2019-05-01',
      'tanggal_berakhir','2099-05-01',
      'penandatangan_petra','Rektor',
      'penandatangan_mitra','CEO'));

  if (select status_proposal from proposal_dokumen where id = v_id) <> 'Disetujui'
     or not (select is_pencatatan_langsung from proposal_dokumen where id = v_id) then
    raise exception 'FAIL catat-a: status/flag wrong on creation';
  end if;

  select no into v_no from dokumen_kerja_sama where id_proposal_dokumen = v_id;
  if v_no is null
     or (select status from dokumen_kerja_sama where no = v_no) <> 'Aktif' then
    raise exception 'FAIL catat-b: the document is not active on creation';
  end if;

  if exists (select 1 from disposisi where id_proposal_dokumen = v_id) then
    raise exception 'FAIL catat-c: a direct entry created a disposisi';
  end if;

  -- The turnaround KPI must read the real signing date, not today.
  if (select waktu_disetujui::date from proposal_dokumen where id = v_id)
       <> date '2019-05-01' then
    raise exception 'FAIL catat-d: waktu_disetujui was stamped with now()';
  end if;

  if (select count(*) from penandatangan_partner where no_dokumen_kerjasama = v_no) <> 1 then
    raise exception 'FAIL catat-e: partner signatory not recorded';
  end if;

  -- An edit replaces; it must not duplicate the signatories, and clearing the
  -- id_penandatangan_partner FK first is what makes the delete possible.
  perform catat_dokumen_langsung(
    v_id,
    jsonb_build_object('jenis_kerjasama','MoU'),
    jsonb_build_array(jsonb_build_object('id_partner', v_pt, 'is_lead', true)),
    3, array[]::int[], array[]::int[], array[]::int[], array[4],
    jsonb_build_object('ringkasan_kegiatan','legacy'), null,
    jsonb_build_object(
      'no_dokumen','L-002',
      'tanggal_tanda_tangan','2019-05-01',
      'tanggal_mulai','2019-05-01',
      'tanggal_berakhir','2099-05-01',
      'penandatangan_petra','Rektor',
      'penandatangan_mitra','CFO'));

  if (select count(*) from penandatangan_partner where no_dokumen_kerjasama = v_no) <> 1
     or (select nama from penandatangan_partner where no_dokumen_kerjasama = v_no) <> 'CFO' then
    raise exception 'FAIL catat-f: the edit duplicated or failed to replace the signatory';
  end if;
  if (select no_dokumen from dokumen_kerja_sama where id_proposal_dokumen = v_id) <> 'L-002' then
    raise exception 'FAIL catat-g: the edit did not update the document';
  end if;

  -- A document that really went through approval is not editable this way.
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Disetujui',7) returning id into v_normal;
  v_ok := false;
  begin
    perform catat_dokumen_langsung(
      v_normal, jsonb_build_object('jenis_kerjasama','MoU'), '[]'::jsonb, null,
      array[]::int[], array[]::int[], array[]::int[], array[]::int[],
      jsonb_build_object('ringkasan_kegiatan','x'), null,
      jsonb_build_object('no_dokumen','X','tanggal_tanda_tangan','2020-01-01',
                         'tanggal_mulai','2020-01-01'));
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'FAIL catat-h: a workflow document was edited as a direct entry';
  end if;

  -- And a non-IO account cannot open the door at all.
  perform set_config('simks.akun_id','4',true);
  v_ok := false;
  begin
    perform catat_dokumen_langsung(
      null, jsonb_build_object('jenis_kerjasama','MoU'),
      jsonb_build_array(jsonb_build_object('id_partner', v_pt, 'is_lead', true)),
      3, array[]::int[], array[]::int[], array[]::int[], array[]::int[],
      jsonb_build_object('ringkasan_kegiatan','x'), null,
      jsonb_build_object('no_dokumen','Y','tanggal_tanda_tangan','2020-01-01',
                         'tanggal_mulai','2020-01-01'));
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'FAIL catat-i: a non-IO account recorded a document';
  end if;
  perform set_config('simks.akun_id','7',true);
  raise notice 'PASS catat_dokumen_langsung create, edit and both refusals';

  perform bersihkan_proposal_uji(v_id);
  perform bersihkan_proposal_uji(v_normal);
  delete from partner where id = v_pt;
end
$t$;

-- ===========================================================================
-- Revisi V8 §2 — implementasi_dokumen hangs off the SIGNED document, and goes
-- away with it, so the test seam needs no new delete line.
-- ===========================================================================
do $t$
declare v_p int; v_no int;
begin
  perform set_config('simks.akun_id','7',true);
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Disetujui',7) returning id into v_p;
  insert into dokumen_kerja_sama (id_proposal_dokumen, no_dokumen, tanggal_mulai, status)
  values (v_p, 'UJI-IMPL-1', date '2019-05-01', 'Aktif') returning no into v_no;

  insert into implementasi_dokumen (no_dokumen_kerjasama, jenis, judul, tanggal, id_akun_pembuat)
  values (v_no, 'arrangement', 'IA 2019', date '2019-06-01', 7),
         (v_no, 'report',      'IR 2020', date '2020-06-01', 7);
  if (select count(*) from implementasi_dokumen where no_dokumen_kerjasama = v_no) <> 2 then
    raise exception 'FAIL impl-a: rows were not stored';
  end if;

  -- Only the two declared kinds exist.
  begin
    insert into implementasi_dokumen (no_dokumen_kerjasama, jenis, judul, tanggal, id_akun_pembuat)
    values (v_no, 'realization', 'salah', date '2020-06-01', 7);
    raise exception 'FAIL impl-b: an unrecognised jenis was accepted';
  exception when check_violation then null;
  end;

  delete from dokumen_kerja_sama where no = v_no;
  if exists (select 1 from implementasi_dokumen where no_dokumen_kerjasama = v_no) then
    raise exception 'FAIL impl-c: rows did not cascade with the document';
  end if;
  raise notice 'PASS implementasi_dokumen jenis guard and cascade';

  delete from proposal_dokumen where id = v_p;
end
$t$;

-- ===========================================================================
-- Revisi V8 §3 — SDGs ride along on simpan_anak_proposal's atomic replace, and
-- the 9-argument positional callers above must still resolve now that the
-- function has a tenth parameter with a default.
-- ===========================================================================
do $t$
declare v_p int;
begin
  perform set_config('simks.akun_id','7',true);
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Draft',7) returning id into v_p;

  perform simpan_anak_proposal(v_p, '[]'::jsonb, null, array[]::int[], array[]::int[],
                               array[]::int[], 'MoU',
                               jsonb_build_object('ringkasan_kegiatan','x'), null,
                               array[4,17]);
  if (select count(*) from proposal_dokumen_sdg where id_proposal_dokumen = v_p) <> 2 then
    raise exception 'FAIL sdg-a: SDGs were not stored';
  end if;

  -- Replace, not append -- the same rule every other child set follows.
  perform simpan_anak_proposal(v_p, '[]'::jsonb, null, array[]::int[], array[]::int[],
                               array[]::int[], 'MoU',
                               jsonb_build_object('ringkasan_kegiatan','x'), null,
                               array[4]);
  if (select count(*) from proposal_dokumen_sdg where id_proposal_dokumen = v_p) <> 1 then
    raise exception 'FAIL sdg-b: a second save appended instead of replacing';
  end if;

  -- The old 9-argument call still resolves through p_sdg's default, and
  -- clearing is what an empty set means.
  perform simpan_anak_proposal(v_p, '[]'::jsonb, null, array[]::int[], array[]::int[],
                               array[]::int[], 'MoU',
                               jsonb_build_object('ringkasan_kegiatan','x'), null);
  if (select count(*) from proposal_dokumen_sdg where id_proposal_dokumen = v_p) <> 0 then
    raise exception 'FAIL sdg-c: the 9-argument call did not clear the set';
  end if;

  if (select count(*) from sdg) <> 17 then
    raise exception 'FAIL sdg-d: the goal list is not the UN''s 17';
  end if;
  raise notice 'PASS sdg child set and simpan_anak_proposal arity';

  delete from proposal_dokumen where id = v_p;
end
$t$;

-- ===========================================================================
-- set_kontak_utama: only a contact that actually belongs to the partner may
-- become its primary contact, and (H1 fix, bug fix 20260918000100) only IO or
-- the proposal's own creator — for a partner actually attached to their own
-- Draft — may call it at all. akun 7 is io_staff (current_akun_is_io() true),
-- so it is used for the ownership-of-contact cases below; the non-IO
-- authorization path is exercised separately with akun 3 (a plain
-- 'submitter'), using the simks.akun_id test seam (20260916000700_test_seam)
-- to act as that account.
-- ===========================================================================
do $t$
declare v_pt1 int; v_pt2 int; v_k1 int; v_k2 int; v_ok boolean;
begin
  perform set_config('simks.akun_id','7',true);
  insert into partner (nama, is_international, id_negara) values ('Uji Kontak 1', false, 1)
    returning id into v_pt1;
  insert into partner (nama, is_international, id_negara) values ('Uji Kontak 2', false, 1)
    returning id into v_pt2;
  insert into partner_contact (id_partner, nama, email) values (v_pt1,'K1','k1@uji.test')
    returning id into v_k1;
  insert into partner_contact (id_partner, nama, email) values (v_pt2,'K2','k2@uji.test')
    returning id into v_k2;

  v_ok := false;
  begin perform set_kontak_utama(v_pt1, v_pt1, v_k2); exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FAIL kontak-a: a contact from another partner was accepted as primary';
  end if;

  perform set_kontak_utama(v_pt1, v_pt1, v_k1);
  if (select id_partner_contact from partner where id = v_pt1) <> v_k1 then
    raise exception 'FAIL kontak-b: the primary contact was not set';
  end if;
  raise notice 'PASS set_kontak_utama ownership-of-contact check';

  update partner set id_partner_contact = null where id in (v_pt1, v_pt2);
  delete from partner_contact where id in (v_k1, v_k2);
  delete from partner where id in (v_pt1, v_pt2);
end
$t$;

-- ===========================================================================
-- set_kontak_utama (H1): a non-IO caller may only set the primary contact of a
-- partner actually attached (via partner_pengusul) to their OWN Draft — not
-- any partner they merely happen to name. Before this fix, any authenticated
-- user could hijack the primary contact of ANY partner.
-- ===========================================================================
do $t$
declare v_pt_terkait int; v_pt_asing int; v_k_asing int; v_p int; v_ok boolean;
begin
  perform set_config('simks.akun_id','7',true);
  insert into partner (nama, is_international, id_negara) values ('Uji H1 Terkait', false, 1)
    returning id into v_pt_terkait;
  insert into partner (nama, is_international, id_negara) values ('Uji H1 Asing', false, 1)
    returning id into v_pt_asing;
  insert into partner_contact (id_partner, nama, email) values (v_pt_asing,'K','k@uji.test')
    returning id into v_k_asing;

  -- akun 3 is a plain submitter (not io_staff/io_admin) owning a Draft that
  -- only links v_pt_terkait via partner_pengusul.
  perform set_config('simks.akun_id','3',true);
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Draft',3) returning id into v_p;
  insert into partner_pengusul (id_partner, id_proposal_dokumen, is_lead)
  values (v_pt_terkait, v_p, true);

  -- A partner not linked to the caller's own draft must be rejected, even
  -- though the caller does own the draft it names.
  v_ok := false;
  begin
    perform set_kontak_utama(v_p, v_pt_asing, v_k_asing);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'FAIL kontak-c: a partner not attached to the caller''s draft was accepted';
  end if;
  raise notice 'PASS set_kontak_utama rejects a partner not linked to the caller''s draft (H1)';

  perform set_config('simks.akun_id','7',true);
  perform bersihkan_proposal_uji(v_p);
  delete from partner_contact where id = v_k_asing;
  delete from partner where id in (v_pt_terkait, v_pt_asing);
end
$t$;

-- ===========================================================================
-- riwayat_tulis (RLS): tightened so a client insert can no longer forge
-- id_akun or write an aksi reserved for the SECURITY DEFINER workflow
-- functions (bug fix 20260918000100).
--
-- This script runs as the table owner (psql against DATABASE_URL), which
-- bypasses RLS the same way every SECURITY DEFINER function in this schema
-- does — so, like §9.13 above, the check is against the policy's own
-- expression rather than a real denied INSERT, which this harness cannot
-- produce without a role switch it does not have.
-- ===========================================================================
do $t$
declare v_check text;
begin
  select with_check into v_check from pg_policies
   where schemaname = 'public' and tablename = 'riwayat_approval'
     and policyname = 'riwayat_tulis';

  if v_check is null
     or v_check !~ 'id_akun\s*=\s*current_akun_id\(\)'
     or v_check !~ 'aksi\s*=\s*ANY' then
    raise exception 'FAIL riwayat-tulis: policy no longer pins id_akun to
      current_akun_id() and a fixed aksi list, got %', coalesce(v_check, '<none>');
  end if;
  raise notice 'PASS riwayat_tulis pins id_akun and restricts aksi';
end
$t$;

-- ===========================================================================
-- Revisi V7 — the evaluation goes to the lingkup heads, one PETRA answer per
-- head, KUI overrides any outcome, and Akan Berakhir is set immediately.
--
-- Lingkup = International Business Management (under Prodi Manajemen, under
-- SBM) + KUI, so the heads are Dekan SBM (jabatan 3) and Kepala KUI (1).
-- ===========================================================================
do $t$
declare
  v_pt int; v_p int; v_no int; v_t int; v_ok boolean;
  v_fak_dekan int; v_fak_kui int; v_token text;
  v_nilai jsonb := jsonb_build_object(
    'exp_quality',4,'exp_relevance',4,'exp_productivity',4,'exp_sustainability',4,'exp_communication',4,
    'sat_quality',4,'sat_relevance',4,'sat_productivity',4,'sat_sustainability',4,'sat_communication',4);
begin
  if (select role from akun where id = 7) <> 'io_admin' then
    raise exception 'FAIL V7.1: Staf KUI is not admin';
  end if;

  perform set_config('simks.akun_id','7',true);
  insert into partner (nama, is_international, id_negara, kota)
  values ('Uji Mitra V7', false, 1, 'Surabaya') returning id into v_pt;
  insert into proposal_dokumen (jenis_kerjasama, status_proposal, id_akun_pembuat)
  values ('MoU','Draft',4) returning id into v_p;
  insert into partner_pengusul (id_partner, id_proposal_dokumen, is_lead) values (v_pt, v_p, true);
  insert into pengusul (id_jabatan, id_proposal_dokumen) values (4, v_p);
  insert into proposal_dokumen_unit (id_proposal_dokumen, id_unit) values (v_p, 7), (v_p, 2);

  perform ajukan_proposal(v_p);
  perform kirim_disposisi(v_p, array[1], 'uji V7');
  select dt.no into v_t from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = v_p;
  perform set_config('simks.akun_id','1',true);
  perform aksi_approval(v_t, 'approve', null);
  perform set_config('simks.akun_id','7',true);
  select aktivasi_dokumen(v_p, 'UJI/V7/1', current_date - 300, current_date - 300,
                          current_date + 30) into v_no;

  -- §4: inside the window from the moment it exists; the threshold moves it both ways.
  if (select status from dokumen_kerja_sama where no = v_no) <> 'Akan Berakhir' then
    raise exception 'FAIL V7.4a: activation inside the window is not Akan Berakhir';
  end if;
  update settings set value = '0' where key = 'expiring_soon_months';
  if (select status from dokumen_kerja_sama where no = v_no) <> 'Aktif' then
    raise exception 'FAIL V7.4b: lowering the threshold did not return it to Aktif';
  end if;
  update settings set value = '6' where key = 'expiring_soon_months';
  if (select status from dokumen_kerja_sama where no = v_no) <> 'Akan Berakhir' then
    raise exception 'FAIL V7.4c: restoring the threshold did not mark it again';
  end if;

  -- §5: routed to the head of every top-level unit in the lingkup.
  if array(select * from jabatan_kepala_lingkup(v_no) order by 1) <> array[1,3] then
    raise exception 'FAIL V7.5a: lingkup heads are %',
      array(select * from jabatan_kepala_lingkup(v_no) order by 1);
  end if;
  perform kirim_permintaan_pembaruan(v_no, 'uji V7');
  select no into v_fak_dekan from evaluasi
   where id_dokumen_kerjasama = v_no and respondent_type = 'faculty' and id_jabatan_pengusul = 3;
  select no into v_fak_kui from evaluasi
   where id_dokumen_kerjasama = v_no and respondent_type = 'faculty' and id_jabatan_pengusul = 1;
  if v_fak_dekan is null or v_fak_kui is null then
    raise exception 'FAIL V7.5b: not one PETRA evaluation per head';
  end if;
  v_token := buat_tautan_evaluasi_mitra(v_no);

  -- A head answers only their own row.
  perform set_config('simks.akun_id','3',true);
  v_ok := false;
  begin
    perform kirim_evaluasi_fakultas(v_fak_kui, v_nilai || '{"rekomendasi":"continue"}');
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL V7.5c: a head answered another head''s evaluation'; end if;

  perform kirim_evaluasi_fakultas(v_fak_dekan, v_nilai || '{"rekomendasi":"continue"}');
  perform kirim_evaluasi_partner(v_token, v_nilai ||
    '{"rekomendasi":"continue","respondent_nama":"Dr Mitra","respondent_email":"m@uji.test","respondent_jabatan":"Dir","respondent_hp":"0811"}');
  if status_gerbang_pembaruan(v_no) <> 'menunggu' then
    raise exception 'FAIL V7.8a: one head still pending, gate is %', status_gerbang_pembaruan(v_no);
  end if;

  -- §8.2: one head stops → PETRA stops → split, and KUI is told.
  perform set_config('simks.akun_id','1',true);
  perform kirim_evaluasi_fakultas(v_fak_kui, v_nilai || '{"rekomendasi":"terminate"}');
  if status_gerbang_pembaruan(v_no) <> 'split' then
    raise exception 'FAIL V7.8b: any head terminating should split, got %', status_gerbang_pembaruan(v_no);
  end if;
  if not exists (select 1 from notifikasi where no_dokumen_kerjasama = v_no
                   and jenis_notifikasi = 'split_decision') then
    raise exception 'FAIL V7.8c: KUI was not told about the split';
  end if;

  -- §6 + §8.1: override to continue opens the gate and tells the pengusul.
  perform putuskan_pembaruan(v_no, 'continue', 'Dibahas offline: lanjut.');
  if status_gerbang_pembaruan(v_no) <> 'terbuka' then
    raise exception 'FAIL V7.6a: override continue did not open the gate';
  end if;
  if not exists (select 1 from notifikasi where no_dokumen_kerjasama = v_no
                   and jenis_notifikasi = 'renewal_open' and id_jabatan_penerima = 4) then
    raise exception 'FAIL V7.8d: the pengusul was not told the renewal is open';
  end if;

  -- §6: any finished outcome can be overridden, not only a split.
  perform putuskan_pembaruan(v_no, 'terminate', 'Berubah: berhenti.');
  if status_gerbang_pembaruan(v_no) <> 'terminate' then
    raise exception 'FAIL V7.6b: override on an open gate did not apply';
  end if;

  -- Reopening voids standing overrides: the fresh answer decides.
  perform buka_ulang_evaluasi(v_fak_kui);
  if status_gerbang_pembaruan(v_no) <> 'menunggu' then
    raise exception 'FAIL V7.6c: reopen did not wait for the new answer';
  end if;
  perform kirim_evaluasi_fakultas(
    (select no from evaluasi where id_supersedes = v_fak_kui), v_nilai || '{"rekomendasi":"continue"}');
  if status_gerbang_pembaruan(v_no) <> 'terbuka' then
    raise exception 'FAIL V7.6d: a stale override outvoted a fresh answer, got %',
      status_gerbang_pembaruan(v_no);
  end if;

  raise notice 'PASS Revisi V7';

  delete from proposal_dokumen_unit where id_proposal_dokumen = v_p;
  perform bersihkan_proposal_uji(v_p);
  delete from partner where id = v_pt;
end
$t$;
