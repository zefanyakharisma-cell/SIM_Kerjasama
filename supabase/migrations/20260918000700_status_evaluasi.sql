-- Two outcomes of the document lifecycle that were implicit until now:
--
--   * "Disposisi Evaluasi" — a still-current document whose renewal request has
--     been sent. DERIVED in v_daftar_dokumen, never stored: the expiry sweep owns
--     dokumen_kerja_sama.status by date, and a stored evaluation status would
--     either be overwritten by it or block it.
--   * "Tidak Diperpanjang" — the evaluation gate closed on terminate. The
--     agreement stays legally in force until tanggal_berakhir, so it is archived
--     at expiry like any other, only with its own reason ('not_renewed').

-- ============================================================================
-- 1. The new archive reason
-- ============================================================================
alter table dokumen_kerja_sama drop constraint dokumen_kerja_sama_alasan_arsip_check;
alter table dokumen_kerja_sama add constraint dokumen_kerja_sama_alasan_arsip_check
  check (alasan_arsip in ('rejected','expired_without_renewal','not_renewed',
                          'superseded_by_renewal','terminated_early'));

-- ============================================================================
-- 2. sapu_kedaluarsa — archive with 'not_renewed' when the gate said terminate.
--    Only the archival UPDATE changes; same signature, so the revoke stands.
-- ============================================================================
create or replace function sapu_kedaluarsa()
returns table (ditandai int, diarsipkan int, diingatkan int)
language plpgsql security definer set search_path = public as $fn$
declare
  d record;
  v_ditandai int := 0;
  v_diarsipkan int := 0;
  v_diingatkan int := 0;
  v_bulan int := pengaturan('expiring_soon_months','6')::int;
  v_sisa_hari int;
  v_jeda int;
  v_io int;
begin
  update dokumen_kerja_sama
     set status = 'Akan Berakhir'
   where status = 'Aktif'
     and tanggal_berakhir is not null
     and tanggal_berakhir <= (current_date + (v_bulan || ' months')::interval)
     and tanggal_berakhir >= current_date;
  get diagnostics v_ditandai = row_count;

  -- Past the end date with no completed renewal. The reason says whether the
  -- evaluation decided against renewing or nobody decided at all (BR-10).
  update dokumen_kerja_sama
     set status = 'Diarsipkan',
         alasan_arsip = case when status_gerbang_pembaruan(no) = 'terminate'
                             then 'not_renewed' else 'expired_without_renewal' end
   where status in ('Aktif','Akan Berakhir')
     and tanggal_berakhir is not null
     and tanggal_berakhir < current_date;
  get diagnostics v_diarsipkan = row_count;

  for d in
    select dk.no, dk.tanggal_berakhir, p.id as id_proposal
      from dokumen_kerja_sama dk
      join proposal_dokumen p on p.id = dk.id_proposal_dokumen
     where dk.status = 'Akan Berakhir' and dk.tanggal_berakhir is not null
  loop
    v_sisa_hari := d.tanggal_berakhir - current_date;
    v_jeda := case when v_sisa_hari <= 60 then 7 else 30 end;

    if exists (select 1 from disposisi
                where no_dokumen_kerjasama = d.no
                  and jenis_disposisi = 'renewal_request') then
      continue;
    end if;

    if exists (
      select 1 from notifikasi
       where no_dokumen_kerjasama = d.no
         and jenis_notifikasi = 'expiring_soon'
         and waktu_kirim > now() - (v_jeda || ' days')::interval
    ) then
      continue;
    end if;

    for v_io in select * from jabatan_io() loop
      insert into notifikasi (jenis_notifikasi, id_jabatan_penerima,
                              no_dokumen_kerjasama, id_proposal_dokumen, isi, status)
      values ('expiring_soon', v_io, d.no, d.id_proposal,
              format('Dokumen berakhir pada %s (%s hari lagi).',
                     d.tanggal_berakhir, v_sisa_hari),
              'pending');
      v_diingatkan := v_diingatkan + 1;
    end loop;
  end loop;

  return query select v_ditandai, v_diarsipkan, v_diingatkan;
end;
$fn$;

-- ============================================================================
-- 3. v_daftar_dokumen — status_tampil surfaces "Disposisi Evaluasi".
--    Only that expression changes; the cast keeps the column type identical so
--    create-or-replace is allowed. status_dokumen still carries the raw value,
--    so the Akan Berakhir tab and chart defaults are unaffected.
-- ============================================================================
create or replace view v_daftar_dokumen with (security_invoker = true) as
select
  p.id                                as id_proposal,
  dk.no                               as no_dokumen_kerjasama,
  dk.no_dokumen,
  p.jenis_kerjasama::text             as jenis_kerjasama,
  p.status_proposal,
  dk.status                           as status_dokumen,
  (case
     when dk.status in ('Aktif','Akan Berakhir')
      and exists (select 1 from disposisi d
                   where d.no_dokumen_kerjasama = dk.no
                     and d.jenis_disposisi = 'renewal_request')
     then 'Disposisi Evaluasi'
     else coalesce(dk.status, p.status_proposal)
   end)::varchar(30)                  as status_tampil,
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
  case when dk.tanggal_berakhir is not null
       then dk.tanggal_berakhir - current_date end as sisa_hari,
  dk.folder_kui,
  dk.no_berkas_dikti,
  dk.upload_dokumen,
  dk.link_gdrive,
  p.id_dokumen_sebelumnya,
  (p.id_dokumen_sebelumnya is not null) as is_perpanjangan,
  mitra.nama_mitra,
  mitra.is_international,
  mitra.negara,
  pengusul_unit.unit_pengusul,
  pengusul_unit.jabatan_pengusul,
  agenda_agg.agenda,
  lingkup_agg.lingkup,
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
  select string_agg(distinct u.nama, ', ' order by u.nama) as unit_pengusul,
         string_agg(distinct j.nama, ', ' order by j.nama) as jabatan_pengusul
    from pengusul pg
    join jabatan j on j.id = pg.id_jabatan
    join unit u on u.id = j.id_unit
   where pg.id_proposal_dokumen = p.id
) pengusul_unit on true
left join lateral (
  select string_agg(distinct ag.nama, ', ' order by ag.nama) as agenda
    from proposal_dokumen_agenda pda
    join agenda ag on ag.id = pda.id_agenda
   where pda.id_proposal_dokumen = p.id
) agenda_agg on true
left join lateral (
  select string_agg(distinct u.nama, ', ' order by u.nama) as lingkup
    from proposal_dokumen_unit pdu
    join unit u on u.id = pdu.id_unit
   where pdu.id_proposal_dokumen = p.id
) lingkup_agg on true;
