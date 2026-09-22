-- Revisi V8 §16 — the gate no longer opens itself the moment both
-- evaluations recommend continuing. Evaluation-agreement is still exactly
-- what status_gerbang_pembaruan(no) computes (unchanged) — that raw signal
-- is now called "siap" in the UI (v_pembaruan.gerbang) until Admin explicitly
-- clicks Mulai Proses Pembaruan, which is the point the unit pengusul is
-- actually notified and allowed to upload.

alter table dokumen_kerja_sama add column pembaruan_dimulai_at timestamptz;

-- Storage upload additionally requires the explicit start (V8 §16), not just
-- evaluation agreement.
create or replace function boleh_unggah_perpanjangan(p_id_proposal int) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from dokumen_kerja_sama dk
     where dk.id_proposal_dokumen = p_id_proposal
       and status_gerbang_pembaruan(dk.no) = 'terbuka'
       and dk.pembaruan_dimulai_at is not null
       and (current_akun_is_io()
            or exists (select 1 from pengusul pg join jabatan j on j.id = pg.id_jabatan
                        where pg.id_proposal_dokumen = p_id_proposal
                          and akun_milik_unit(j.id_unit)))
  );
$fn$;

-- v_pembaruan.gerbang: "terbuka" only once Admin has started the process;
-- evaluation-agreement-but-not-started reads as "siap" instead.
create or replace view v_pembaruan with (security_invoker = true) as
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
  dk.pembaruan_dimulai_at,
  (case when status_gerbang_pembaruan(dk.no) = 'terbuka' and dk.pembaruan_dimulai_at is null
        then 'siap'
        else status_gerbang_pembaruan(dk.no) end) as gerbang,
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
   where e.id_dokumen_kerjasama = dk.no
) ev on true
left join lateral (
  select string_agg(pr.nama, ', ' order by pr.nama) as nama_mitra
    from partner_pengusul pp
    join partner pr on pr.id = pp.id_partner
   where pp.id_proposal_dokumen = dk.id_proposal_dokumen
) mitra on true
left join lateral (
  select string_agg(distinct u.nama, ', ' order by u.nama) as unit_pengusul
    from pengusul pg
    join jabatan j on j.id = pg.id_jabatan
    join unit u on u.id = j.id_unit
   where pg.id_proposal_dokumen = dk.id_proposal_dokumen
) unitp on true
left join proposal_dokumen penerus on penerus.id_dokumen_sebelumnya = dk.id_proposal_dokumen;

grant select on v_pembaruan to authenticated;

comment on view v_pembaruan is
  'The renewal queue: both evaluation states, the four-outcome gate ("siap"
   once both agree, "terbuka" only after Admin starts the process — V8 §16),
   and the renewal-request SLA on its own 30/60/90 day scale (BR-32).';

-- The "terbuka" auto-notify moves to mulai_proses_pembaruan below; once both
-- evaluations agree, Admin is told it is ready instead of the unit pengusul
-- being notified immediately.
create or replace function umumkan_gerbang(p_no_dokumen int) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_gerbang text := status_gerbang_pembaruan(p_no_dokumen);
  v_id_proposal int;
  v_jabatan int;
begin
  select id_proposal_dokumen into v_id_proposal
    from dokumen_kerja_sama where no = p_no_dokumen;

  if v_gerbang = 'terbuka' then
    for v_jabatan in select * from jabatan_io() loop
      perform catat_notifikasi('renewal_ready', v_jabatan, v_id_proposal, p_no_dokumen, null,
        'PETRA dan mitra melanjutkan. Klik Mulai Proses Pembaruan untuk memberi tahu unit pengusul.');
    end loop;

  elsif v_gerbang = 'split' then
    for v_jabatan in select * from jabatan_io() loop
      perform catat_notifikasi('split_decision', v_jabatan, v_id_proposal, p_no_dokumen, null,
        'PETRA dan mitra berbeda — KUI memutuskan: override atau arsipkan.');
    end loop;

  elsif v_gerbang = 'terminate' then
    for v_jabatan in select * from jabatan_io() loop
      perform catat_notifikasi('renewal_terminated', v_jabatan, v_id_proposal, p_no_dokumen, null,
        'PETRA dan mitra tidak melanjutkan — diarsipkan pada tanggal berakhir.');
    end loop;
  end if;
end;
$fn$;

revoke execute on function umumkan_gerbang(int) from public, anon, authenticated;

-- Admin-only. Sends the signed PDF and the final approved draft to the unit
-- pengusul's notifikasi and Antrean Saya, marking the start of Pembaruan
-- (V8 §16). The unit then uploads the new draft through the existing
-- buat_proposal_perpanjangan flow, unchanged.
create function mulai_proses_pembaruan(p_no_dokumen int) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_id_proposal int;
  v_jabatan int;
begin
  if not current_akun_is_io() then
    raise exception 'Only Admin starts Proses Pembaruan';
  end if;

  select id_proposal_dokumen into v_id_proposal
    from dokumen_kerja_sama where no = p_no_dokumen;

  if v_id_proposal is null then
    raise exception 'Document % does not exist', p_no_dokumen;
  end if;

  if status_gerbang_pembaruan(p_no_dokumen) <> 'terbuka' then
    raise exception 'Both evaluations must recommend continuing first';
  end if;

  if exists (select 1 from dokumen_kerja_sama
              where no = p_no_dokumen and pembaruan_dimulai_at is not null) then
    raise exception 'Proses Pembaruan has already started for document %', p_no_dokumen;
  end if;

  update dokumen_kerja_sama set pembaruan_dimulai_at = now() where no = p_no_dokumen;

  for v_jabatan in
    select * from jabatan_pemilik_dokumen(p_no_dokumen)
    union
    select jk.id from pengusul pg
      join jabatan jp on jp.id = pg.id_jabatan
      join jabatan jk on jk.id_unit = unit_puncak(jp.id_unit) and jk.kepala_unit
     where pg.id_proposal_dokumen = v_id_proposal
    union
    select * from jabatan_kepala_lingkup(p_no_dokumen)
  loop
    perform catat_notifikasi('renewal_open', v_jabatan, v_id_proposal, p_no_dokumen, null,
      'Pembaruan dimulai. Unggah dokumen perpanjangan di tab Pembaruan; PDF dokumen dan berkas revisi terakhir tersedia di sana.');
  end loop;
end;
$fn$;

grant execute on function mulai_proses_pembaruan(int) to authenticated;

-- ---------------------------------------------------------------------------
-- antrean_saya: two bugs surfaced by this pass —
-- 1. 'aktivasi' still gated on status_proposal = 'Disetujui'; Siap TTD (V8
--    §2) split that into two separate steps, so this becomes two rows.
-- 2. 'unggah_perpanjangan' keyed on gerbang = 'terbuka', which is now correct
--    unchanged (that value only appears once Admin has started it) — but
--    Admin needs their own new row for "siap" (V8 §16).
-- ---------------------------------------------------------------------------
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
