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
  select token into v_token from partner_eval_token where id_evaluasi = v_mitra;

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

  perform kirim_evaluasi_partner(v_token, jsonb_build_object(
    'exp_quality',4,'exp_relevance',4,'exp_productivity',4,'exp_sustainability',4,'exp_communication',4,
    'sat_quality',2,'sat_relevance',2,'sat_productivity',2,'sat_sustainability',2,'sat_communication',2,
    'rekomendasi','terminate','respondent_nama','Dr Partner','respondent_email','p@uji.test'));

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
    'rekomendasi','continue','respondent_nama','Dr Partner','respondent_email','p@uji.test'));

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
    'rekomendasi','continue','respondent_nama','P','respondent_email','p@uji.test');
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
  select token into v_tok from partner_eval_token where id_evaluasi=v_mitra;
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
  select aktivasi_dokumen(v_p2,'UJI/RANTAI/2', current_date, current_date,
                          current_date+700) into v_no2;

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
