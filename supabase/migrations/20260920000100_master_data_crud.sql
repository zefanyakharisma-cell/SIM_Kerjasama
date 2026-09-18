-- Revisi V6 §2/§4.
--
-- §2: Master Data gets full CRUD. A value still referenced by a proposal
-- cannot be deleted (FK), so it is retired instead — the same is_active flag
-- the other lookup lists already carry (BR-23).
--
-- §4: the Unduh Laporan export needs, per document, the partner address and
-- category, the bidang/unit sets (one Excel column each) and the signers and
-- contacts flattened into one cell apiece. v_laporan_dokumen is
-- v_daftar_dokumen plus those, so the list's own filter/sort code applies to
-- it unchanged and the export still matches what is on screen.

alter table jabatan          add column is_active boolean not null default true;
alter table bidang_kerjasama add column is_active boolean not null default true;
alter table jenis_mitra      add column is_active boolean not null default true;
alter table negara           add column is_active boolean not null default true;

create view v_laporan_dokumen with (security_invoker = true) as
select
  d.*,
  mitra.alamat,
  mitra.jenis_mitra,
  mitra.kontak_mitra,
  coalesce(bidang.ids, '{}') as bidang_ids,
  coalesce(lingkup.ids, '{}') as unit_ids,
  ttd_petra.penandatangan_petra,
  ttd_mitra.penandatangan_mitra,
  kontak_pengusul.kontak_pengusul
from v_daftar_dokumen d
left join lateral (
  select
    string_agg(concat_ws(', ', nullif(pr.alamat, ''), nullif(pr.kota, '')), '; '
               order by pp.is_lead desc, pr.nama)                        as alamat,
    string_agg(distinct jm.nama, ', ')                                   as jenis_mitra,
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
  'Unduh Laporan (Revisi V6 §4): v_daftar_dokumen plus the flattened partner, signer and contact cells.';

grant select on v_laporan_dokumen to authenticated;
