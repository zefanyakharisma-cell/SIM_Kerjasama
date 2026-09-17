-- Split the tujuan/manfaat_petra/manfaat_mitra groups out of managed_options
-- into their own dedicated tables, so the proposal form dropdown is a plain
-- select over a real table (like jenis_mitra) instead of one row-filtered by
-- option_group. jabatan_freetext is the only group left in managed_options.
--
-- Pre-launch project, no production data yet (schema.md 0), so this only
-- redefines the schema -- seed.sql supplies the values directly into the new
-- tables rather than this migration copying rows forward.

create table tujuan_kerjasama (
  id        int generated always as identity primary key,
  nilai     varchar(1000) not null unique,
  is_active boolean not null default true
);

create table manfaat_petra (
  id        int generated always as identity primary key,
  nilai     varchar(1000) not null unique,
  is_active boolean not null default true
);

create table manfaat_mitra (
  id        int generated always as identity primary key,
  nilai     varchar(1000) not null unique,
  is_active boolean not null default true
);

alter table managed_options drop constraint managed_options_option_group_check;
alter table managed_options add constraint managed_options_option_group_check
  check (option_group in ('jabatan_freetext'));

-- Same master-data RLS shape as the other lookup tables (see 20260916000800_rls.sql).
do $rls$
declare t text;
begin
  foreach t in array array['tujuan_kerjasama','manfaat_petra','manfaat_mitra']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated using (current_akun_id() is not null)',
      t || '_baca', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using ((current_akun()).role = ''io_admin'')
         with check ((current_akun()).role = ''io_admin'')',
      t || '_kelola', t);
  end loop;
end
$rls$;
