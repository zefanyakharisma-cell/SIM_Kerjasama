-- Studio Grafik becomes personal: every account owns its own charts and can
-- add, edit, delete and reorder them on the Dashboard. The shared,
-- admin-curated set (and the per-account hide/reorder layer on top of it) is
-- retired.
--
-- On an account's first Dashboard visit salin_grafik_default() gives it its
-- own copy of five default charts; "Reset ke default" calls it again. The
-- akun.grafik_default_disalin flag is what keeps an account that deliberately
-- deleted every chart from getting the defaults back on the next visit.

drop table dashboard_chart_preference;
drop index dashboard_chart_urutan_idx;

-- The shared charts belonged to nobody; they are replaced by per-account copies.
delete from dashboard_chart;

alter table dashboard_chart
  drop column is_visible,
  drop column id_akun_pembuat,
  drop constraint dashboard_chart_urutan_check,
  add column id_akun int not null default current_akun_id()
    references akun (id) on delete cascade,
  add constraint dashboard_chart_urutan_check check (urutan >= 1);

create index dashboard_chart_akun_idx on dashboard_chart (id_akun, urutan);

alter table akun add column grafik_default_disalin boolean not null default false;

-- Own rows only. The old read-all / io_admin-writes policies go.
drop policy dashboard_chart_baca on dashboard_chart;
drop policy dashboard_chart_kelola on dashboard_chart;
create policy dashboard_chart_sendiri on dashboard_chart for all to authenticated
  using (id_akun = current_akun_id())
  with check (id_akun = current_akun_id());

-- Each chart is one agregasi_grafik call per Dashboard load, so the count is
-- capped rather than left to grow.
create function batasi_grafik() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if (select count(*) from dashboard_chart where id_akun = new.id_akun) >= 12 then
    raise exception 'Maksimal 12 grafik per akun.';
  end if;
  return new;
end;
$fn$;

create trigger dashboard_chart_batas
  before insert on dashboard_chart
  for each row execute function batasi_grafik();

create function salin_grafik_default() returns void
language plpgsql security definer set search_path = public as $fn$
declare v_akun int := current_akun_id();
begin
  if v_akun is null then
    raise exception 'Tidak ada sesi akun.';
  end if;

  delete from dashboard_chart where id_akun = v_akun;

  insert into dashboard_chart (id_akun, urutan, judul, jenis_grafik, config) values
    (v_akun, 1, 'Dokumen per Negara',   'batang_horizontal', '{"grouping":"negara","sumber_data":"dokumen","maks":10}'),
    (v_akun, 2, 'Dokumen per Jenis',    'donut',             '{"grouping":"jenis","sumber_data":"dokumen","maks":10}'),
    (v_akun, 3, 'Dokumen per Status',   'batang_vertikal',   '{"grouping":"status","sumber_data":"dokumen","maks":10}'),
    (v_akun, 4, 'Dokumen per Fakultas', 'batang_vertikal',   '{"grouping":"fakultas","sumber_data":"dokumen","maks":10}'),
    (v_akun, 5, 'Dokumen per Bulan',    'garis',             '{"grouping":"bulan","sumber_data":"dokumen","maks":24}');

  update akun set grafik_default_disalin = true where id = v_akun;
end;
$fn$;

revoke execute on function batasi_grafik() from public, anon, authenticated;
revoke execute on function salin_grafik_default() from public, anon;
grant execute on function salin_grafik_default() to authenticated;

comment on table dashboard_chart is
  'Per-account Studio Grafik charts (max 12). urutan orders them on the Dashboard.';
