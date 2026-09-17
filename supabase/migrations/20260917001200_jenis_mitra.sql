-- Partner category (JENIS_MITRA.csv import): Pendidikan / Industri /
-- Organisasi-Yayasan-Asosiasi / Lembaga Pemerintahan / Perorangan-Kedutaan-Gereja.
-- Distinct from partner.is_international ("Jenis Mitra" already used for
-- domestic/international in the UI) -- this is the partner's own category.

create table jenis_mitra (
  id   int generated always as identity primary key,
  nama varchar(150) not null unique
);

alter table partner add column id_jenis_mitra int references jenis_mitra (id);

-- Same master-data RLS shape as schema.md 2.x: readable by any authenticated
-- account, written by IO Admin only (see 20260916000800_rls.sql).
alter table jenis_mitra enable row level security;
create policy jenis_mitra_baca on jenis_mitra for select to authenticated
  using (current_akun_id() is not null);
create policy jenis_mitra_kelola on jenis_mitra for all to authenticated
  using ((current_akun()).role = 'io_admin')
  with check ((current_akun()).role = 'io_admin');
