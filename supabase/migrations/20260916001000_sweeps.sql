-- Phase 2 — the scheduled sweeps (Architecture §7).
--
-- Two jobs run daily: the approval/renewal SLA sweep and the expiry sweep,
-- each raising its own notifications. Both must be idempotent: running twice
-- in a day must not double-send a reminder or double-archive a document
-- (BR-20). That is enforced structurally here rather than by remembering to
-- check, because a sweep that is only idempotent by convention stops being so
-- the first time someone edits it.

-- --------------------------------------------------------------------------
-- Notification identity — how idempotency is actually enforced
-- --------------------------------------------------------------------------
-- A reminder belongs to one target at one severity for one recipient. Tying
-- the notification to the target and making that triple unique means a second
-- run of the sweep cannot insert a duplicate: the index refuses it. A Pending
-- reset creates new target rows, so the next round legitimately gets its own
-- reminders.
alter table notifikasi add column id_disposisi_target int references disposisi_target (no);

create unique index notifikasi_sekali_per_target_idx
  on notifikasi (id_disposisi_target, jenis_notifikasi, id_jabatan_penerima)
  where id_disposisi_target is not null;

-- The positions that receive escalations and expiry notices: IO Staff and the
-- Head of IO (PRD §9.1, §13.2).
create function jabatan_io() returns setof int
language sql stable set search_path = public as $fn$
  select distinct id_jabatan from akun
   where role in ('io_staff','io_admin') and is_active;
$fn$;

-- Writes a notification unless an equivalent one already exists. ON CONFLICT
-- over the unique index above is what makes a repeated sweep a no-op.
create function catat_notifikasi(
  p_jenis       text,
  p_id_jabatan  int,
  p_id_proposal int  default null,
  p_no_dokumen  int  default null,
  p_no_target   int  default null,
  p_isi         text default null
) returns void
language sql security definer set search_path = public as $fn$
  insert into notifikasi (jenis_notifikasi, id_jabatan_penerima, id_proposal_dokumen,
                          no_dokumen_kerjasama, id_disposisi_target, isi, status)
  values (p_jenis, p_id_jabatan, p_id_proposal, p_no_dokumen, p_no_target, p_isi, 'pending')
  on conflict do nothing;
$fn$;

-- --------------------------------------------------------------------------
-- §4.2 — the SLA sweep
-- --------------------------------------------------------------------------
-- Recomputes elapsed time on every OPEN target and flags it. Resolved targets
-- are never touched: their duration was frozen when they were resolved, so a
-- later edit to the holiday calendar cannot rewrite history (DR-03).
--
-- Elapsed time is business days net of weekends, holidays AND frozen spans, so
-- a document sitting in Pending accrues nothing (BR-08). That is the whole
-- reason the sweep calls hari_kerja_terpakai instead of subtracting dates.
create function sapu_sla() returns table (diperiksa int, kuning int, merah int)
language plpgsql security definer set search_path = public as $fn$
declare
  t record;
  v_hari int;
  v_bendera text;
  v_diperiksa int := 0;
  v_kuning int := 0;
  v_merah int := 0;
  v_io int;
begin
  for t in
    select dt.no, dt.waktu_unlock, dt.status_sla, dt.id_jabatan,
           d.id_proposal_dokumen, d.no_dokumen_kerjasama, d.jenis_disposisi,
           j.nama as nama_jabatan
      from disposisi_target dt
      join disposisi d on d.no = dt.no_disposisi
      join jabatan j on j.id = dt.id_jabatan
     where dt.status = 'pending_action'
  loop
    v_diperiksa := v_diperiksa + 1;

    if t.jenis_disposisi = 'approval' then
      -- Business days, pauses netted out.
      v_hari := hari_kerja_terpakai(t.waktu_unlock, now(), t.id_proposal_dokumen);
      v_bendera := bendera_sla(v_hari);
    else
      -- A renewal request runs on the 30/60/90 CALENDAR-day scale, never the
      -- 2/4 business-day approval scale (BR-32). Same table, different logic.
      v_hari := greatest(0, (now()::date - t.waktu_unlock::date));
      v_bendera := case
        when v_hari > pengaturan('renewal_red_days','90')::int    then 'red'
        when v_hari > pengaturan('renewal_yellow_days','60')::int then 'yellow'
        else 'normal' end;
    end if;

    update disposisi_target
       set durasi_hari_kerja = v_hari, status_sla = v_bendera
     where no = t.no;

    if v_bendera = 'yellow' then v_kuning := v_kuning + 1; end if;
    if v_bendera = 'red' then v_merah := v_merah + 1; end if;

    -- Yellow: remind the approver. Red: remind again AND escalate to IO, who
    -- are the ones who chase (PRD §13.1). The approver never sees the
    -- escalation; it is a separate message (Design §7).
    if v_bendera in ('yellow','red') then
      perform catat_notifikasi(
        'sla_' || v_bendera, t.id_jabatan, t.id_proposal_dokumen,
        t.no_dokumen_kerjasama, t.no,
        format('Dokumen menunggu tindakan Anda selama %s hari.', v_hari));
    end if;

    if v_bendera = 'red' then
      for v_io in select * from jabatan_io() loop
        perform catat_notifikasi(
          'sla_eskalasi', v_io, t.id_proposal_dokumen, t.no_dokumen_kerjasama, t.no,
          format('%s belum menindak dokumen ini selama %s hari.',
                 t.nama_jabatan, v_hari));
      end loop;
    end if;
  end loop;

  -- The worst open flag, summarised onto the proposal for the list views.
  update proposal_dokumen p
     set status_sla = sub.bendera
    from (
      select d.id_proposal_dokumen as id,
             case when bool_or(dt.status_sla = 'red') then 'red'
                  when bool_or(dt.status_sla = 'yellow') then 'yellow'
                  else 'normal' end as bendera
        from disposisi_target dt
        join disposisi d on d.no = dt.no_disposisi
       where dt.status = 'pending_action' and d.id_proposal_dokumen is not null
       group by d.id_proposal_dokumen
    ) sub
   where p.id = sub.id and p.status_sla is distinct from sub.bendera;

  return query select v_diperiksa, v_kuning, v_merah;
end;
$fn$;

-- --------------------------------------------------------------------------
-- The expiry sweep
-- --------------------------------------------------------------------------
-- Auto Renewed documents carry no end date, so they fall out of every query
-- below without a special case (BR-11) -- the NULL does the work.
--
-- Cadence: monthly from six months out, escalating to weekly once two months
-- or less remain, until a renewal request is dispositioned (PRD §9.7). The
-- "already told them recently" guard is what makes a second run today a no-op.
create function sapu_kedaluarsa()
returns table (ditandai int, diarsipkan int, diingatkan int)
language plpgsql security definer set search_path = public as $fn$
declare
  d record;
  v_ditandai int := 0;
  v_diarsipkan int := 0;
  v_diingatkan int := 0;
  v_bulan int := pengaturan('expiring_soon_months','6')::int;
  v_sisa_hari int;
  v_jeda int;
  v_io int;
begin
  -- Approaching the end date: surfaced as its own status so the list tab is a
  -- plain filter rather than a date computation in every query.
  update dokumen_kerja_sama
     set status = 'Akan Berakhir'
   where status = 'Aktif'
     and tanggal_berakhir is not null
     and tanggal_berakhir <= (current_date + (v_bulan || ' months')::interval)
     and tanggal_berakhir >= current_date;
  get diagnostics v_ditandai = row_count;

  -- Past the end date with no completed renewal. Archival always records its
  -- reason (BR-10), and the document is never deleted (BR-09).
  update dokumen_kerja_sama
     set status = 'Diarsipkan', alasan_arsip = 'expired_without_renewal'
   where status in ('Aktif','Akan Berakhir')
     and tanggal_berakhir is not null
     and tanggal_berakhir < current_date;
  get diagnostics v_diarsipkan = row_count;

  for d in
    select dk.no, dk.tanggal_berakhir, p.id as id_proposal
      from dokumen_kerja_sama dk
      join proposal_dokumen p on p.id = dk.id_proposal_dokumen
     where dk.status = 'Akan Berakhir' and dk.tanggal_berakhir is not null
  loop
    v_sisa_hari := d.tanggal_berakhir - current_date;
    -- Weekly once two months or less remain, monthly before that.
    v_jeda := case when v_sisa_hari <= 60 then 7 else 30 end;

    -- Stop once a renewal request exists: the cadence has done its job.
    if exists (select 1 from disposisi
                where no_dokumen_kerjasama = d.no
                  and jenis_disposisi = 'renewal_request') then
      continue;
    end if;

    -- The idempotency guard. Two runs on the same day send one reminder.
    if exists (
      select 1 from notifikasi
       where no_dokumen_kerjasama = d.no
         and jenis_notifikasi = 'expiring_soon'
         and waktu_kirim > now() - (v_jeda || ' days')::interval
    ) then
      continue;
    end if;

    for v_io in select * from jabatan_io() loop
      insert into notifikasi (jenis_notifikasi, id_jabatan_penerima,
                              no_dokumen_kerjasama, id_proposal_dokumen, isi, status)
      values ('expiring_soon', v_io, d.no, d.id_proposal,
              format('Dokumen berakhir pada %s (%s hari lagi).',
                     d.tanggal_berakhir, v_sisa_hari),
              'pending');
      v_diingatkan := v_diingatkan + 1;
    end loop;
  end loop;

  return query select v_ditandai, v_diarsipkan, v_diingatkan;
end;
$fn$;

-- --------------------------------------------------------------------------
-- Scheduling
-- --------------------------------------------------------------------------
-- pg_cron satisfies the scheduler the PRD names as a hard prerequisite for
-- this phase (PRD §17, Risks). Times are UTC; 22:00 UTC is 05:00 WIB, so the
-- sweeps have run before the office opens.
create extension if not exists pg_cron;

select cron.schedule('simks-sapu-sla',        '0 22 * * *',  'select sapu_sla()');
select cron.schedule('simks-sapu-kedaluarsa', '15 22 * * *', 'select sapu_kedaluarsa()');

-- Neither sweep is reachable from the API: they run as the scheduler.
revoke execute on function sapu_sla() from public, anon, authenticated;
revoke execute on function sapu_kedaluarsa() from public, anon, authenticated;
revoke execute on function catat_notifikasi(text, int, int, int, int, text)
  from public, anon, authenticated;
revoke execute on function jabatan_io() from public, anon, authenticated;

comment on function sapu_sla is
  'Daily. Flags open targets only; resolved durations stay frozen (DR-03).
   Idempotent -- reminders are unique per (target, severity, recipient).';
comment on function sapu_kedaluarsa is
  'Daily. Marks Akan Berakhir, archives expired with a reason, and emits
   expiring_soon on the monthly-then-weekly cadence. Idempotent.';
