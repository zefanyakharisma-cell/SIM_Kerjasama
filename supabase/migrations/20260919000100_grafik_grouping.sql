-- Revisi V5 §2 — Studio Grafik "Dikelompokkan menurut".
--
-- New groupings: Unit (UA/UP), Fakultas/Prodi with a level, and three date
-- groupings (signed / start / end) by month or year. 'bulan' is retired and
-- mapped to 'mulai' + periode 'bulan' so old configs keep drawing.
--
-- Negara and unit groupings now split per partner / per proposing unit rather
-- than grouping on the view's comma-joined strings, which put a two-country
-- document under a third, combined label.
--
-- Same signature, so the existing grants (authenticated only, see
-- 20260918000200_cabut_anon.sql) stand.

create or replace function agregasi_grafik(p_config jsonb)
returns table (label text, nilai bigint)
language plpgsql stable security definer set search_path = public as $fn$
#variable_conflict use_column
declare
  v_grouping text := coalesce(nullif(p_config ->> 'grouping', ''), 'negara');
  v_sumber   text := coalesce(nullif(p_config ->> 'sumber_data', ''), 'dokumen');
  v_maks     int  := least(coalesce((p_config ->> 'maks')::int, 10), 50);
  v_level    text := coalesce(nullif(p_config ->> 'level', ''), 'fakultas');
  v_periode  text := coalesce(nullif(p_config ->> 'periode', ''), 'bulan');
  v_f_status text := nullif(p_config #>> '{filter,status}', '');
  v_f_jenis  text := nullif(p_config #>> '{filter,dokumen}', '');
  v_f_fak    text := nullif(p_config #>> '{filter,fakultas}', '');
  v_f_region text := nullif(p_config #>> '{filter,region}', '');
  v_fmt      text;
  v_tanggal  boolean;
begin
  if v_grouping = 'bulan' then v_grouping := 'mulai'; end if;  -- retired key
  if v_grouping not in ('negara','jenis','status','fakultas','jenis_unit',
                        'tanda_tangan','mulai','selesai') then
    raise exception 'Unknown grouping %', v_grouping;
  end if;
  if v_sumber not in ('dokumen','mitra') then
    raise exception 'Unknown metric %', v_sumber;
  end if;
  if v_level not in ('fakultas','prodi','keduanya') then
    raise exception 'Unknown level %', v_level;
  end if;
  if v_periode not in ('bulan','tahun') then
    raise exception 'Unknown periode %', v_periode;
  end if;
  v_fmt := case v_periode when 'tahun' then 'YYYY' else 'YYYY-MM' end;
  v_tanggal := v_grouping in ('tanda_tangan','mulai','selesai');

  return query
  with recursive pohon as (
    -- Each unit's ancestors: depth 1 is the faculty (child of the university
    -- root), depth 2 the study programme.
    select u.id, 0 as kedalaman, null::int as fak, null::int as prodi
      from unit u where u.id_parent_unit is null
    union all
    select c.id, p.kedalaman + 1,
           case when p.kedalaman + 1 = 1 then c.id else p.fak end,
           case when p.kedalaman + 1 = 2 then c.id else p.prodi end
      from unit c join pohon p on c.id_parent_unit = p.id
  ),
  disaring as (
    select d.*
      from v_daftar_dokumen d
     -- Status defaults to every still-current agreement ('Aktif' and 'Akan
     -- Berakhir'); the archive stays a filter value (PRD §8.2).
     where (v_f_status is null or d.status_tampil = v_f_status)
       and (v_f_status is not null or d.status_dokumen in ('Aktif','Akan Berakhir'))
       and (v_f_jenis is null or d.jenis_kerjasama = v_f_jenis)
       and (v_f_fak is null or d.unit_pengusul ilike '%' || v_f_fak || '%')
       and (v_f_region is null
            or (v_f_region = 'Internasional' and d.is_international)
            or (v_f_region = 'Domestik' and not d.is_international))
  ),
  dikelompokkan as (
    select x.lbl, d.id_proposal, d.nama_mitra
      from disaring d
      cross join lateral (
        select d.status_tampil::text as lbl where v_grouping = 'status'
        union all
        select d.jenis_kerjasama where v_grouping = 'jenis'
        union all
        select n.nama::text
          from partner_pengusul pp
          join partner pr on pr.id = pp.id_partner
          join negara n on n.id = pr.id_negara
         where v_grouping = 'negara' and pp.id_proposal_dokumen = d.id_proposal
        union all
        -- Academic units only: a faculty chart has no place for the Rectorate
        -- secretariat; UA/UP is its own grouping.
        select u.nama::text
          from pengusul pg
          join jabatan j on j.id = pg.id_jabatan
          join pohon t on t.id = j.id_unit
          join unit u on u.id = case v_level when 'fakultas' then t.fak
                                             when 'prodi'    then t.prodi
                                             else t.id end
          join jenis_unit ju on ju.id = u.id_jenis_unit
         where v_grouping = 'fakultas' and pg.id_proposal_dokumen = d.id_proposal
           and ju.jenis = 'Unit Akademik'
        union all
        select ju.jenis::text
          from pengusul pg
          join jabatan j on j.id = pg.id_jabatan
          join unit u on u.id = j.id_unit
          join jenis_unit ju on ju.id = u.id_jenis_unit
         where v_grouping = 'jenis_unit' and pg.id_proposal_dokumen = d.id_proposal
        union all
        select to_char(d.tanggal_tanda_tangan, v_fmt) where v_grouping = 'tanda_tangan'
        union all
        select to_char(d.tanggal_mulai, v_fmt) where v_grouping = 'mulai'
        union all
        select to_char(d.tanggal_berakhir, v_fmt) where v_grouping = 'selesai'
      ) x
  ),
  hasil as (
    select g.lbl,
           case when v_sumber = 'mitra'
                then count(distinct g.nama_mitra)
                else count(distinct g.id_proposal) end as jml
      from dikelompokkan g
     where g.lbl is not null
     group by g.lbl
  ),
  -- Dates keep the most recent periods, the rest keep the largest categories.
  teratas as (
    select h.lbl, h.jml from hasil h
     order by case when v_tanggal then h.lbl end desc nulls last,
              h.jml desc, h.lbl
     limit v_maks
  )
  select t.lbl, t.jml from teratas t
   order by case when v_tanggal then t.lbl end, t.jml desc, t.lbl;
end;
$fn$;

-- Saved charts on the retired key.
update dashboard_chart
   set config = jsonb_set(config, '{grouping}', '"mulai"') || '{"periode":"bulan"}'
 where config ->> 'grouping' = 'bulan';

-- The fifth default chart moves to the new key too. Same signature, so the
-- grants from 20260918000500_grafik_pribadi.sql stand.
create or replace function salin_grafik_default() returns void
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
    (v_akun, 4, 'Dokumen per Fakultas', 'batang_vertikal',   '{"grouping":"fakultas","level":"fakultas","sumber_data":"dokumen","maks":10}'),
    (v_akun, 5, 'Dokumen per Bulan Mulai', 'garis',          '{"grouping":"mulai","periode":"bulan","sumber_data":"dokumen","maks":24}');

  update akun set grafik_default_disalin = true where id = v_akun;
end;
$fn$;
