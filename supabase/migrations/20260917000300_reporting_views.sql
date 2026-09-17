-- Phase 2 — the reporting views behind the lists, the per-column filters and
-- the three Excel exports (PRD §8.3, §8.4).
--
-- The export button sits with the filters because it exports "what I am looking
-- at" (Design §4.5). The only way to keep that promise is for the list and the
-- export to read the SAME query — so they read the same view, and the export
-- route differs from the list page only in lacking a page limit.
--
-- security_invoker = true is load-bearing: without it a view runs as its owner
-- and quietly bypasses every RLS policy underneath. With it, RLS still decides
-- which rows each account sees, and the view is only a shape (EC-05, AR-02).

-- --------------------------------------------------------------------------
-- One row per document, flattened: proposal, partnership record and partners.
-- --------------------------------------------------------------------------
create view v_daftar_dokumen with (security_invoker = true) as
select
  p.id                                as id_proposal,
  dk.no                               as no_dokumen_kerjasama,
  dk.no_dokumen,
  p.jenis_kerjasama::text             as jenis_kerjasama,
  p.status_proposal,
  dk.status                           as status_dokumen,
  -- What a list shows in its Status column: the partnership record's status
  -- once one exists, the proposal's before that.
  coalesce(dk.status, p.status_proposal) as status_tampil,
  dk.alasan_arsip,
  p.status_sla,
  p.periode_kerjasama,
  p.sifat_periode_kerjasama,
  p.waktu_proposal_dokumen,
  p.waktu_disetujui,
  p.waktu_aktif,
  dk.tanggal_tanda_tangan,
  dk.tanggal_mulai,
  dk.tanggal_berakhir,
  -- Countdown for the Akan Berakhir tab. NULL for Auto Renewed, which has no
  -- end date and never expires (BR-11).
  case when dk.tanggal_berakhir is not null
       then dk.tanggal_berakhir - current_date end as sisa_hari,
  dk.folder_kui,
  dk.no_berkas_dikti,
  p.id_dokumen_sebelumnya,
  -- Its presence IS the renewal flag; there is no second boolean to drift.
  (p.id_dokumen_sebelumnya is not null) as is_perpanjangan,
  mitra.nama_mitra,
  -- Domestic/international from the boolean, never from a country name
  -- (BR-16, DR-07).
  mitra.is_international,
  mitra.negara,
  pengusul_unit.unit_pengusul,
  p.id_akun_pembuat
from proposal_dokumen p
left join dokumen_kerja_sama dk on dk.id_proposal_dokumen = p.id
left join lateral (
  select string_agg(pr.nama, ', ' order by pp.is_lead desc, pr.nama) as nama_mitra,
         bool_or(pr.is_international)                                as is_international,
         string_agg(distinct n.nama, ', ')                           as negara
    from partner_pengusul pp
    join partner pr on pr.id = pp.id_partner
    join negara n on n.id = pr.id_negara
   where pp.id_proposal_dokumen = p.id
) mitra on true
left join lateral (
  select string_agg(u.nama, ', ' order by u.nama) as unit_pengusul
    from pengusul pg
    join jabatan j on j.id = pg.id_jabatan
    join unit u on u.id = j.id_unit
   where pg.id_proposal_dokumen = p.id
) pengusul_unit on true;

comment on view v_daftar_dokumen is
  'The Cari Kerja Sama tabs, the per-column filters and two of the three Excel
   exports all read this. security_invoker keeps RLS in force.';

-- --------------------------------------------------------------------------
-- Export 2 — the SLA record per document (PRD §8.4).
-- --------------------------------------------------------------------------
-- One row per approver per round, because SLA is per target and never per tier
-- (BR-17). Resolved durations are the frozen ones (DR-03); an open target
-- carries the live figure the sweep last wrote.
create view v_sla_dokumen with (security_invoker = true) as
select
  d.id_proposal_dokumen              as id_proposal,
  dk.no_dokumen,
  mitra.nama_mitra,
  d.round_ke,
  d.jenis_disposisi,
  dt.no                              as no_target,
  dt.tier,
  j.nama                             as jabatan,
  dt.status,
  dt.waktu_unlock,
  dt.waktu_resolusi,
  dt.durasi_hari_kerja,
  dt.status_sla,
  dt.batas_waktu_sla
from disposisi_target dt
join disposisi d on d.no = dt.no_disposisi
join jabatan j on j.id = dt.id_jabatan
left join dokumen_kerja_sama dk on dk.id_proposal_dokumen = d.id_proposal_dokumen
left join lateral (
  select string_agg(pr.nama, ', ' order by pp.is_lead desc, pr.nama) as nama_mitra
    from partner_pengusul pp
    join partner pr on pr.id = pp.id_partner
   where pp.id_proposal_dokumen = d.id_proposal_dokumen
) mitra on true;

comment on view v_sla_dokumen is
  'Export 2: the approval-time record, one row per approver per round (BR-17).';

grant select on v_daftar_dokumen, v_sla_dokumen to authenticated;
