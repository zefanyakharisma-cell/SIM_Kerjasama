-- Revisi V7 (client list) — roles, Lingkup count, Akan Berakhir, evaluation
-- routed to the lingkup heads, one PETRA answer per head, override on any
-- outcome, and the outcome notifications.

-- ============================================================================
-- 1. Every KUI account is admin (V7 §1, §5). io_staff stays a legal value for
--    history; the admin form no longer offers it.
-- ============================================================================
update akun set role = 'io_admin' where role = 'io_staff';

-- ============================================================================
-- 2. Who heads a unit. Stored, never inferred from the name (same rule as
--    tier_disposisi). Existing data: a tiered position in a top-level unit is
--    that unit's head — admins correct it in Master Data.
-- ============================================================================
alter table jabatan add column kepala_unit boolean not null default false;

update jabatan set kepala_unit = true
 where tier_disposisi is not null
   and id_unit in (select u.id from unit u join unit akar on akar.id = u.id_parent_unit
                    where akar.id_parent_unit is null);

-- The top-level unit a unit belongs to: the faculty or the support unit, i.e.
-- the ancestor whose parent is the root. NULL for the root itself.
create function unit_puncak(p_id_unit int) returns int
language sql stable set search_path = public as $fn$
  with recursive naik as (
    select u.id, u.id_parent_unit from unit u where u.id = p_id_unit
    union all
    select u.id, u.id_parent_unit from unit u join naik n on u.id = n.id_parent_unit
  )
  select n.id from naik n join unit p on p.id = n.id_parent_unit
   where p.id_parent_unit is null
   limit 1;
$fn$;

-- The heads of every top-level unit in the document's Lingkup (V7 §5): the
-- Dekan of each faculty, the Kepala of each support unit. Falls back to the
-- proposing positions when no head is flagged, so a request is never unroutable.
create function jabatan_kepala_lingkup(p_no_dokumen int) returns setof int
language sql stable security definer set search_path = public as $fn$
  with kepala as (
    select distinct j.id
      from dokumen_kerja_sama dk
      join proposal_dokumen_unit pdu on pdu.id_proposal_dokumen = dk.id_proposal_dokumen
      join jabatan j on j.id_unit = unit_puncak(pdu.id_unit)
     where dk.no = p_no_dokumen and j.kepala_unit and j.is_active
  )
  select id from kepala
  union
  select * from jabatan_pemilik_dokumen(p_no_dokumen)
   where not exists (select 1 from kepala);
$fn$;

grant execute on function unit_puncak(int)            to authenticated;
grant execute on function jabatan_kepala_lingkup(int) to authenticated;

-- ============================================================================
-- 3. The renewal request goes to the lingkup heads, and each head gets their
--    own PETRA evaluation (V7 §5, §8).
-- ============================================================================
create or replace function kirim_permintaan_pembaruan(p_no_dokumen int, p_pesan text default null)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_no_disposisi int;
  v_jabatan int;
  v_ada boolean := false;
  v_no_eval int;
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

  -- One partner evaluation, for the LEAD partner (BR-29).
  select pc.id into v_id_kontak
    from dokumen_kerja_sama dk
    join partner_pengusul pp on pp.id_proposal_dokumen = dk.id_proposal_dokumen
    join partner pr on pr.id = pp.id_partner
    left join partner_contact pc on pc.id = pr.id_partner_contact
   where dk.no = p_no_dokumen
   order by pp.is_lead desc
   limit 1;

  insert into evaluasi (id_dokumen_kerjasama, respondent_type, status, id_partner_contact)
  values (p_no_dokumen, 'partner', 'pending', v_id_kontak)
  returning no into v_no_eval;

  insert into partner_eval_token (id_evaluasi, token, id_akun_pengirim)
  values (v_no_eval, token_baru(), current_akun_id());

  return v_no_disposisi;
end;
$fn$;

-- ============================================================================
-- 4. The gate. PETRA = every head's live answer: any pending waits, any
--    terminate is terminate. Once both sides are in, a standing override wins
--    whatever the outcome (V7 §6). Reopening an answer voids earlier overrides,
--    so a changed mind is never silently outvoted by an old decision.
-- ============================================================================
alter table keputusan_pembaruan add column is_berlaku boolean not null default true;

create or replace function status_gerbang_pembaruan(p_no_dokumen int) returns text
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_fak text;
  v_mitra text;
  v_override text;
begin
  if exists (select 1 from evaluasi
              where id_dokumen_kerjasama = p_no_dokumen and status = 'pending') then
    return 'menunggu';
  end if;

  select case when bool_or(rekomendasi = 'terminate') then 'terminate'
              when bool_and(rekomendasi = 'continue') then 'continue' end
    into v_fak
    from evaluasi
   where id_dokumen_kerjasama = p_no_dokumen and respondent_type = 'faculty'
     and status = 'submitted';

  select rekomendasi into v_mitra from evaluasi
   where id_dokumen_kerjasama = p_no_dokumen and respondent_type = 'partner'
     and status = 'submitted'
   order by no desc limit 1;

  -- A NULL is never agreement (BR-26).
  if v_fak is null or v_mitra is null then
    return 'menunggu';
  end if;

  select keputusan into v_override from keputusan_pembaruan
   where id_dokumen_kerjasama = p_no_dokumen and is_berlaku
   order by id desc limit 1;

  if v_override = 'continue' then return 'terbuka'; end if;
  if v_override = 'terminate' then return 'terminate'; end if;

  if v_fak = 'continue' and v_mitra = 'continue' then return 'terbuka'; end if;
  if v_fak = 'terminate' and v_mitra = 'terminate' then return 'terminate'; end if;
  return 'split';
end;
$fn$;

-- Who is told what, the moment an outcome is reached (V7 §8).
create function umumkan_gerbang(p_no_dokumen int) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_gerbang text := status_gerbang_pembaruan(p_no_dokumen);
  v_id_proposal int;
  v_jabatan int;
begin
  select id_proposal_dokumen into v_id_proposal
    from dokumen_kerja_sama where no = p_no_dokumen;

  if v_gerbang = 'terbuka' then
    -- §8.1: the pengusul, the head of the pengusul's unit, and the lingkup heads.
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
        'PETRA dan mitra melanjutkan. Unggah dokumen perpanjangan di tab Pembaruan; PDF dokumen dan berkas revisi terakhir tersedia di sana.');
    end loop;

  elsif v_gerbang = 'split' then
    -- §8.2: KUI decides — override or archive.
    for v_jabatan in select * from jabatan_io() loop
      perform catat_notifikasi('split_decision', v_jabatan, v_id_proposal, p_no_dokumen, null,
        'PETRA dan mitra berbeda — KUI memutuskan: override atau arsipkan.');
    end loop;

  elsif v_gerbang = 'terminate' then
    -- §8.3: archived by the expiry sweep at the end date.
    for v_jabatan in select * from jabatan_io() loop
      perform catat_notifikasi('renewal_terminated', v_jabatan, v_id_proposal, p_no_dokumen, null,
        'PETRA dan mitra tidak melanjutkan — diarsipkan pada tanggal berakhir.');
    end loop;
  end if;
end;
$fn$;

revoke execute on function umumkan_gerbang(int) from public, anon, authenticated;

-- Override on any finished outcome (V7 §6). The reason is still required.
create or replace function putuskan_pembaruan(p_no_dokumen int, p_keputusan text, p_alasan text)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if not current_akun_is_io() then
    raise exception 'Only KUI overrides an evaluation outcome';
  end if;
  if p_keputusan not in ('continue','terminate') then
    raise exception 'An override is continue or terminate, not %', p_keputusan;
  end if;
  if coalesce(btrim(p_alasan), '') = '' then
    raise exception 'An override requires a reason (BR-27)';
  end if;
  if status_gerbang_pembaruan(p_no_dokumen) = 'menunggu' then
    raise exception 'Document % is still waiting for evaluations', p_no_dokumen;
  end if;

  insert into keputusan_pembaruan (id_dokumen_kerjasama, keputusan, alasan, id_akun)
  values (p_no_dokumen, p_keputusan, p_alasan, current_akun_id());

  perform umumkan_gerbang(p_no_dokumen);
end;
$fn$;

-- Faculty side: the head the row is addressed to (or KUI). A legacy row with
-- no addressee keeps the old any-account-of-the-unit rule (AR-08).
create or replace function kirim_evaluasi_fakultas(p_no int, p_jawaban jsonb) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_eval evaluasi; v_unit int; v_saya int := (current_akun()).id_jabatan;
begin
  select * into v_eval from evaluasi where no = p_no and respondent_type = 'faculty';
  if not found then
    raise exception 'Evaluation % is not a faculty evaluation', p_no;
  end if;

  if v_eval.id_jabatan_pengusul is not null then
    if not (current_akun_is_io() or v_eval.id_jabatan_pengusul = v_saya) then
      raise exception 'Evaluasi ini ditujukan ke jabatan lain';
    end if;
  else
    select j.id_unit into v_unit
      from dokumen_kerja_sama dk
      join pengusul pg on pg.id_proposal_dokumen = dk.id_proposal_dokumen
      join jabatan j on j.id = pg.id_jabatan
     where dk.no = v_eval.id_dokumen_kerjasama
     limit 1;
    if not (current_akun_is_io() or akun_milik_unit(v_unit)) then
      raise exception 'Only an account of the owning unit fills this evaluation (AR-08)';
    end if;
    update evaluasi set id_jabatan_pengusul = v_saya where no = p_no;
  end if;

  perform terapkan_jawaban_evaluasi(p_no, p_jawaban);

  insert into notifikasi (jenis_notifikasi, id_jabatan_penerima, no_dokumen_kerjasama, isi, status)
  select 'evaluation_submitted', io, v_eval.id_dokumen_kerjasama,
         'Evaluasi PETRA telah masuk.', 'pending'
    from jabatan_io() io;

  perform umumkan_gerbang(v_eval.id_dokumen_kerjasama);
end;
$fn$;

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

  if coalesce(btrim(p_jawaban ->> 'respondent_nama'), '') = ''
     or coalesce(btrim(p_jawaban ->> 'respondent_email'), '') = '' then
    raise exception 'Nama dan email responden wajib diisi.';
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

-- Reopen: unchanged, except it voids standing overrides (see §4 above).
create or replace function buka_ulang_evaluasi(p_no int) returns text
language plpgsql security definer set search_path = public as $fn$
declare v_lama evaluasi; v_baru int; v_token text;
begin
  if not current_akun_is_io() then
    raise exception 'Only IO or the Head reopens an evaluation (PRD §9.5)';
  end if;

  select * into v_lama from evaluasi where no = p_no;
  if not found then raise exception 'Evaluation % does not exist', p_no; end if;
  if v_lama.status <> 'submitted' then
    raise exception 'Only a submitted evaluation can be reopened; this one is %', v_lama.status;
  end if;

  update evaluasi set status = 'superseded' where no = p_no;

  insert into evaluasi (id_dokumen_kerjasama, respondent_type, id_partner_contact,
                        id_jabatan_pengusul, form_revision, status, id_supersedes)
  values (v_lama.id_dokumen_kerjasama, v_lama.respondent_type, v_lama.id_partner_contact,
          v_lama.id_jabatan_pengusul, v_lama.form_revision, 'pending', p_no)
  returning no into v_baru;

  update keputusan_pembaruan set is_berlaku = false
   where id_dokumen_kerjasama = v_lama.id_dokumen_kerjasama and is_berlaku;

  if v_lama.respondent_type = 'partner' then
    update partner_eval_token
       set is_active = false, waktu_reopen = now(), id_akun_reopen = current_akun_id()
     where id_evaluasi = p_no;

    v_token := token_baru();
    insert into partner_eval_token (id_evaluasi, token, id_akun_pengirim)
    values (v_baru, v_token, current_akun_id());
  end if;

  return v_token;
end;
$fn$;

-- ============================================================================
-- 5. Akan Berakhir is automatic (V7 §4): set on insert/date change, and every
--    document re-read when the threshold changes — both directions.
-- ============================================================================
create function status_berakhir(p_status text, p_tanggal_berakhir date) returns text
language sql stable set search_path = public as $fn$
  select case
    when p_status in ('Aktif','Akan Berakhir')
     and p_tanggal_berakhir is not null
     and p_tanggal_berakhir >= current_date
    then case when p_tanggal_berakhir
                   <= current_date + (pengaturan('expiring_soon_months','6') || ' months')::interval
              then 'Akan Berakhir' else 'Aktif' end
    else p_status end;
$fn$;

create function segarkan_status_berakhir() returns int
language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  update dokumen_kerja_sama
     set status = status_berakhir(status, tanggal_berakhir)
   where status in ('Aktif','Akan Berakhir')
     and status <> status_berakhir(status, tanggal_berakhir);
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

create function dokumen_status_berakhir() returns trigger
language plpgsql set search_path = public as $fn$
begin
  new.status := status_berakhir(new.status, new.tanggal_berakhir);
  return new;
end;
$fn$;

create trigger dokumen_status_berakhir
  before insert or update of status, tanggal_berakhir on dokumen_kerja_sama
  for each row execute function dokumen_status_berakhir();

create function settings_segarkan_berakhir() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  perform segarkan_status_berakhir();
  return null;
end;
$fn$;

create trigger settings_segarkan_berakhir
  after insert or update of value on settings
  for each row when (new.key = 'expiring_soon_months')
  execute function settings_segarkan_berakhir();

revoke execute on function segarkan_status_berakhir() from public, anon, authenticated;

-- sapu_kedaluarsa: the Aktif/Akan Berakhir relabel is now segarkan_status_berakhir;
-- archival and reminders are 20260918000700 unchanged.
create or replace function sapu_kedaluarsa()
returns table (ditandai int, diarsipkan int, diingatkan int)
language plpgsql security definer set search_path = public as $fn$
declare
  d record;
  v_ditandai int := 0;
  v_diarsipkan int := 0;
  v_diingatkan int := 0;
  v_sisa_hari int;
  v_jeda int;
  v_io int;
begin
  v_ditandai := segarkan_status_berakhir();

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
-- 6. Notification header verbs for the new outcomes (20260920000200 + two).
-- ============================================================================
create or replace function notifikasi_rinci() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_proposal int := new.id_proposal_dokumen;
  v_aktor text;
  v_aksi text;
begin
  if v_proposal is null and new.no_dokumen_kerjasama is not null then
    select id_proposal_dokumen into v_proposal
      from dokumen_kerja_sama where no = new.no_dokumen_kerjasama;
  end if;

  v_aksi := case new.jenis_notifikasi
    when 'disposition_assigned'     then 'mengirim disposisi approval'
    when 'renewal_request_assigned' then 'mengirim disposisi evaluasi pembaruan'
    when 'approved'                 then 'menyetujui'
    when 'rejected'                 then 'menolak'
    when 'pending'                  then 'menangguhkan'
    when 'revision_requested'       then 'meminta revisi'
    when 'revision_submitted'       then 'mengunggah revisi'
    when 'reactivated'              then 'mengaktifkan kembali'
    when 'evaluation_submitted'     then 'mengirim evaluasi'
    when 'split_decision'           then 'menandai evaluasi berbeda pada'
    when 'renewal_open'             then 'membuka pembaruan untuk'
    when 'renewal_terminated'       then 'menandai tidak dilanjutkan:'
    when 'sla_yellow'               then 'mengingatkan tenggat (kuning)'
    when 'sla_red'                  then 'mengingatkan tenggat (merah)'
    when 'sla_eskalasi'             then 'mengeskalasi tenggat'
    when 'expiring_soon'            then 'mengingatkan masa berakhir'
    else replace(new.jenis_notifikasi, '_', ' ') end;

  if new.jenis_notifikasi in ('disposition_assigned', 'renewal_request_assigned')
     and new.id_disposisi_target is not null then
    select j.nama into v_aktor
      from disposisi_target dt
      join disposisi d on d.no = dt.no_disposisi
      join akun a on a.id = d.id_akun_pengirim
      join jabatan j on j.id = a.id_jabatan
     where dt.no = new.id_disposisi_target;
  elsif new.jenis_notifikasi not in ('split_decision', 'renewal_open', 'renewal_terminated',
                                     'sla_yellow', 'sla_red', 'sla_eskalasi',
                                     'expiring_soon') then
    select j.nama into v_aktor from jabatan j where j.id = (current_akun()).id_jabatan;
    if v_aktor is null and new.jenis_notifikasi = 'evaluation_submitted' then
      v_aktor := 'Mitra';
    end if;
  end if;

  new.isi := concat_ws(' ', coalesce(v_aktor, 'Sistem'), v_aksi, label_dokumen(v_proposal))
             || coalesce(E'\n' || nullif(btrim(new.isi), ''), '');
  return new;
end;
$fn$;

-- ============================================================================
-- 7. Lingkup shows as "N Unit" on the list (V7 §2). Appended column, so
--    create-or-replace is allowed; the view is 20260918000700 otherwise.
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
  p.id_akun_pembuat,
  lingkup_agg.jumlah_lingkup
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
  select string_agg(distinct u.nama, ', ' order by u.nama) as lingkup,
         count(distinct u.id)::int                         as jumlah_lingkup
    from proposal_dokumen_unit pdu
    join unit u on u.id = pdu.id_unit
   where pdu.id_proposal_dokumen = p.id
) lingkup_agg on true;

-- ============================================================================
-- 8. Storage: the renewal document (V7 §8.1) under perpanjangan/<id_proposal
--    of the expiring document>/, uploaded by the owning unit once the gate is
--    open. Readable like any active document's files.
-- ============================================================================
create function boleh_unggah_perpanjangan(p_id_proposal int) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from dokumen_kerja_sama dk
     where dk.id_proposal_dokumen = p_id_proposal
       and status_gerbang_pembaruan(dk.no) = 'terbuka'
       and (current_akun_is_io()
            or exists (select 1 from pengusul pg join jabatan j on j.id = pg.id_jabatan
                        where pg.id_proposal_dokumen = p_id_proposal
                          and akun_milik_unit(j.id_unit)))
  );
$fn$;

grant execute on function boleh_unggah_perpanjangan(int) to authenticated;

create policy dokumen_kerjasama_unggah_perpanjangan on storage.objects for insert
  to authenticated with check (
    bucket_id = 'dokumen-kerjasama'
    and (storage.foldername(name))[1] = 'perpanjangan'
    and (storage.foldername(name))[2] ~ '^[0-9]+$'
    and boleh_unggah_perpanjangan((storage.foldername(name))[2]::int)
  );
