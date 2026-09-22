-- Revisi V8 §19 — where documents actually get stuck. No status-change log
-- existed before this (recompute_tiers overwrites status_proposal in place),
-- so proposal_status_history starts capturing from here forward; it will be
-- sparse until new transitions accumulate (accepted limitation, no backfill).
-- The backlog trend below instead reuses notifikasi, which already has
-- historical sla_yellow/sla_red rows, so that one chart is retroactive.

create table proposal_status_history (
  id                   int generated always as identity primary key,
  id_proposal_dokumen  int not null references proposal_dokumen (id),
  status_lama          varchar(30),
  status_baru          varchar(30) not null,
  waktu                timestamptz not null default now(),
  id_akun              int references akun (id)
);

create index proposal_status_history_proposal_idx
  on proposal_status_history (id_proposal_dokumen, waktu);

alter table proposal_status_history enable row level security;
create policy proposal_status_history_baca on proposal_status_history for select to authenticated
  using (boleh_baca_proposal(id_proposal_dokumen));
create policy proposal_status_history_tulis on proposal_status_history for insert to authenticated
  with check (current_akun_id() is not null);

create function catat_status_proposal() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' or new.status_proposal is distinct from old.status_proposal then
    insert into proposal_status_history (id_proposal_dokumen, status_lama, status_baru, id_akun)
    values (new.id, case when tg_op = 'INSERT' then null else old.status_proposal end,
            new.status_proposal, current_akun_id());
  end if;
  return new;
end;
$fn$;

create trigger proposal_status_history_trg
  after insert or update of status_proposal on proposal_dokumen
  for each row execute function catat_status_proposal();

-- 1. Time-in-status funnel: avg/median days spent in each stage, from
-- consecutive history rows (the next row's timestamp closes the interval;
-- an unclosed final row uses now()).
create view v_time_in_status with (security_invoker = true) as
with berurutan as (
  select id_proposal_dokumen, status_baru, waktu,
         lead(waktu) over (partition by id_proposal_dokumen order by waktu) as waktu_selesai
    from proposal_status_history
),
durasi as (
  select status_baru as status,
         extract(epoch from (coalesce(waktu_selesai, now()) - waktu)) / 86400.0 as hari
    from berurutan
)
select status,
       count(*)::int as jumlah,
       round(avg(hari)::numeric, 1) as rata_rata_hari,
       round((percentile_cont(0.5) within group (order by hari))::numeric, 1) as median_hari
  from durasi
 group by status;

-- 2. Per-jabatan leaderboard: who currently holds the most overdue targets,
-- and their average resolution time on ones they already acted on.
create view v_leaderboard_pending with (security_invoker = true) as
select j.id as id_jabatan, j.nama as jabatan,
       count(*) filter (where dt.status = 'pending_action'
                          and dt.status_sla in ('yellow','red'))::int as tertahan,
       round(avg(dt.durasi_hari_kerja)
             filter (where dt.status in ('approved','rejected')), 1) as rata_rata_hari
  from disposisi_target dt
  join jabatan j on j.id = dt.id_jabatan
  join disposisi d on d.no = dt.no_disposisi and d.jenis_disposisi = 'approval'
 where dt.status <> 'removed'
 group by j.id, j.nama
having count(*) filter (where dt.status = 'pending_action' and dt.status_sla in ('yellow','red')) > 0
    or count(*) filter (where dt.status in ('approved','rejected')) > 0
 order by tertahan desc, rata_rata_hari desc;

-- 3. Per-unit breakdown: which proposing units' in-flight documents have
-- been sitting the longest.
create view v_unit_delay_breakdown with (security_invoker = true) as
select u.id as id_unit, u.nama as unit,
       count(distinct p.id)::int as dokumen_tertahan,
       round(avg(extract(epoch from (now() - p.waktu_proposal_dokumen)) / 86400.0)::numeric, 1)
         as rata_rata_hari
  from proposal_dokumen p
  join pengusul pg on pg.id_proposal_dokumen = p.id
  join jabatan j on j.id = pg.id_jabatan
  join unit u on u.id = j.id_unit
 where p.status_proposal in ('Diajukan','Diproses','Disposisi - Tier 1',
                             'Disposisi - Tier 2','Disposisi - Tier 3','Pending')
 group by u.id, u.nama
 order by rata_rata_hari desc;

-- 4. Backlog trend: month-over-month batas-waktu breach counts, from the
-- notifikasi log that already exists — no new table needed, and it is
-- retroactive rather than starting empty.
create view v_backlog_trend with (security_invoker = true) as
select date_trunc('month', waktu_kirim)::date as bulan,
       count(*) filter (where jenis_notifikasi = 'sla_yellow')::int as kuning,
       count(*) filter (where jenis_notifikasi = 'sla_red')::int as merah
  from notifikasi
 where jenis_notifikasi in ('sla_yellow', 'sla_red')
 group by 1
 order by 1;

grant select on v_time_in_status, v_leaderboard_pending, v_unit_delay_breakdown, v_backlog_trend
  to authenticated;
