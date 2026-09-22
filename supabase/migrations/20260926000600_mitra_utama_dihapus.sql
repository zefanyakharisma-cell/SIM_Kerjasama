-- Revisi V8 §8 — no more "Mitra Utama": every partner on a document is
-- equally important. The app stops ever setting partner_pengusul.is_lead to
-- true; this migration fixes the handful of functions that picked "the"
-- partner by ordering on is_lead, so they still pick one deterministically
-- (by id) instead of silently degrading once every row is false.
--
-- The is_lead column and its partial unique index are left in place
-- (soft-deprecated) rather than dropped, for a clean rollback — they are
-- simply never read for a "which one is lead" decision again.

-- 1. The renewal's partner evaluation used to go to "the lead partner"; now
--    the first partner joined, same rule aktivasi_dokumen already uses.
create or replace function kirim_permintaan_pembaruan(p_no_dokumen int, p_pesan text default null)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_no_disposisi int;
  v_jabatan int;
  v_ada boolean := false;
  v_id_kontak int;
begin
  if not current_akun_is_io() then
    raise exception 'Only IO dispositions a renewal request (PRD §9.1)';
  end if;

  if exists (select 1 from disposisi
              where no_dokumen_kerjasama = p_no_dokumen
                and jenis_disposisi = 'renewal_request') then
    raise exception 'Document % already has a renewal request', p_no_dokumen;
  end if;

  insert into disposisi (no_dokumen_kerjasama, jenis_disposisi, round_ke,
                         pesan_disposisi, id_akun_pengirim)
  values (p_no_dokumen, 'renewal_request', 1,
          coalesce(p_pesan, 'Mohon ditangani pembaruan dokumen ini.'),
          current_akun_id())
  returning no into v_no_disposisi;

  for v_jabatan in select * from jabatan_kepala_lingkup(p_no_dokumen) loop
    insert into disposisi_target (no_disposisi, id_jabatan, tier, status,
                                  waktu_unlock, batas_waktu_sla, status_sla)
    values (v_no_disposisi, v_jabatan, null, 'pending_action', now(),
            now() + (pengaturan('renewal_red_days','90') || ' days')::interval,
            'normal');

    insert into evaluasi (id_dokumen_kerjasama, respondent_type, status, id_jabatan_pengusul)
    values (p_no_dokumen, 'faculty', 'pending', v_jabatan);
    v_ada := true;
  end loop;

  if not v_ada then
    raise exception 'Document % has no proposing position to route the renewal to', p_no_dokumen;
  end if;

  -- One partner evaluation. No partner is more "the" partner than another
  -- (V8 §8) — the first one joined is picked, deterministically.
  select pc.id into v_id_kontak
    from dokumen_kerja_sama dk
    join partner_pengusul pp on pp.id_proposal_dokumen = dk.id_proposal_dokumen
    join partner pr on pr.id = pp.id_partner
    left join partner_contact pc on pc.id = pr.id_partner_contact
   where dk.no = p_no_dokumen
   order by pp.id
   limit 1;

  insert into evaluasi (id_dokumen_kerjasama, respondent_type, status, id_partner_contact)
  values (p_no_dokumen, 'partner', 'pending', v_id_kontak);

  return v_no_disposisi;
end;
$fn$;

-- 2. The partner evaluation form's prefill joined "the lead partner" to show
--    its name/negara; it now goes through the contact the evaluation itself
--    already points at (evaluasi.id_partner_contact), never through is_lead.
create or replace function resolusi_token_evaluasi(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare v jsonb;
begin
  select jsonb_build_object(
           'no_evaluasi',   e.no,
           'status',        e.status,
           'nama_mitra',    pr.nama,
           'negara',        n.nama,
           'nama_kontak',   pc.nama,
           'jabatan_kontak', pc.jabatan,
           'email_kontak',  pc.email,
           'hp_kontak',     pc.no_telp,
           'no_dokumen',    dk.no_dokumen,
           'jenis',         p.jenis_kerjasama,
           'tanggal_mulai', dk.tanggal_mulai,
           'tanggal_berakhir', dk.tanggal_berakhir,
           'form_revision', e.form_revision)
    into v
    from partner_eval_token t
    join evaluasi e on e.no = t.id_evaluasi
    join dokumen_kerja_sama dk on dk.no = e.id_dokumen_kerjasama
    join proposal_dokumen p on p.id = dk.id_proposal_dokumen
    left join partner_contact pc on pc.id = e.id_partner_contact
    left join partner pr on pr.id = pc.id_partner
    left join negara n on n.id = pr.id_negara
   where t.token = p_token and t.is_active and e.status = 'pending';

  return v;
end;
$fn$;

-- 3. Pencatatan Langsung's signatory partner: same deterministic pick as
--    aktivasi_dokumen (V8 §2's migration already fixed the disposisi path).
--    Body otherwise identical to 20260923000300_pencatatan_langsung.sql.
create or replace function catat_dokumen_langsung(
  p_id         int,      -- null on create
  p_proposal   jsonb,
  p_partner    jsonb,
  p_id_jabatan int,
  p_bidang     int[],
  p_agenda     int[],
  p_unit       int[],
  p_sdg        int[],
  p_mou        jsonb,
  p_moa        jsonb,
  p_dokumen    jsonb
) returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_id           int := p_id;
  v_no           int;
  v_ttd          date := nullif(p_dokumen ->> 'tanggal_tanda_tangan','')::date;
  v_id_partner   int;
  v_id_ttd_mitra int;
begin
  if not current_akun_is_io() then
    raise exception 'Hanya KUI yang dapat mencatat dokumen secara langsung';
  end if;

  if v_id is null then
    insert into proposal_dokumen (
      jenis_kerjasama, periode_kerjasama, sifat_periode_kerjasama,
      tujuan_kerjasama, manfaat_bagi_petra, manfaat_bagi_mitra, informasi_tambahan,
      status_proposal, is_pencatatan_langsung, id_akun_pembuat,
      waktu_proposal_dokumen, waktu_disetujui, waktu_aktif)
    values (
      (p_proposal ->> 'jenis_kerjasama')::jenis_kerjasama_t,
      nullif(p_proposal ->> 'periode_kerjasama',''),
      nullif(p_proposal ->> 'sifat_periode_kerjasama',''),
      nullif(p_proposal ->> 'tujuan_kerjasama',''),
      nullif(p_proposal ->> 'manfaat_bagi_petra',''),
      nullif(p_proposal ->> 'manfaat_bagi_mitra',''),
      nullif(p_proposal ->> 'informasi_tambahan',''),
      'Disetujui', true, current_akun_id(),
      v_ttd, v_ttd, now())
    returning id into v_id;
  else
    if not exists (select 1 from proposal_dokumen
                    where id = v_id and is_pencatatan_langsung) then
      raise exception 'Dokumen % bukan pencatatan langsung', v_id;
    end if;
    update proposal_dokumen set
      jenis_kerjasama         = (p_proposal ->> 'jenis_kerjasama')::jenis_kerjasama_t,
      periode_kerjasama       = nullif(p_proposal ->> 'periode_kerjasama',''),
      sifat_periode_kerjasama = nullif(p_proposal ->> 'sifat_periode_kerjasama',''),
      tujuan_kerjasama        = nullif(p_proposal ->> 'tujuan_kerjasama',''),
      manfaat_bagi_petra      = nullif(p_proposal ->> 'manfaat_bagi_petra',''),
      manfaat_bagi_mitra      = nullif(p_proposal ->> 'manfaat_bagi_mitra',''),
      informasi_tambahan      = nullif(p_proposal ->> 'informasi_tambahan',''),
      waktu_proposal_dokumen  = v_ttd,
      waktu_disetujui         = v_ttd
    where id = v_id;
  end if;

  perform simpan_anak_proposal(v_id, p_partner, p_id_jabatan, p_bidang, p_agenda,
                               p_unit, p_proposal ->> 'jenis_kerjasama',
                               p_mou, p_moa, p_sdg);

  select no into v_no from dokumen_kerja_sama where id_proposal_dokumen = v_id;

  if v_no is null then
    insert into dokumen_kerja_sama (
      id_proposal_dokumen, no_dokumen, tanggal_tanda_tangan, tanggal_mulai,
      tanggal_berakhir, status, folder_kui, no_berkas_dikti, upload_dokumen)
    values (
      v_id, p_dokumen ->> 'no_dokumen', v_ttd,
      nullif(p_dokumen ->> 'tanggal_mulai','')::date,
      nullif(p_dokumen ->> 'tanggal_berakhir','')::date,
      'Aktif',
      nullif(p_dokumen ->> 'folder_kui',''),
      nullif(p_dokumen ->> 'no_berkas_dikti',''),
      nullif(p_dokumen ->> 'upload_dokumen',''))
    returning no into v_no;
  else
    update dokumen_kerja_sama set
      no_dokumen           = p_dokumen ->> 'no_dokumen',
      tanggal_tanda_tangan = v_ttd,
      tanggal_mulai        = nullif(p_dokumen ->> 'tanggal_mulai','')::date,
      tanggal_berakhir     = nullif(p_dokumen ->> 'tanggal_berakhir','')::date,
      folder_kui           = nullif(p_dokumen ->> 'folder_kui',''),
      no_berkas_dikti      = nullif(p_dokumen ->> 'no_berkas_dikti',''),
      upload_dokumen       = coalesce(nullif(p_dokumen ->> 'upload_dokumen',''), upload_dokumen)
    where no = v_no;
  end if;

  update dokumen_kerja_sama set id_penandatangan_partner = null where no = v_no;
  delete from penandatangan_petra   where no_dokumen_kerjasama = v_no;
  delete from penandatangan_partner where no_dokumen_kerjasama = v_no;

  if coalesce(p_dokumen ->> 'penandatangan_petra','') <> '' then
    insert into penandatangan_petra (no_dokumen_kerjasama, nama, jabatan)
    values (v_no, p_dokumen ->> 'penandatangan_petra',
            nullif(p_dokumen ->> 'jabatan_petra',''));
  end if;

  if coalesce(p_dokumen ->> 'penandatangan_mitra','') <> '' then
    -- No partner is more "the" partner than another (V8 §8) — deterministic
    -- pick, same rule as aktivasi_dokumen.
    select pp.id_partner into v_id_partner
      from partner_pengusul pp
     where pp.id_proposal_dokumen = v_id
     order by pp.id
     limit 1;

    if v_id_partner is not null then
      insert into penandatangan_partner (id_partner, no_dokumen_kerjasama, nama, jabatan)
      values (v_id_partner, v_no, p_dokumen ->> 'penandatangan_mitra',
              nullif(p_dokumen ->> 'jabatan_mitra',''))
      returning id into v_id_ttd_mitra;
      update dokumen_kerja_sama set id_penandatangan_partner = v_id_ttd_mitra
       where no = v_no;
    end if;
  end if;

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (v_id, current_akun_id(),
          case when p_id is null then 'activated' else 'edited' end,
          p_dokumen ->> 'no_dokumen');

  return v_id;
end;
$fn$;
