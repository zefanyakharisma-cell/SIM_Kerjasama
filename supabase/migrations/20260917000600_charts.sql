-- Phase 3 — Studio Grafik Mitra (PRD §8.1).
--
-- IO Admin saves up to five charts; everyone else views them read-only. The
-- saved shape lives in dashboard_chart.config, and this function turns one such
-- config into rows.
--
-- The aggregation runs in SQL, but NOT by concatenating the config into a query
-- string. Grouping, metric and filter are each matched against a fixed set and
-- anything unrecognised is refused — a saved chart config is admin-supplied
-- data, and data must never become SQL.

create function agregasi_grafik(p_config jsonb)
returns table (label text, nilai bigint)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_grouping text := coalesce(p_config ->> 'grouping', 'negara');
  v_sumber   text := coalesce(p_config ->> 'sumber_data', 'dokumen');
  v_maks     int  := least(coalesce((p_config ->> 'maks')::int, 10), 50);
  v_f_status text := nullif(p_config #>> '{filter,status}', '');
  v_f_jenis  text := nullif(p_config #>> '{filter,dokumen}', '');
  v_f_fak    text := nullif(p_config #>> '{filter,fakultas}', '');
  v_f_region text := nullif(p_config #>> '{filter,region}', '');
begin
  if v_grouping not in ('negara','jenis','status','fakultas','bulan') then
    raise exception 'Unknown grouping %', v_grouping;
  end if;
  if v_sumber not in ('dokumen','mitra') then
    raise exception 'Unknown metric %', v_sumber;
  end if;

  return query
  with dasar as (
    select d.*,
           case when d.is_international then 'Internasional' else 'Domestik' end as region
      from v_daftar_dokumen d
     -- Status defaults to active; the archive is a filter value, never a global
     -- toggle (PRD §8.2).
     where (v_f_status is null or d.status_tampil = v_f_status)
       and (v_f_status is not null or d.status_dokumen = 'Aktif')
       and (v_f_jenis is null or d.jenis_kerjasama = v_f_jenis)
       and (v_f_fak is null or d.unit_pengusul ilike '%' || v_f_fak || '%')
  ),
  disaring as (
    select * from dasar
     where v_f_region is null
        or (v_f_region = 'Internasional' and is_international)
        or (v_f_region = 'Domestik' and not is_international)
  ),
  dikelompokkan as (
    select
      case v_grouping
        when 'negara'   then coalesce(negara, 'Tidak diketahui')
        when 'jenis'    then jenis_kerjasama
        when 'status'   then status_tampil
        when 'fakultas' then coalesce(unit_pengusul, 'Tanpa unit')
        when 'bulan'    then to_char(coalesce(tanggal_mulai, waktu_proposal_dokumen::date),
                                     'YYYY-MM')
      end as label,
      id_proposal,
      nama_mitra
    from disaring
  )
  select g.label,
         case when v_sumber = 'mitra'
              then count(distinct g.nama_mitra)
              else count(distinct g.id_proposal) end as nilai
    from dikelompokkan g
   where g.label is not null
   group by g.label
   order by case when v_grouping = 'bulan' then null else 2 end desc nulls last,
            case when v_grouping = 'bulan' then g.label end
   limit v_maks;
end;
$fn$;

grant execute on function agregasi_grafik(jsonb) to authenticated;

comment on function agregasi_grafik is
  'One saved Studio chart config becomes rows. Grouping/metric/filter are
   matched against fixed sets; config data never becomes SQL text.';

-- At most five saved charts (PRD §8.1). The urutan column already checks
-- 1..5; making it unique is what stops two charts claiming the same slot —
-- enforced here rather than in the admin form, because the form is not the only
-- thing that can insert a row.
create unique index dashboard_chart_urutan_idx on dashboard_chart (urutan);
