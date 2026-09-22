-- Revisi V8 §11 follow-up: antrean_saya's "Unggah Revisi" row pointed the
-- submitter at a form only Admin may use as of 20260926000400. It now
-- surfaces to Admin instead.

create or replace function antrean_saya()
returns table (
  jenis             text,
  aksi              text,
  id_proposal       int,
  keterangan        text,
  status_sla        text,
  durasi_hari_kerja int,
  tautan            text,
  no_dokumen        text,
  nama_mitra        text
)
language sql stable security invoker set search_path = public as $fn$
  with saya as (
    select a.id as id_akun, a.id_jabatan, current_akun_is_io() as io
      from current_akun() a
  ),
  langkah as (
    select 'approval'::text as jenis, 'Setujui / Tindak Lanjuti'::text as aksi,
           d.id_proposal_dokumen as id_proposal,
           concat_ws(' · ', 'Tier ' || t.tier, d.pesan_disposisi) as keterangan,
           t.status_sla::text as status_sla, t.durasi_hari_kerja::int as durasi_hari_kerja,
           '/kerja-sama/' || d.id_proposal_dokumen as tautan
      from disposisi_target t
      join disposisi d on d.no = t.no_disposisi
      join saya on t.id_jabatan = saya.id_jabatan
     where t.status = 'pending_action' and d.jenis_disposisi = 'approval'

    union all
    select 'evaluasi_petra', 'Isi Evaluasi PETRA', dk.id_proposal_dokumen,
           'Evaluasi kerja sama sebelum pembaruan', null, null,
           '/kerja-sama/' || dk.id_proposal_dokumen || '/laporan?tab=pembaruan'
      from evaluasi e
      join dokumen_kerja_sama dk on dk.no = e.id_dokumen_kerjasama
      join saya on e.id_jabatan_pengusul = saya.id_jabatan
     where e.respondent_type = 'faculty' and e.status = 'pending'

    union all
    select 'draft', 'Lengkapi & Ajukan', p.id, 'Draf belum diajukan', null, null,
           '/buat?id=' || p.id
      from proposal_dokumen p
      join saya on p.id_akun_pembuat = saya.id_akun
     where p.status_proposal = 'Draft'

    union all
    select 'unggah_perpanjangan', 'Unggah Dokumen Perpanjangan', v.id_proposal,
           'Pembaruan dimulai — unggah dokumen perpanjangan', null, null,
           '/kerja-sama/' || v.id_proposal || '/laporan?tab=pembaruan'
      from v_pembaruan v
      cross join saya
     where v.gerbang = 'terbuka' and v.id_proposal_penerus is null
       and saya.id_jabatan in (select jabatan_pemilik_dokumen(v.no_dokumen_kerjasama))

    -- ------------------------------------------------------------ KUI only
    union all
    select 'disposisi_awal', 'Kirim Disposisi', p.id, 'Dokumen baru diajukan', null, null,
           '/kerja-sama/' || p.id
      from proposal_dokumen p
      join saya on saya.io
     where p.status_proposal = 'Diajukan'

    -- Only Admin uploads a revision (V8 §11) — the submitter no longer does.
    union all
    select distinct 'revisi', 'Unggah Revisi', p.id,
           'Approver meminta revisi dokumen', null::text, null::int,
           '/kerja-sama/' || p.id || '/laporan?tab=disposisi'
      from proposal_dokumen p
      join disposisi d on d.id_proposal_dokumen = p.id and d.jenis_disposisi = 'approval'
      join disposisi_target t on t.no_disposisi = d.no
      join saya on saya.io
     where p.status_proposal in ('Diproses','Disposisi - Tier 1','Disposisi - Tier 2',
                                 'Disposisi - Tier 3','Pending')
       and revisi_terbuka(t.no)

    union all
    select 'siap_ttd', 'Tandai Siap TTD', p.id,
           'Disetujui — cetak dan tandai siap tanda tangan', null, null,
           '/kerja-sama/' || p.id
      from proposal_dokumen p
      join saya on saya.io
     where p.status_proposal = 'Disetujui'
       and not exists (select 1 from dokumen_kerja_sama dk where dk.id_proposal_dokumen = p.id)

    union all
    select 'aktivasi', 'Aktivasi Dokumen', p.id,
           'Siap TTD — lengkapi data penandatanganan', null, null,
           '/kerja-sama/' || p.id || '/aktivasi'
      from proposal_dokumen p
      join saya on saya.io
     where p.status_proposal = 'Siap TTD'
       and not p.is_pencatatan_langsung
       and not exists (select 1 from dokumen_kerja_sama dk where dk.id_proposal_dokumen = p.id)

    union all
    select 'mulai_pembaruan', 'Mulai Proses Pembaruan', v.id_proposal,
           'PETRA dan mitra melanjutkan — mulai proses pembaruan', null, null,
           '/kerja-sama/' || v.id_proposal || '/laporan?tab=pembaruan'
      from v_pembaruan v
      join saya on saya.io
     where v.gerbang = 'siap' and v.id_proposal_penerus is null

    union all
    select 'putuskan', 'Putuskan Pembaruan', v.id_proposal,
           'Evaluasi PETRA dan mitra berbeda', null, null,
           '/kerja-sama/' || v.id_proposal || '/laporan?tab=pembaruan'
      from v_pembaruan v
      join saya on saya.io
     where v.gerbang = 'split' and v.id_proposal_penerus is null

    union all
    select 'tautan_mitra', 'Kirim Tautan Evaluasi Mitra', v.id_proposal,
           'Evaluasi mitra belum masuk', null, null,
           '/kerja-sama/' || v.id_proposal || '/laporan?tab=pembaruan'
      from v_pembaruan v
      join saya on saya.io
     where v.status_partner = 'pending'

    union all
    select 'minta_pembaruan', 'Kirim Disposisi Evaluasi', dk.id_proposal_dokumen,
           'Akan berakhir ' || coalesce(to_char(dk.tanggal_berakhir, 'DD-MM-YYYY'), ''),
           null, null,
           '/kerja-sama/' || dk.id_proposal_dokumen || '/laporan?tab=pembaruan'
      from dokumen_kerja_sama dk
      join saya on saya.io
     where dk.status = 'Akan Berakhir'
       and not exists (select 1 from disposisi d
                        where d.no_dokumen_kerjasama = dk.no
                          and d.jenis_disposisi = 'renewal_request')
  )
  select l.jenis, l.aksi, l.id_proposal, l.keterangan, l.status_sla,
         l.durasi_hari_kerja, l.tautan, vd.no_dokumen::text, vd.nama_mitra
    from langkah l
    left join v_daftar_dokumen vd on vd.id_proposal = l.id_proposal;
$fn$;

revoke execute on function antrean_saya() from public, anon;
grant execute on function antrean_saya() to authenticated;
