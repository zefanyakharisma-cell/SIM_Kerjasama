-- Revisi V8 §3 — Sustainable Development Goals on the proposal.
--
-- The 17 goals are the UN's, not this institution's: there is no CRUD for them,
-- no is_active, no Master Data tab. RLS grants SELECT and defines no write
-- policy at all, which refuses io_admin as firmly as it refuses everyone else.

-- ============================================================================
-- 1. The master list
-- ============================================================================
-- `nomor` IS the key. It is the UN's own numbering, it never changes, and using
-- it directly lets the seed below be a plain insert with no identity override
-- and no lookup by name.
create table sdg (
  nomor  int primary key check (nomor between 1 and 17),
  nama   varchar(100) not null,
  warna  char(7) not null          -- the official UN hex, for a future pill
);

-- Seeded HERE rather than in seed.sql: seed.sql only runs under
-- `supabase db reset` (local), while production is `supabase db push`, which
-- applies migrations and nothing else. A list that must exist in production is
-- therefore part of the migration. `on conflict` keeps a re-run harmless.
insert into sdg (nomor, nama, warna) values
  (1,  'Tanpa Kemiskinan',                                    '#E5243B'),
  (2,  'Tanpa Kelaparan',                                     '#DDA63A'),
  (3,  'Kehidupan Sehat dan Sejahtera',                       '#4C9F38'),
  (4,  'Pendidikan Berkualitas',                              '#C5192D'),
  (5,  'Kesetaraan Gender',                                   '#FF3A21'),
  (6,  'Air Bersih dan Sanitasi Layak',                       '#26BDE2'),
  (7,  'Energi Bersih dan Terjangkau',                        '#FCC30B'),
  (8,  'Pekerjaan Layak dan Pertumbuhan Ekonomi',             '#A21942'),
  (9,  'Industri, Inovasi dan Infrastruktur',                 '#FD6925'),
  (10, 'Berkurangnya Kesenjangan',                            '#DD1367'),
  (11, 'Kota dan Permukiman Berkelanjutan',                   '#FD9D24'),
  (12, 'Konsumsi dan Produksi yang Bertanggung Jawab',        '#BF8B2E'),
  (13, 'Penanganan Perubahan Iklim',                          '#3F7E44'),
  (14, 'Ekosistem Lautan',                                    '#0A97D9'),
  (15, 'Ekosistem Daratan',                                   '#56C02B'),
  (16, 'Perdamaian, Keadilan dan Kelembagaan yang Tangguh',   '#00689D'),
  (17, 'Kemitraan untuk Mencapai Tujuan',                     '#19486A')
on conflict (nomor) do nothing;

comment on table sdg is
  'The 17 UN Sustainable Development Goals. Fixed by the UN, so this table has
   a read policy and deliberately no write policy -- not even for io_admin.';

alter table sdg enable row level security;
create policy sdg_baca on sdg for select to authenticated
  using (current_akun_id() is not null);
-- No _kelola policy on purpose. See the comment above.

-- ============================================================================
-- 2. The join
-- ============================================================================
-- ON DELETE CASCADE like every other proposal child, so bersihkan_proposal_uji
-- (the test seam) needs no new delete line.
create table proposal_dokumen_sdg (
  id_proposal_dokumen int not null references proposal_dokumen (id) on delete cascade,
  nomor_sdg           int not null references sdg (nomor),
  primary key (id_proposal_dokumen, nomor_sdg)
);

-- Verbatim the child-table pattern from 20260916000800_rls.sql's do-loop:
-- read follows the parent's one read rule, write is IO or the Draft's own
-- creator.
alter table proposal_dokumen_sdg enable row level security;

create policy proposal_dokumen_sdg_baca on proposal_dokumen_sdg for select to authenticated
  using (boleh_baca_proposal(id_proposal_dokumen));

create policy proposal_dokumen_sdg_tulis on proposal_dokumen_sdg for all to authenticated
  using (current_akun_is_io() or exists (
           select 1 from proposal_dokumen p
            where p.id = proposal_dokumen_sdg.id_proposal_dokumen
              and p.id_akun_pembuat = current_akun_id()
              and p.status_proposal = 'Draft'))
  with check (current_akun_is_io() or exists (
           select 1 from proposal_dokumen p
            where p.id = proposal_dokumen_sdg.id_proposal_dokumen
              and p.id_akun_pembuat = current_akun_id()
              and p.status_proposal = 'Draft'));

-- ============================================================================
-- 3. simpan_anak_proposal gains p_sdg
-- ============================================================================
-- DROP + CREATE, not CREATE OR REPLACE. `create or replace` cannot change a
-- function's argument list: adding p_sdg that way would leave a SECOND
-- overload behind, and then a 9-argument call matches the old function exactly
-- AND the new one through its default -- Postgres raises "function is not
-- unique" and PostgREST cannot resolve the RPC at all. Dropping first is the
-- only safe move. Nothing depends on this function (no view, no policy, no
-- trigger), so the drop is free -- but it takes the ACL with it, which is why
-- the revoke/grant is re-issued below against the new signature.
drop function simpan_anak_proposal(int, jsonb, int, int[], int[], int[], text, jsonb, jsonb);

create function simpan_anak_proposal(
  p_id         int,
  p_partner    jsonb,  -- [{id_partner, is_lead}]
  p_id_jabatan int,
  p_bidang     int[],
  p_agenda     int[],
  p_unit       int[],
  p_jenis      text,
  p_mou        jsonb,  -- {ringkasan_kegiatan}
  p_moa        jsonb,  -- {hak_petra, hak_calon_mitra, kewajiban_petra, kewajiban_calon_mitra}
  -- Appended, with a default, so the existing 9-argument positional callers
  -- (the test suite) keep working unchanged and simply clear the set.
  p_sdg        int[] default '{}'
) returns void
language plpgsql set search_path = public as $fn$
begin
  if p_jenis is null or p_jenis not in ('MoU', 'MoA') then
    raise exception 'jenis_kerjasama must be MoU or MoA, got %', p_jenis;
  end if;

  delete from partner_pengusul where id_proposal_dokumen = p_id;
  delete from pengusul where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_bidang where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_agenda where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_unit where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_mou where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_moa where id_proposal_dokumen = p_id;
  delete from proposal_dokumen_sdg where id_proposal_dokumen = p_id;

  insert into partner_pengusul (id_partner, id_proposal_dokumen, is_lead)
  select (x ->> 'id_partner')::int, p_id, coalesce((x ->> 'is_lead')::boolean, false)
    from jsonb_array_elements(coalesce(p_partner, '[]'::jsonb)) x;

  if p_id_jabatan is not null then
    insert into pengusul (id_jabatan, id_proposal_dokumen) values (p_id_jabatan, p_id);
  end if;

  if coalesce(array_length(p_bidang, 1), 0) > 0 then
    insert into proposal_dokumen_bidang (id_proposal_dokumen, id_bidang_kerjasama)
    select p_id, b from unnest(p_bidang) b;
  end if;

  if coalesce(array_length(p_agenda, 1), 0) > 0 then
    insert into proposal_dokumen_agenda (id_proposal_dokumen, id_agenda)
    select p_id, a from unnest(p_agenda) a;
  end if;

  if coalesce(array_length(p_unit, 1), 0) > 0 then
    insert into proposal_dokumen_unit (id_proposal_dokumen, id_unit)
    select p_id, u from unnest(p_unit) u;
  end if;

  if coalesce(array_length(p_sdg, 1), 0) > 0 then
    insert into proposal_dokumen_sdg (id_proposal_dokumen, nomor_sdg)
    select p_id, s from unnest(p_sdg) s;
  end if;

  if p_jenis = 'MoU' then
    insert into proposal_dokumen_mou (id_proposal_dokumen, ringkasan_kegiatan)
    values (p_id, coalesce(p_mou ->> 'ringkasan_kegiatan', ''));
  else
    insert into proposal_dokumen_moa (id_proposal_dokumen, hak_petra, hak_calon_mitra,
                                      kewajiban_petra, kewajiban_calon_mitra)
    values (p_id, coalesce(p_moa ->> 'hak_petra', ''), coalesce(p_moa ->> 'hak_calon_mitra', ''),
            coalesce(p_moa ->> 'kewajiban_petra', ''), coalesce(p_moa ->> 'kewajiban_calon_mitra', ''));
  end if;
end;
$fn$;

comment on function simpan_anak_proposal is
  'Replaces the eight child rows of a proposal atomically (create and edit
   alike), SDGs included. SECURITY INVOKER on purpose: it runs under the
   caller''s RLS, the same *_tulis policies that gated the direct table writes
   it replaces.';

revoke execute on function simpan_anak_proposal(
  int, jsonb, int, int[], int[], int[], text, jsonb, jsonb, int[]
) from public, anon;
grant execute on function simpan_anak_proposal(
  int, jsonb, int, int[], int[], int[], text, jsonb, jsonb, int[]
) to authenticated;

-- The drop+create changes the exposed RPC signature, so PostgREST's schema
-- cache has to be told. `supabase db reset` / `db push` restart it anyway;
-- this makes a live push safe too.
notify pgrst, 'reload schema';
