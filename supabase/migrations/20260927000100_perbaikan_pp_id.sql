-- Perbaikan V8 — `order by pp.id` against a table that has no `id`.
--
-- 20260926000600 removed Mitra Utama (V8 §8) and replaced "pick the lead
-- partner" (`order by pp.is_lead desc`) with "pick the first partner joined,
-- by id". partner_pengusul has no surrogate id: its columns are id_partner,
-- id_proposal_dokumen and is_lead, and its primary key is the composite
-- (id_partner, id_proposal_dokumen). plpgsql does not resolve column names in
-- a function body until that statement runs, so all three migrations applied
-- cleanly and fail at call time with 42703.
--
-- Live proof:
--   select 1 from partner_pengusul pp order by pp.id limit 1;
--   ERROR:  42703: column pp.id does not exist
--
-- What it broke:
--   kirim_permintaan_pembaruan  — the lookup is unconditional, so EVERY call
--     raised and rolled back the disposisi, its targets and the faculty
--     evaluasi rows. No renewal could be requested at all, which left
--     v_pembaruan empty and took the Pembaruan tab and the renewal rows in
--     Antrean Saya with it.
--   aktivasi_dokumen            — raised whenever Penandatangan Mitra was
--     filled, so a signed document could not be activated.
--   catat_dokumen_langsung      — same, so Pencatatan Langsung could not save.
--
-- id_partner is the right key for "first partner joined": it is the identity
-- column on partner, so ordering by it is as deterministic as the intent
-- described, and it is half of this table's own primary key.
--
-- Each function below is its previous body verbatim with that one line
-- changed; `create or replace` resets attributes, so `security definer` and
-- `set search_path = public` are restated, and it preserves ACLs, so the
-- existing grants stand.

-- 1 ------------------------------------------------------------------
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
   order by pp.id_partner
   limit 1;

  insert into evaluasi (id_dokumen_kerjasama, respondent_type, status, id_partner_contact)
  values (p_no_dokumen, 'partner', 'pending', v_id_kontak);

  return v_no_disposisi;
end;
$fn$;

-- 2 ------------------------------------------------------------------
create or replace function aktivasi_dokumen(
  p_id_proposal          int,
  p_no_dokumen           text,
  p_tanggal_tanda_tangan date,
  p_tanggal_mulai        date,
  p_tanggal_berakhir     date default null,
  p_folder_kui           text default null,
  p_no_berkas_dikti      text default null,
  p_upload_dokumen       text default null,
  p_penandatangan_petra  text default null,
  p_jabatan_petra        text default null,
  p_penandatangan_mitra  text default null,
  p_jabatan_mitra        text default null
) returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_no int;
  v_id_partner int;
  v_id_penandatangan_partner int;
  v_sebelumnya int;
begin
  if not current_akun_is_io() then
    raise exception 'Only IO activates a document';
  end if;

  if (select status_proposal from proposal_dokumen where id = p_id_proposal) <> 'Siap TTD' then
    raise exception 'Only a Siap TTD proposal can be activated';
  end if;

  insert into dokumen_kerja_sama (
    id_proposal_dokumen, no_dokumen, tanggal_tanda_tangan, tanggal_mulai,
    tanggal_berakhir, status, folder_kui, no_berkas_dikti, upload_dokumen)
  values (
    p_id_proposal, p_no_dokumen, p_tanggal_tanda_tangan, p_tanggal_mulai,
    p_tanggal_berakhir, 'Aktif', p_folder_kui, p_no_berkas_dikti, p_upload_dokumen)
  returning no into v_no;

  if p_penandatangan_petra is not null and p_penandatangan_petra <> '' then
    insert into penandatangan_petra (no_dokumen_kerjasama, nama, jabatan)
    values (v_no, p_penandatangan_petra, nullif(p_jabatan_petra, ''));
  end if;

  if p_penandatangan_mitra is not null and p_penandatangan_mitra <> '' then
    -- One partner of record signs; with Mitra Utama removed (V8 §8) there is
    -- no more designated lead, so the first partner joined is the one of
    -- record — deterministic, not "whichever the client happened to send".
    select pp.id_partner into v_id_partner
      from partner_pengusul pp
     where pp.id_proposal_dokumen = p_id_proposal
     order by pp.id_partner
     limit 1;

    insert into penandatangan_partner (id_partner, no_dokumen_kerjasama, nama, jabatan)
    values (v_id_partner, v_no, p_penandatangan_mitra, nullif(p_jabatan_mitra, ''))
    returning id into v_id_penandatangan_partner;

    update dokumen_kerja_sama set id_penandatangan_partner = v_id_penandatangan_partner
     where no = v_no;
  end if;

  update proposal_dokumen set waktu_aktif = now() where id = p_id_proposal;

  select id_dokumen_sebelumnya into v_sebelumnya
    from proposal_dokumen where id = p_id_proposal;

  if v_sebelumnya is not null then
    update dokumen_kerja_sama
       set status = 'Diarsipkan', alasan_arsip = 'superseded_by_renewal'
     where id_proposal_dokumen = v_sebelumnya;

    insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
    values (v_sebelumnya, current_akun_id(), 'archived',
            'superseded_by_renewal — digantikan oleh dokumen ' || p_no_dokumen);
  end if;

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_id_proposal, current_akun_id(), 'activated', p_no_dokumen);

  return v_no;
end;
$fn$;

-- 3 ------------------------------------------------------------------
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
     order by pp.id_partner
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

-- 4 ------------------------------------------------------------------------
-- Two V8 gaps in the renewal, both in the same function so they go together:
--   * the Mulai Proses Pembaruan gate (V8 §16) was added to the storage policy
--     and to v_pembaruan.gerbang but never to the RPC that creates the
--     successor, so it could be bypassed by posting the Server Action;
--   * SDG tagging was never copied to the successor, and could not be
--     re-entered afterwards.
create or replace function buat_proposal_perpanjangan(p_no_dokumen int, p_file text default null)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_gerbang text;
  v_lama proposal_dokumen;
  v_baru int;
  v_unit int;
begin
  v_gerbang := status_gerbang_pembaruan(p_no_dokumen);
  if v_gerbang <> 'terbuka' then
    raise exception
      'Pembaruan belum dapat diajukan: gerbang evaluasi berstatus %. Kedua evaluasi harus masuk dan keduanya merekomendasikan lanjut (BR-26).',
      v_gerbang;
  end if;

  -- V8 §16: evaluation agreement alone is not enough — Admin must have pressed
  -- Mulai Proses Pembaruan first. 20260926000300 moved the storage policy
  -- (boleh_unggah_perpanjangan) and v_pembaruan.gerbang onto that rule but
  -- left this RPC behind, so the Server Action could still create a successor
  -- with a null file before the process was opened. That closed every open
  -- renewal_request target and made Admin's own start card disappear.
  if not exists (select 1 from dokumen_kerja_sama dk
                  where dk.no = p_no_dokumen
                    and dk.pembaruan_dimulai_at is not null) then
    raise exception
      'Pembaruan belum dibuka: Admin harus menekan Mulai Proses Pembaruan lebih dulu (V8 §16).';
  end if;

  select p.* into v_lama
    from dokumen_kerja_sama dk join proposal_dokumen p on p.id = dk.id_proposal_dokumen
   where dk.no = p_no_dokumen;

  select j.id_unit into v_unit
    from pengusul pg join jabatan j on j.id = pg.id_jabatan
   where pg.id_proposal_dokumen = v_lama.id limit 1;

  if not (current_akun_is_io() or akun_milik_unit(v_unit)) then
    raise exception 'Only an account of the owning unit uploads the renewal draft (AR-08)';
  end if;

  -- The predecessor link IS the renewal flag; there is no second boolean.
  insert into proposal_dokumen (
    jenis_kerjasama, periode_kerjasama, sifat_periode_kerjasama, status_proposal,
    tujuan_kerjasama, manfaat_bagi_petra, manfaat_bagi_mitra, informasi_tambahan,
    file_draft, id_dokumen_sebelumnya, id_akun_pembuat, waktu_proposal_dokumen)
  values (
    v_lama.jenis_kerjasama, v_lama.periode_kerjasama, v_lama.sifat_periode_kerjasama,
    'Diajukan', v_lama.tujuan_kerjasama, v_lama.manfaat_bagi_petra,
    v_lama.manfaat_bagi_mitra, v_lama.informasi_tambahan,
    p_file, v_lama.id, current_akun_id(), now())
  returning id into v_baru;

  -- Everything that describes the partnership carries over; only the approval
  -- itself starts again.
  insert into partner_pengusul (id_partner, id_proposal_dokumen, is_lead)
  select id_partner, v_baru, is_lead from partner_pengusul where id_proposal_dokumen = v_lama.id;
  insert into pengusul (id_jabatan, id_proposal_dokumen)
  select id_jabatan, v_baru from pengusul where id_proposal_dokumen = v_lama.id;
  insert into proposal_dokumen_agenda (id_proposal_dokumen, id_agenda)
  select v_baru, id_agenda from proposal_dokumen_agenda where id_proposal_dokumen = v_lama.id;
  insert into proposal_dokumen_bidang (id_proposal_dokumen, id_bidang_kerjasama)
  select v_baru, id_bidang_kerjasama from proposal_dokumen_bidang where id_proposal_dokumen = v_lama.id;
  insert into proposal_dokumen_unit (id_proposal_dokumen, id_unit)
  select v_baru, id_unit from proposal_dokumen_unit where id_proposal_dokumen = v_lama.id;
  -- proposal_dokumen_sdg arrived in 20260923000100, after this function was
  -- written, and was the one child table it never carried over. The loss was
  -- permanent: the successor is created straight into 'Diajukan', and
  -- proposal_ubah only lets a submitter edit while the status is Draft, so the
  -- unit could not put the tags back.
  insert into proposal_dokumen_sdg (id_proposal_dokumen, nomor_sdg)
  select v_baru, nomor_sdg from proposal_dokumen_sdg where id_proposal_dokumen = v_lama.id;

  insert into proposal_dokumen_mou (id_proposal_dokumen, ringkasan_kegiatan)
  select v_baru, ringkasan_kegiatan from proposal_dokumen_mou where id_proposal_dokumen = v_lama.id;
  insert into proposal_dokumen_moa (id_proposal_dokumen, hak_petra, hak_calon_mitra,
                                    kewajiban_petra, kewajiban_calon_mitra)
  select v_baru, hak_petra, hak_calon_mitra, kewajiban_petra, kewajiban_calon_mitra
    from proposal_dokumen_moa where id_proposal_dokumen = v_lama.id;

  -- The renewal request completes by the draft arriving — not by an approve or
  -- a reject, which it never had (BR-25).
  update disposisi_target dt
     set status = 'approved', waktu_resolusi = now()
    from disposisi d
   where d.no = dt.no_disposisi
     and d.no_dokumen_kerjasama = p_no_dokumen
     and d.jenis_disposisi = 'renewal_request'
     and dt.status = 'pending_action';

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  values (v_baru, current_akun_id(), 'submitted',
          'Draf pembaruan diunggah oleh unit pemilik; proposal Perpanjangan dibuat.');

  return v_baru;
end;
$fn$;
