-- The four Cari Kerja Sama downloads (Laporan/Data Kerja Sama Aktif, Laporan
-- Proses Kerja Sama, Data SLA), built on the Table_Database_Kerjasama and
-- Table_Database_SLA templates.
--
-- 1. v_laporan_dokumen is recreated rather than replaced: it was created as
--    `d.*` over v_daftar_dokumen, and Postgres froze that column list, so the
--    columns v_daftar_dokumen gained later (jumlah_lingkup,
--    is_pencatatan_langsung) never reached it. It also gains
--    informasi_tambahan and the partners' jenis_mitra ids, which the template's
--    Jenis Mitra checklist (split Luar/Dalam Negeri) needs.
-- 2. v_proses_dokumen: one row per submitted proposal with the approval
--    milestones the SLA template asks for. Tier dates are derived — there is
--    no per-document tier column — from the latest approval round.
-- 3. v_sla_dokumen gains the document's status, type and disposition time.
--
-- All three stay security_invoker, so RLS decides the rows as on screen.

drop view if exists v_laporan_dokumen;

create view v_laporan_dokumen with (security_invoker = true) as
select
  d.*,
  p.informasi_tambahan,
  mitra.alamat,
  mitra.jenis_mitra,
  coalesce(mitra.jenis_mitra_ids, '{}') as jenis_mitra_ids,
  mitra.kontak_mitra,
  coalesce(bidang.ids, '{}')  as bidang_ids,
  coalesce(lingkup.ids, '{}') as unit_ids,
  ttd_petra.penandatangan_petra,
  ttd_mitra.penandatangan_mitra,
  kontak_pengusul.kontak_pengusul
from v_daftar_dokumen d
join proposal_dokumen p on p.id = d.id_proposal
left join lateral (
  select
    string_agg(concat_ws(', ', nullif(pr.alamat, ''), nullif(pr.kota, '')), '; '
               order by pp.is_lead desc, pr.nama)                        as alamat,
    string_agg(distinct jm.nama, ', ')                                   as jenis_mitra,
    array_agg(distinct pr.id_jenis_mitra)
      filter (where pr.id_jenis_mitra is not null)                       as jenis_mitra_ids,
    string_agg(
      case when pc.id is not null then
        concat_ws(' · ', pc.nama, nullif(pc.jabatan, ''), nullif(pc.email, ''),
                  nullif(pc.no_telp, ''))
        || ' (' || pr.nama || ')'
      end, '; ' order by pp.is_lead desc, pr.nama)                       as kontak_mitra
    from partner_pengusul pp
    join partner pr on pr.id = pp.id_partner
    left join jenis_mitra jm on jm.id = pr.id_jenis_mitra
    left join partner_contact pc on pc.id = pr.id_partner_contact
   where pp.id_proposal_dokumen = d.id_proposal
) mitra on true
left join lateral (
  select array_agg(b.id_bidang_kerjasama) as ids
    from proposal_dokumen_bidang b
   where b.id_proposal_dokumen = d.id_proposal
) bidang on true
left join lateral (
  select array_agg(u.id_unit) as ids
    from proposal_dokumen_unit u
   where u.id_proposal_dokumen = d.id_proposal
) lingkup on true
left join lateral (
  select string_agg(concat_ws(' — ', t.nama, nullif(t.jabatan, '')), '; ') as penandatangan_petra
    from penandatangan_petra t
   where t.no_dokumen_kerjasama = d.no_dokumen_kerjasama
) ttd_petra on true
left join lateral (
  select string_agg(concat_ws(' — ', t.nama, nullif(t.jabatan, '')) || ' (' || pr.nama || ')', '; ')
           as penandatangan_mitra
    from penandatangan_partner t
    join partner pr on pr.id = t.id_partner
   where t.no_dokumen_kerjasama = d.no_dokumen_kerjasama
) ttd_mitra on true
left join lateral (
  select string_agg(
           concat_ws(' · ', j.nama, u.nama, pg.nama, nullif(pg.email, ''), nullif(pg.no_hp, '')),
           '; ') as kontak_pengusul
    from pengusul ps
    join jabatan j on j.id = ps.id_jabatan
    join unit u on u.id = j.id_unit
    left join pegawai pg on pg.id = j.id_pegawai
   where ps.id_proposal_dokumen = d.id_proposal
) kontak_pengusul on true;

comment on view v_laporan_dokumen is
  'Laporan/Data Kerja Sama Aktif: v_daftar_dokumen plus the flattened partner, signer and contact cells.';

grant select on v_laporan_dokumen to authenticated;

-- --------------------------------------------------------------------------
-- Laporan Proses Kerja Sama (Table_Database_SLA)
-- --------------------------------------------------------------------------
-- The latest approval round is the one that led to the document's current
-- state; a rejected round followed by a reopen must not leak its dates. A tier
-- counts as approved only when every live (non-removed) target in it approved,
-- and its date is when the last of them did. Directly recorded documents never
-- went through approval, so they are left out.
create view v_proses_dokumen with (security_invoker = true) as
select
  d.id_proposal,
  d.no_dokumen,
  d.jenis_kerjasama,
  d.nama_mitra,
  d.negara,
  d.agenda,
  d.status_proposal,
  d.status_dokumen,
  d.status_tampil,
  d.unit_pengusul,
  -- The rest are here so the list's own filter and sort code applies as-is.
  d.jabatan_pengusul,
  d.lingkup,
  d.sifat_periode_kerjasama,
  d.tanggal_mulai,
  d.tanggal_berakhir,
  d.sisa_hari,
  d.waktu_proposal_dokumen,
  ronde.round_ke,
  ronde.waktu_disposisi,
  ronde.tier_1,
  ronde.tier_2,
  ronde.tier_3,
  ronde.waktu_ditolak,
  d.waktu_aktif,
  hari_kerja_terpakai(
    d.waktu_proposal_dokumen,
    coalesce(d.waktu_aktif,
             case when d.status_proposal = 'Ditolak' then ronde.waktu_ditolak end,
             now()),
    d.id_proposal
  ) as total_hari_kerja
from v_daftar_dokumen d
left join lateral (
  select
    r.round_ke,
    min(ds.waktu_disposisi) as waktu_disposisi,
    max(dt.waktu_resolusi) filter (where dt.status = 'rejected') as waktu_ditolak,
    case when bool_and(dt.status = 'approved') filter (where dt.tier = 1 and dt.status <> 'removed')
         then max(dt.waktu_resolusi) filter (where dt.tier = 1 and dt.status = 'approved') end as tier_1,
    case when bool_and(dt.status = 'approved') filter (where dt.tier = 2 and dt.status <> 'removed')
         then max(dt.waktu_resolusi) filter (where dt.tier = 2 and dt.status = 'approved') end as tier_2,
    case when bool_and(dt.status = 'approved') filter (where dt.tier = 3 and dt.status <> 'removed')
         then max(dt.waktu_resolusi) filter (where dt.tier = 3 and dt.status = 'approved') end as tier_3
    from (
      select max(x.round_ke) as round_ke
        from disposisi x
       where x.id_proposal_dokumen = d.id_proposal
         and x.jenis_disposisi = 'approval'
    ) r
    join disposisi ds on ds.id_proposal_dokumen = d.id_proposal
                     and ds.jenis_disposisi = 'approval'
                     and ds.round_ke = r.round_ke
    left join disposisi_target dt on dt.no_disposisi = ds.no
   group by r.round_ke
) ronde on true
where d.status_proposal <> 'Draft'
  and not coalesce(d.is_pencatatan_langsung, false);

comment on view v_proses_dokumen is
  'Laporan Proses Kerja Sama: one row per submitted proposal with its approval milestones and total business days.';

grant select on v_proses_dokumen to authenticated;

-- --------------------------------------------------------------------------
-- Data SLA: the approval-time record, one row per approver per round (BR-17)
-- --------------------------------------------------------------------------
drop view if exists v_sla_dokumen;

create view v_sla_dokumen with (security_invoker = true) as
select
  coalesce(d.id_proposal_dokumen, dk.id_proposal_dokumen) as id_proposal,
  dk.no_dokumen,
  p.jenis_kerjasama::text            as jenis_kerjasama,
  p.status_proposal,
  mitra.nama_mitra,
  d.round_ke,
  d.jenis_disposisi,
  d.waktu_disposisi,
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
-- An approval round names its proposal; a renewal request (Disposisi
-- Evaluasi) names the live document instead.
left join dokumen_kerja_sama dk
       on case when d.no_dokumen_kerjasama is not null
               then dk.no = d.no_dokumen_kerjasama
               else dk.id_proposal_dokumen = d.id_proposal_dokumen end
left join proposal_dokumen p on p.id = coalesce(d.id_proposal_dokumen, dk.id_proposal_dokumen)
left join lateral (
  select string_agg(pr.nama, ', ' order by pp.is_lead desc, pr.nama) as nama_mitra
    from partner_pengusul pp
    join partner pr on pr.id = pp.id_partner
   where pp.id_proposal_dokumen = p.id
) mitra on true;

comment on view v_sla_dokumen is
  'Data SLA: the approval-time record, one row per approver per round (BR-17).';

grant select on v_sla_dokumen to authenticated;
