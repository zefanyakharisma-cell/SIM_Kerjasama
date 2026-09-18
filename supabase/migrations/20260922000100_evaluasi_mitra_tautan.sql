-- Evaluasi Mitra: KUI activates the partner link on demand, and the partner
-- identifies themselves with nama, jabatan, email and no. HP.

-- ============================================================================
-- 1. Bug fix: v_pembaruan is security_invoker and partner_eval_token had RLS
--    with no policy, so token_partner was always NULL in the app and the link
--    never showed. KUI reads it; unit accounts still cannot (the link is KUI's
--    to send).
-- ============================================================================
create policy partner_eval_token_baca on partner_eval_token for select to authenticated
  using (current_akun_is_io());

-- ============================================================================
-- 2. The partner's identity record.
-- ============================================================================
alter table evaluasi
  add column respondent_jabatan varchar(150),
  add column respondent_hp      varchar(30);

create or replace function terapkan_jawaban_evaluasi(p_no int, p_jawaban jsonb) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if (p_jawaban ->> 'rekomendasi') not in ('continue','terminate') then
    raise exception 'A recommendation must be continue or terminate';
  end if;

  update evaluasi set
    exp_quality        = (p_jawaban ->> 'exp_quality')::smallint,
    exp_relevance      = (p_jawaban ->> 'exp_relevance')::smallint,
    exp_productivity   = (p_jawaban ->> 'exp_productivity')::smallint,
    exp_sustainability = (p_jawaban ->> 'exp_sustainability')::smallint,
    exp_communication  = (p_jawaban ->> 'exp_communication')::smallint,
    sat_quality        = (p_jawaban ->> 'sat_quality')::smallint,
    sat_relevance      = (p_jawaban ->> 'sat_relevance')::smallint,
    sat_productivity   = (p_jawaban ->> 'sat_productivity')::smallint,
    sat_sustainability = (p_jawaban ->> 'sat_sustainability')::smallint,
    sat_communication  = (p_jawaban ->> 'sat_communication')::smallint,
    rekomendasi        = p_jawaban ->> 'rekomendasi',
    continuation_mode  = nullif(p_jawaban ->> 'continuation_mode', ''),
    catatan_evaluasi   = nullif(p_jawaban ->> 'catatan_evaluasi', ''),
    respondent_nama    = coalesce(nullif(p_jawaban ->> 'respondent_nama', ''), respondent_nama),
    respondent_email   = coalesce(nullif(p_jawaban ->> 'respondent_email', ''), respondent_email),
    respondent_jabatan = coalesce(nullif(p_jawaban ->> 'respondent_jabatan', ''), respondent_jabatan),
    respondent_hp      = coalesce(nullif(p_jawaban ->> 'respondent_hp', ''), respondent_hp),
    status             = 'submitted',
    waktu_evaluasi     = now()
  where no = p_no and status = 'pending';

  if not found then
    raise exception 'Evaluation % is not awaiting an answer', p_no;
  end if;
end;
$fn$;

revoke execute on function terapkan_jawaban_evaluasi(int, jsonb) from public, anon, authenticated;

create or replace function kirim_evaluasi_partner(p_token text, p_jawaban jsonb) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_no int; v_dok int;
begin
  select e.no, e.id_dokumen_kerjasama into v_no, v_dok
    from partner_eval_token t join evaluasi e on e.no = t.id_evaluasi
   where t.token = p_token and t.is_active and e.status = 'pending';

  if v_no is null then
    raise exception 'Tautan evaluasi ini tidak berlaku atau sudah terisi.';
  end if;

  -- The accountability record for a form with no login (PRD §9.3).
  if coalesce(btrim(p_jawaban ->> 'respondent_nama'), '') = ''
     or coalesce(btrim(p_jawaban ->> 'respondent_jabatan'), '') = ''
     or coalesce(btrim(p_jawaban ->> 'respondent_email'), '') = ''
     or coalesce(btrim(p_jawaban ->> 'respondent_hp'), '') = '' then
    raise exception 'Nama, jabatan, email, dan no. HP responden wajib diisi.';
  end if;

  perform terapkan_jawaban_evaluasi(v_no, p_jawaban);

  update partner_eval_token
     set waktu_submit = now(), is_active = false
   where token = p_token;

  insert into notifikasi (jenis_notifikasi, id_jabatan_penerima, no_dokumen_kerjasama, isi, status)
  select 'evaluation_submitted', io, v_dok, 'Evaluasi mitra telah masuk.', 'pending'
    from jabatan_io() io;

  perform umumkan_gerbang(v_dok);
end;
$fn$;

-- Prefill for the partner form: the lead contact as on file.
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
    left join partner_pengusul pp
           on pp.id_proposal_dokumen = p.id and pp.is_lead
    left join partner pr on pr.id = pp.id_partner
    left join negara n on n.id = pr.id_negara
    left join partner_contact pc on pc.id = e.id_partner_contact
   where t.token = p_token and t.is_active and e.status = 'pending';

  return v;
end;
$fn$;

-- ============================================================================
-- 3. The link is no longer issued with the renewal request; KUI activates it.
--    Same as 20260921000100 otherwise.
-- ============================================================================
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

  -- One partner evaluation, for the LEAD partner (BR-29). Pending, so the gate
  -- waits for it; its link comes from buat_tautan_evaluasi_mitra.
  select pc.id into v_id_kontak
    from dokumen_kerja_sama dk
    join partner_pengusul pp on pp.id_proposal_dokumen = dk.id_proposal_dokumen
    join partner pr on pr.id = pp.id_partner
    left join partner_contact pc on pc.id = pr.id_partner_contact
   where dk.no = p_no_dokumen
   order by pp.is_lead desc
   limit 1;

  insert into evaluasi (id_dokumen_kerjasama, respondent_type, status, id_partner_contact)
  values (p_no_dokumen, 'partner', 'pending', v_id_kontak);

  return v_no_disposisi;
end;
$fn$;

-- Activate (or regenerate) the partner's link. Regenerating kills the old one.
create function buat_tautan_evaluasi_mitra(p_no_dokumen int) returns text
language plpgsql security definer set search_path = public as $fn$
declare v_no int; v_token text;
begin
  if not current_akun_is_io() then
    raise exception 'Hanya KUI yang dapat membuat tautan evaluasi mitra';
  end if;

  select no into v_no from evaluasi
   where id_dokumen_kerjasama = p_no_dokumen and respondent_type = 'partner'
     and status = 'pending'
   order by no desc limit 1;

  if v_no is null then
    raise exception 'Tidak ada evaluasi mitra yang menunggu jawaban untuk dokumen ini';
  end if;

  update partner_eval_token set is_active = false
   where id_evaluasi = v_no and is_active;

  v_token := token_baru();
  insert into partner_eval_token (id_evaluasi, token, id_akun_pengirim)
  values (v_no, v_token, current_akun_id());

  return v_token;
end;
$fn$;

revoke execute on function buat_tautan_evaluasi_mitra(int) from public, anon;
grant execute on function buat_tautan_evaluasi_mitra(int) to authenticated;
