-- Per-account Studio Grafik Mitra preferences (revision request: "everyone
-- can access and edit the studio grafik mitra, save their preferences
-- settings... saved on that account").
--
-- dashboard_chart itself stays IO Admin's shared, curated set of up to five
-- charts (unchanged). This table only layers a per-account view on top: hide
-- a chart, or move it earlier/later — never a second copy of the chart's own
-- config, so an edit here can't diverge from what the chart actually
-- aggregates.

create table dashboard_chart_preference (
  id         int generated always as identity primary key,
  id_akun    int not null references akun (id) on delete cascade,
  id_chart   int not null references dashboard_chart (id) on delete cascade,
  is_hidden  boolean not null default false,
  urutan     smallint not null default 1 check (urutan between 1 and 5),
  updated_at timestamptz not null default now(),
  unique (id_akun, id_chart)
);
create index dashboard_chart_preference_akun_idx on dashboard_chart_preference (id_akun);

alter table dashboard_chart_preference enable row level security;

-- One account only ever reads or writes its own row — this is a personal
-- display setting, not master data, so it does not go through the io_admin
-- master-data policy pattern above it.
create policy dashboard_chart_preference_sendiri
  on dashboard_chart_preference for all to authenticated
  using (id_akun = current_akun_id())
  with check (id_akun = current_akun_id());

comment on table dashboard_chart_preference is
  'Per-account hide/reorder of the shared Studio Grafik charts. One row per
   (account, chart); absent means "use the chart''s own default position".';
