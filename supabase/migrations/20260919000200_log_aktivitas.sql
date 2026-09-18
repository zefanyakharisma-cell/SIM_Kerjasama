-- Revisi V5 §3 — Activity Log, one row per event in REA terms:
--   Resource: the document (number, partner, type)
--   Event:    what was done (aksi, catatan, waktu)
--   Agents:   who did it (dari) and to whom it went (kepada)
--
-- A view over the append-only riwayat_approval, not a new log: every workflow
-- step already lands there (see 20260918000300_riwayat_pembaruan.sql for the
-- renewal steps). Positions, never people (DR-06). security_invoker, so a
-- reader only sees events on documents RLS already lets them see.

create view v_log_aktivitas with (security_invoker = true) as
with ev as (
  select r.*,
         (r.tanggal + r.waktu) as waktu_lokal,
         -- riwayat stores the writer's local date/time; disposisi a timestamptz.
         -- Same session clock, so this lines the two up. The minute of slack
         -- covers a row written a moment after its disposisi.
         ((r.tanggal + r.waktu) at time zone current_setting('TimeZone'))
           + interval '1 minute' as batas
    from riwayat_approval r
)
select
  e.id,
  e.waktu_lokal                                   as waktu,
  e.aksi,
  e.catatan,
  p.id                                            as id_proposal,
  dk.no_dokumen,
  p.jenis_kerjasama::text                         as jenis_kerjasama,
  mitra.nama_mitra,
  coalesce(ja.nama,
           case when e.aksi = 'evaluation_submitted' then 'Mitra' else 'Sistem' end
  )::text                                         as dari,
  (case
     when e.aksi in ('submitted', 'evaluation_submitted')
       then 'Kantor Kerja Sama (IO)'
     when e.aksi in ('disposition_added', 'disposition_removed')
       then jt.nama
     when e.aksi = 'revision_requested'
       then jp.nama
     when e.aksi = 'dispositioned' then (
       select string_agg(j.nama, ', ' order by t.tier, j.nama)
         from disposisi_target t join jabatan j on j.id = t.id_jabatan
        where t.no_disposisi = (
          select d.no from disposisi d
           where d.id_proposal_dokumen = p.id and d.jenis_disposisi = 'approval'
             and d.waktu_disposisi <= e.batas
           order by d.waktu_disposisi desc, d.no desc limit 1))
     when e.aksi = 'renewal_requested' then (
       select string_agg(j.nama, ', ' order by j.nama) || ', Mitra'
         from disposisi_target t join jabatan j on j.id = t.id_jabatan
        where t.no_disposisi = (
          select d.no from disposisi d
           where d.no_dokumen_kerjasama = dk.no and d.jenis_disposisi = 'renewal_request'
             and d.waktu_disposisi <= e.batas
           order by d.waktu_disposisi desc, d.no desc limit 1))
   end)::text                                     as kepada,
  -- One searchable string for the filter box.
  concat_ws(' ', '#' || p.id, dk.no_dokumen, mitra.nama_mitra) as cari
from ev e
left join proposal_dokumen p   on p.id = e.id_proposal_dokumen
left join dokumen_kerja_sama dk on dk.id_proposal_dokumen = p.id
left join akun aa              on aa.id = e.id_akun
left join jabatan ja           on ja.id = aa.id_jabatan
left join disposisi_target dt  on dt.no = e.id_disposisi_target
left join jabatan jt           on jt.id = dt.id_jabatan
left join akun ap              on ap.id = p.id_akun_pembuat
left join jabatan jp           on jp.id = ap.id_jabatan
left join lateral (
  select string_agg(pr.nama, ', ' order by pp.is_lead desc, pr.nama) as nama_mitra
    from partner_pengusul pp join partner pr on pr.id = pp.id_partner
   where pp.id_proposal_dokumen = p.id
) mitra on true;

comment on view v_log_aktivitas is
  'Dashboard Activity Log: riwayat_approval with the document, the acting
   position (dari) and the receiving position(s) (kepada) resolved.';

grant select on v_log_aktivitas to authenticated;
