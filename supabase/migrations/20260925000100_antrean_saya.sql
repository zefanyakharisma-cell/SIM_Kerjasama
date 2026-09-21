-- Antrean Saya lists every step waiting on the signed-in account, not only
-- approvals (client revision, 2026-09-21).
--
-- One function, one round trip. SECURITY INVOKER on purpose: RLS still decides
-- which rows each branch can see, so the queue can never surface a document the
-- account could not open anyway. KUI-only steps are additionally gated on
-- current_akun_is_io().

create function antrean_saya()
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
    -- An approval target routed to my position (BR-24: renewal requests are
    -- tasks, not gates, and are covered by the evaluation row below).
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
    -- My PETRA evaluation before a renewal (Revisi V7 §5).
    select 'evaluasi_petra', 'Isi Evaluasi PETRA', dk.id_proposal_dokumen,
           'Evaluasi kerja sama sebelum pembaruan', null, null,
           '/kerja-sama/' || dk.id_proposal_dokumen || '/laporan?tab=pembaruan'
      from evaluasi e
      join dokumen_kerja_sama dk on dk.no = e.id_dokumen_kerjasama
      join saya on e.id_jabatan_pengusul = saya.id_jabatan
     where e.respondent_type = 'faculty' and e.status = 'pending'

    union all
    -- An approver asked for a revision of a proposal I submitted.
    select distinct 'revisi', 'Unggah Revisi', p.id,
           'Approver meminta revisi dokumen', null::text, null::int,
           '/kerja-sama/' || p.id || '/laporan?tab=disposisi'
      from proposal_dokumen p
      join disposisi d on d.id_proposal_dokumen = p.id and d.jenis_disposisi = 'approval'
      join disposisi_target t on t.no_disposisi = d.no
      cross join saya
     where p.status_proposal in ('Diproses','Disposisi - Tier 1','Disposisi - Tier 2',
                                 'Disposisi - Tier 3','Pending')
       and (p.id_akun_pembuat = saya.id_akun
            or exists (select 1 from pengusul pg
                        where pg.id_proposal_dokumen = p.id
                          and pg.id_jabatan = saya.id_jabatan))
       and revisi_terbuka(t.no)

    union all
    -- My own draft, not yet submitted.
    select 'draft', 'Lengkapi & Ajukan', p.id, 'Draf belum diajukan', null, null,
           '/buat?id=' || p.id
      from proposal_dokumen p
      join saya on p.id_akun_pembuat = saya.id_akun
     where p.status_proposal = 'Draft'

    union all
    -- The evaluation gate opened on a document my position owns (PRD §9.6).
    select 'unggah_perpanjangan', 'Unggah Dokumen Perpanjangan', v.id_proposal,
           'Evaluasi selesai — pembaruan dapat dimulai', null, null,
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

    union all
    select 'aktivasi', 'Aktivasi Dokumen', p.id,
           'Disetujui — lengkapi data penandatanganan', null, null,
           '/kerja-sama/' || p.id || '/aktivasi'
      from proposal_dokumen p
      join saya on saya.io
     where p.status_proposal = 'Disetujui'
       and not p.is_pencatatan_langsung
       and not exists (select 1 from dokumen_kerja_sama dk where dk.id_proposal_dokumen = p.id)

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
