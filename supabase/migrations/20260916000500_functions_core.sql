-- Architecture §4 — the core domain functions.
--
-- Tier gating and business-day-SLA-with-pause live here, in the database, so
-- they are enforced identically whether the caller is a Server Action, a
-- scheduled sweep, or the future Realization API (G-3, EC-01).

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- The akun behind the current Supabase Auth session. Returns NULL for an
-- unauthenticated caller and for the service role acting outside a session.
create function current_akun() returns akun
language sql stable security definer set search_path = public as $fn$
  select a.* from akun a
  where a.auth_user_id = auth.uid() and a.is_active
  limit 1;
$fn$;

create function current_akun_id() returns int
language sql stable as $fn$ select (current_akun()).id $fn$;

create function current_akun_is_io() returns boolean
language sql stable as $fn$
  select coalesce((current_akun()).role in ('io_staff','io_admin'), false);
$fn$;

-- ---------------------------------------------------------------------------
-- §4.3 Lingkup cascade
-- ---------------------------------------------------------------------------

-- Every descendant of a unit, at any depth (Faculty -> Prodi -> Program -> ...).
-- Recursive, never fixed-depth (BR-37). Excludes the unit itself.
create function unit_descendants(p_id_unit int)
returns table (id int, id_parent_unit int, kedalaman int)
language sql stable as $fn$
  with recursive turun as (
    select u.id, u.id_parent_unit, 1 as kedalaman
      from unit u where u.id_parent_unit = p_id_unit
    union all
    select u.id, u.id_parent_unit, t.kedalaman + 1
      from unit u join turun t on u.id_parent_unit = t.id
  )
  select * from turun;
$fn$;

-- A unit is *indeterminate* when some but not all of its descendants are
-- selected. Derived at read time, never stored (BR-38).
create function unit_seleksi_status(p_id_proposal int, p_id_unit int)
returns text
language sql stable as $fn$
  with keturunan as (select id from unit_descendants(p_id_unit)),
       terpilih as (
         select id_unit from proposal_dokumen_unit where id_proposal_dokumen = p_id_proposal
       )
  select case
    when (select count(*) from keturunan) = 0
      then case when exists (select 1 from terpilih where id_unit = p_id_unit)
                then 'checked' else 'unchecked' end
    when (select count(*) from keturunan k where k.id in (select id_unit from terpilih))
         = (select count(*) from keturunan)
      then 'checked'
    when exists (select 1 from keturunan k where k.id in (select id_unit from terpilih))
      then 'indeterminate'
    else 'unchecked'
  end;
$fn$;

-- ---------------------------------------------------------------------------
-- §4.2 Business days
-- ---------------------------------------------------------------------------

create function pengaturan(p_key text, p_default text default null) returns text
language sql stable as $fn$
  select coalesce((select value from settings where key = p_key), p_default);
$fn$;

create function is_hari_kerja(p_tanggal date) returns boolean
language sql stable as $fn$
  select extract(isodow from p_tanggal) < 6
     and not exists (select 1 from holidays where tanggal = p_tanggal);
$fn$;

-- Business days from a timestamp, for an SLA deadline. Advisory: the
-- authoritative elapsed figure is hari_kerja_terpakai, which also nets out
-- frozen time.
create function tambah_hari_kerja(p_mulai timestamptz, p_hari int) returns timestamptz
language plpgsql stable as $fn$
declare
  v_tanggal date := p_mulai::date;
  v_sisa int := p_hari;
begin
  while v_sisa > 0 loop
    v_tanggal := v_tanggal + 1;
    if is_hari_kerja(v_tanggal) then v_sisa := v_sisa - 1; end if;
  end loop;
  return v_tanggal + (p_mulai::time);
end;
$fn$;

-- Business days elapsed on one approval target: weekends and `holidays` are
-- excluded, and so is every day overlapped by a frozen (Pending) span for that
-- proposal (BR-08). A frozen document accrues no SLA.
--
-- p_sampai defaults to now(), so this serves both a resolved target (frozen
-- duration) and a still-open one (live flag).
create function hari_kerja_terpakai(
  p_mulai timestamptz,
  p_sampai timestamptz,
  p_id_proposal int
) returns int
language plpgsql stable as $fn$
declare
  v_jumlah int;
begin
  if p_mulai is null then return 0; end if;

  -- An empty holiday calendar must warn loudly, never silently count calendar
  -- days as business days (BR-19).
  if not exists (select 1 from holidays) then
    raise warning 'holidays is empty: business-day SLA excludes weekends but no public holidays (BR-19)';
  end if;

  select count(*) into v_jumlah
  from generate_series(
         (p_mulai::date) + 1,
         (coalesce(p_sampai, now())::date),
         interval '1 day'
       ) as g(hari)
  where is_hari_kerja(g.hari::date)
    -- ...and the day was not spent frozen.
    and not exists (
      select 1 from pending_periods pp
      where pp.id_proposal_dokumen = p_id_proposal
        and g.hari::date >= pp.mulai::date
        and g.hari::date <= coalesce(pp.selesai, 'infinity'::timestamptz)::date
    );

  return v_jumlah;
end;
$fn$;

create function bendera_sla(p_hari int) returns text
language sql stable as $fn$
  select case
    when p_hari > pengaturan('sla_red_days','4')::int    then 'red'
    when p_hari > pengaturan('sla_yellow_days','2')::int then 'yellow'
    else 'normal' end;
$fn$;

-- ---------------------------------------------------------------------------
-- §4.1 Tier gating — recompute_tiers
-- ---------------------------------------------------------------------------

-- The whole disposition state of one proposal, recomputed from scratch in the
-- current round. Called after EVERY target status change, EVERY add/remove
-- edit, and on reactivation. Idempotent — there is no incremental "if this was
-- the last one, unlock the next" anywhere else (BR-03).
--
-- The rule that matters: a target unlocks when NO LOWER-TIER TARGET IN THE
-- CURRENT ROUND IS UN-APPROVED. Not "the previous tier finished" — that
-- deadlocks on an empty tier. Empty tiers skip because nothing below blocks
-- (BR-02).
--
-- A renewal_request never enters this function: it has no tier and gates
-- nothing (BR-24).
create function recompute_tiers(p_id_proposal int) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_round int;
  v_beku boolean;
  v_ada_target boolean;
  v_tier_aktif int;
  t record;
  v_blocked boolean;
begin
  select max(d.round_ke) into v_round
    from disposisi d
   where d.id_proposal_dokumen = p_id_proposal
     and d.jenis_disposisi = 'approval';

  if v_round is null then
    -- No approval disposition sent yet; nothing to gate.
    update proposal_dokumen
       set status_proposal = 'Diproses'
     where id = p_id_proposal and status_proposal = 'Diajukan';
    return;
  end if;

  -- A rejection is terminal: no further gating, ever (BR-05).
  if exists (
    select 1 from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
    where d.id_proposal_dokumen = p_id_proposal
      and d.jenis_disposisi = 'approval' and d.round_ke = v_round
      and dt.status = 'rejected'
  ) then
    update proposal_dokumen set status_proposal = 'Ditolak' where id = p_id_proposal;
    return;
  end if;

  -- While frozen, the clock is stopped and nothing unlocks (BR-06).
  select exists (
    select 1 from pending_periods
    where id_proposal_dokumen = p_id_proposal and selesai is null
  ) into v_beku;

  if v_beku then
    update proposal_dokumen set status_proposal = 'Pending' where id = p_id_proposal;
    return;
  end if;

  for t in
    select dt.no, dt.tier, dt.status
      from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
     where d.id_proposal_dokumen = p_id_proposal
       and d.jenis_disposisi = 'approval' and d.round_ke = v_round
       and dt.status in ('waiting','pending_action')
     order by dt.tier, dt.no
  loop
    select exists (
      select 1
        from disposisi_target bawah join disposisi db on db.no = bawah.no_disposisi
       where db.id_proposal_dokumen = p_id_proposal
         and db.jenis_disposisi = 'approval' and db.round_ke = v_round
         and bawah.tier < t.tier
         and bawah.status in ('waiting','pending_action')
    ) into v_blocked;

    if not v_blocked and t.status = 'waiting' then
      update disposisi_target
         set status = 'pending_action',
             waktu_unlock = now(),
             batas_waktu_sla = tambah_hari_kerja(now(), pengaturan('sla_red_days','4')::int),
             status_sla = 'normal'
       where no = t.no;

    elsif v_blocked and t.status = 'pending_action' then
      -- A lower-tier target was added after this one opened. Close it again;
      -- it has not been acted on, so nothing is lost (BR-34).
      update disposisi_target
         set status = 'waiting', waktu_unlock = null,
             batas_waktu_sla = null, status_sla = null
       where no = t.no;
    end if;
  end loop;

  select exists (
    select 1 from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
     where d.id_proposal_dokumen = p_id_proposal
       and d.jenis_disposisi = 'approval' and d.round_ke = v_round
       and dt.status <> 'removed'
  ) into v_ada_target;

  select min(dt.tier) into v_tier_aktif
    from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where d.id_proposal_dokumen = p_id_proposal
     and d.jenis_disposisi = 'approval' and d.round_ke = v_round
     and dt.status = 'pending_action';

  if not v_ada_target then
    update proposal_dokumen set status_proposal = 'Diproses' where id = p_id_proposal;

  elsif v_tier_aktif is null then
    -- Every target in the round is approved: the document is through.
    update proposal_dokumen
       set status_proposal = 'Disetujui',
           waktu_disetujui = coalesce(waktu_disetujui, now())
     where id = p_id_proposal;

  else
    update proposal_dokumen
       set status_proposal = 'Disposisi - Tier ' || v_tier_aktif
     where id = p_id_proposal;
  end if;
end;
$fn$;

comment on function recompute_tiers is
  'Idempotent. The single writer of status_proposal during disposition. Unlock
   rule is "no blockers below", never "previous tier done" (BR-02, BR-03).';
