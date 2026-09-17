-- Phase 3 — evaluation analytics, the renewal queue, the map feed, and the
-- master-data operation that has real consequences: partner merge.

-- --------------------------------------------------------------------------
-- Evaluation analytics with drill-down (G8, Q8, PRD §8.3)
-- --------------------------------------------------------------------------
-- The expectation-vs-satisfaction gap across the five dimensions, unpivoted one
-- row per (evaluation × dimension).
--
-- Every row keeps `id_dokumen_kerjasama`. That single column is what makes the
-- drill-down possible: any aggregate over this view can be clicked back to the
-- partnerships behind the figure, because the link was never aggregated away.
-- An analytics query that drops it cannot be repaired downstream.
create view v_evaluasi_gap with (security_invoker = true) as
select
  e.no                      as no_evaluasi,
  e.id_dokumen_kerjasama,
  e.respondent_type,
  e.status,
  e.waktu_evaluasi,
  e.form_revision,
  d.dimensi,
  d.harapan,
  d.kepuasan,
  (d.kepuasan - d.harapan)  as gap,
  u.nama                    as unit_pengusul,
  pr.nama                   as nama_mitra,
  pr.is_international,
  n.nama                    as negara
from evaluasi e
cross join lateral (values
  ('Kualitas',       e.exp_quality,        e.sat_quality),
  ('Relevansi',      e.exp_relevance,      e.sat_relevance),
  ('Produktivitas',  e.exp_productivity,   e.sat_productivity),
  ('Keberlanjutan',  e.exp_sustainability, e.sat_sustainability),
  ('Komunikasi',     e.exp_communication,  e.sat_communication)
) as d(dimensi, harapan, kepuasan)
join dokumen_kerja_sama dk on dk.no = e.id_dokumen_kerjasama
left join lateral (
  select pr2.* from partner_pengusul pp
    join partner pr2 on pr2.id = pp.id_partner
   where pp.id_proposal_dokumen = dk.id_proposal_dokumen
   order by pp.is_lead desc limit 1
) pr on true
left join negara n on n.id = pr.id_negara
left join lateral (
  select u2.nama from pengusul pg
    join jabatan j on j.id = pg.id_jabatan
    join unit u2 on u2.id = j.id_unit
   where pg.id_proposal_dokumen = dk.id_proposal_dokumen limit 1
) u on true
-- Superseded answers are history, not data: analytics read the latest
-- non-superseded row (DR-08).
where e.status = 'submitted';

comment on view v_evaluasi_gap is
  'Expectation-vs-satisfaction gap, one row per evaluation per dimension. Keeps
   id_dokumen_kerjasama on every row so any figure drills back down (Q8).';

-- --------------------------------------------------------------------------
-- The renewal queue (Design §5.3, §5.8)
-- --------------------------------------------------------------------------
-- One row per document in the renewal process, carrying both evaluation states,
-- the gate, and the renewal-request SLA on its own 30/60/90 CALENDAR-day scale
-- — never the 2/4 business-day approval scale (BR-32).
create view v_pembaruan with (security_invoker = true) as
select
  dk.no                       as no_dokumen_kerjasama,
  dk.id_proposal_dokumen      as id_proposal,
  dk.no_dokumen,
  dk.status                   as status_dokumen,
  dk.tanggal_berakhir,
  dk.tanggal_berakhir - current_date as sisa_hari,
  mitra.nama_mitra,
  unitp.unit_pengusul,
  d.no                        as no_disposisi,
  d.waktu_disposisi,
  (current_date - d.waktu_disposisi::date) as usia_permintaan_hari,
  ev.no_evaluasi_faculty,
  ev.status_faculty,
  ev.rekomendasi_faculty,
  ev.no_evaluasi_partner,
  ev.status_partner,
  ev.rekomendasi_partner,
  ev.token_partner,
  status_gerbang_pembaruan(dk.no) as gerbang,
  -- Successor, once a Perpanjangan exists for this document.
  penerus.id                  as id_proposal_penerus
from dokumen_kerja_sama dk
join disposisi d on d.no_dokumen_kerjasama = dk.no
                and d.jenis_disposisi = 'renewal_request'
left join lateral (
  select
    max(case when respondent_type='faculty' then e.no end)          as no_evaluasi_faculty,
    max(case when respondent_type='faculty' then e.status end)      as status_faculty,
    max(case when respondent_type='faculty' then e.rekomendasi end) as rekomendasi_faculty,
    max(case when respondent_type='partner' then e.no end)          as no_evaluasi_partner,
    max(case when respondent_type='partner' then e.status end)      as status_partner,
    max(case when respondent_type='partner' then e.rekomendasi end) as rekomendasi_partner,
    max(case when respondent_type='partner' then t.token end)       as token_partner
  from evaluasi e
  left join partner_eval_token t on t.id_evaluasi = e.no and t.is_active
  where e.id_dokumen_kerjasama = dk.no and e.status <> 'superseded'
) ev on true
left join lateral (
  select string_agg(pr.nama, ', ' order by pp.is_lead desc, pr.nama) as nama_mitra
    from partner_pengusul pp join partner pr on pr.id = pp.id_partner
   where pp.id_proposal_dokumen = dk.id_proposal_dokumen
) mitra on true
left join lateral (
  select string_agg(u.nama, ', ') as unit_pengusul
    from pengusul pg join jabatan j on j.id = pg.id_jabatan join unit u on u.id = j.id_unit
   where pg.id_proposal_dokumen = dk.id_proposal_dokumen
) unitp on true
left join proposal_dokumen penerus on penerus.id_dokumen_sebelumnya = dk.id_proposal_dokumen;

comment on view v_pembaruan is
  'The renewal queue: both evaluation states, the four-outcome gate, and the
   renewal-request SLA on its own 30/60/90 day scale (BR-32).';

-- --------------------------------------------------------------------------
-- Peta Mitra Global (PRD §8.1)
-- --------------------------------------------------------------------------
-- Only partners that actually have coordinates; a partner without them is
-- absent from the map rather than pinned at 0°,0° off West Africa.
create view v_peta_mitra with (security_invoker = true) as
select p.id, p.nama, p.kota, p.latitude, p.longitude,
       p.is_international, n.nama as negara, n.kode as kode_negara,
       count(pp.id_proposal_dokumen) as jumlah_dokumen
  from partner p
  join negara n on n.id = p.id_negara
  left join partner_pengusul pp on pp.id_partner = p.id
 where p.is_active and p.latitude is not null and p.longitude is not null
 group by p.id, p.nama, p.kota, p.latitude, p.longitude, p.is_international,
          n.nama, n.kode;

-- --------------------------------------------------------------------------
-- Partner merge (BR-14)
-- --------------------------------------------------------------------------
-- Re-points every reference, then marks the loser merged. It never deletes, and
-- it is one transaction: a half-merged partner leaves documents pointing at a
-- record that is no longer anywhere in the UI.
--
-- Detection stays advisory and the decision stays manual (PRD §11) — this
-- function is the decision being carried out, not the decision being made.
create function gabung_partner(p_dari int, p_ke int) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if (select role from akun where id = current_akun_id()) <> 'io_admin' then
    raise exception 'Only IO Admin merges partner records';
  end if;
  if p_dari = p_ke then
    raise exception 'A partner cannot be merged into itself';
  end if;
  if not exists (select 1 from partner where id = p_dari and is_active)
     or not exists (select 1 from partner where id = p_ke and is_active) then
    raise exception 'Both partners must exist and be active';
  end if;

  -- Documents the survivor is already on must not gain a duplicate join row,
  -- so those are dropped rather than re-pointed; the survivor is already there.
  delete from partner_pengusul pp
   where pp.id_partner = p_dari
     and exists (select 1 from partner_pengusul lain
                  where lain.id_partner = p_ke
                    and lain.id_proposal_dokumen = pp.id_proposal_dokumen);

  update partner_pengusul set id_partner = p_ke where id_partner = p_dari;
  update partner_contact  set id_partner = p_ke where id_partner = p_dari;
  update penandatangan_partner set id_partner = p_ke where id_partner = p_dari;

  -- The survivor keeps its own primary contact if it has one.
  update partner set id_partner_contact = coalesce(
      id_partner_contact,
      (select id from partner_contact where id_partner = p_ke order by id limit 1))
   where id = p_ke;

  update partner
     set id_merged_into = p_ke, is_active = false, id_partner_contact = null
   where id = p_dari;
end;
$fn$;

-- Advisory duplicate detection: name similarity or a shared homepage. It
-- suggests; a human decides (PRD §11).
create view v_partner_duplikat with (security_invoker = true) as
select a.id as id_a, a.nama as nama_a, b.id as id_b, b.nama as nama_b,
       round(similarity(a.nama, b.nama)::numeric, 2) as kemiripan,
       (a.homepage is not null and a.homepage = b.homepage) as homepage_sama
  from partner a join partner b on a.id < b.id
 where a.is_active and b.is_active
   and (similarity(a.nama, b.nama) > 0.55
        or (a.homepage is not null and a.homepage = b.homepage));

grant select on v_evaluasi_gap, v_pembaruan, v_peta_mitra, v_partner_duplikat
  to authenticated;
grant execute on function gabung_partner(int, int) to authenticated;
