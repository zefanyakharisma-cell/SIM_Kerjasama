-- Revisi V7 — disposition message, notification scope, the revision loop.
--
-- 1. The disposition message becomes the target's notification detail line
--    (the subtitle under the header notifikasi_rinci composes).
-- 2. A revision request is told to the submitter only — not to IO.
-- 3. The revision loop: the approver asks, the submitter uploads on the
--    Disposisi tab, the approver is told and may approve again. While a
--    request is open the approver cannot approve (or ask again).

-- --------------------------------------------------------------------------
-- Is a revision request on this target still unanswered? Requests and uploads
-- pair 1:1 (aksi_approval refuses a second open request, catat_revisi refuses
-- an upload with nothing open), so comparing the two counts is enough.
-- --------------------------------------------------------------------------
create function revisi_terbuka(p_no_target int) returns boolean
language sql stable security definer set search_path = public as $fn$
  select (select count(*) from riwayat_approval
           where id_disposisi_target = p_no_target and aksi = 'revision_requested')
       > (select count(*) from revisi_proposal
           where id_disposisi_target_peminta = p_no_target);
$fn$;

grant execute on function revisi_terbuka(int) to authenticated;

-- --------------------------------------------------------------------------
-- aksi_approval — unchanged from 20260916000600 except the open-revision gate.
-- --------------------------------------------------------------------------
create or replace function aksi_approval(
  p_no_target int,
  p_aksi      text,
  p_catatan   text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_target record;
  v_id_proposal int;
  v_akun akun;
  v_hari int;
begin
  v_akun := current_akun();

  select dt.no, dt.id_jabatan, dt.status, dt.waktu_unlock,
         d.id_proposal_dokumen, d.jenis_disposisi
    into v_target
    from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where dt.no = p_no_target
   for update of dt;

  if not found then
    raise exception 'Disposition target % does not exist', p_no_target;
  end if;

  if v_target.jenis_disposisi <> 'approval' then
    raise exception 'Target % belongs to a renewal request and has no approve/reject path (BR-24)',
      p_no_target;
  end if;

  if v_target.status <> 'pending_action' then
    raise exception 'Target % is % — only a target awaiting action can be acted on (BR-01)',
      p_no_target, v_target.status;
  end if;

  if v_akun.id is null or v_akun.id_jabatan <> v_target.id_jabatan then
    raise exception 'This account does not hold the position this target is routed to (AR-01)';
  end if;

  -- The revision loop: approve (or ask again) only once the submitter has
  -- answered. Reject and Pending stay available.
  if p_aksi in ('approve', 'revision') and revisi_terbuka(p_no_target) then
    raise exception 'Menunggu revisi dari pengusul — setujui setelah revisi diunggah';
  end if;

  v_id_proposal := v_target.id_proposal_dokumen;
  v_hari := hari_kerja_terpakai(v_target.waktu_unlock, now(), v_id_proposal);

  if p_aksi = 'approve' then
    update disposisi_target
       set status = 'approved',
           waktu_resolusi = now(),
           durasi_hari_kerja = v_hari,
           status_sla = bendera_sla(v_hari)
     where no = p_no_target;

  elsif p_aksi = 'reject' then
    update disposisi_target
       set status = 'rejected', waktu_resolusi = now(),
           durasi_hari_kerja = v_hari, status_sla = bendera_sla(v_hari)
     where no = p_no_target;

    insert into dokumen_kerja_sama (id_proposal_dokumen, status, alasan_arsip)
    values (v_id_proposal, 'Diarsipkan', 'rejected')
    on conflict (id_proposal_dokumen) do update
      set status = 'Diarsipkan', alasan_arsip = 'rejected';

  elsif p_aksi = 'pending' then
    insert into pending_periods (id_proposal_dokumen, id_disposisi_target_pemicu)
    values (v_id_proposal, p_no_target);

  elsif p_aksi = 'revision' then
    -- The target stays open; the approver re-approves the fixed draft (BR-07).
    null;

  else
    raise exception 'Unknown action %; expected approve / reject / pending / revision', p_aksi;
  end if;

  insert into riwayat_approval (id_disposisi_target, id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_no_target, v_id_proposal, v_akun.id,
          case when p_aksi = 'revision' then 'revision_requested' else p_aksi end,
          p_catatan);

  perform recompute_tiers(v_id_proposal);
end;
$fn$;

-- --------------------------------------------------------------------------
-- catat_revisi — now the submitter's action, answering one open request, and
-- it tells the approver who asked.
-- --------------------------------------------------------------------------
create or replace function catat_revisi(p_id_proposal int, p_file text,
                                        p_catatan text default null,
                                        p_no_target_peminta int default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_jabatan_peminta int;
begin
  if not current_akun_is_io()
     and not exists (select 1 from proposal_dokumen
                      where id = p_id_proposal and id_akun_pembuat = current_akun_id()) then
    raise exception 'Only the submitter or IO uploads a revised draft';
  end if;

  select dt.id_jabatan into v_jabatan_peminta
    from disposisi_target dt join disposisi d on d.no = dt.no_disposisi
   where dt.no = p_no_target_peminta and d.id_proposal_dokumen = p_id_proposal;

  if v_jabatan_peminta is null or not revisi_terbuka(p_no_target_peminta) then
    raise exception 'Tidak ada permintaan revisi yang terbuka untuk dijawab';
  end if;

  update proposal_dokumen set file_draft = p_file where id = p_id_proposal;
  insert into revisi_proposal (id_proposal_dokumen, file_proposal, id_akun_pengunggah,
                               id_disposisi_target_peminta, catatan)
  values (p_id_proposal, p_file, current_akun_id(), p_no_target_peminta, p_catatan);

  insert into riwayat_approval (id_disposisi_target, id_proposal_dokumen, id_akun, aksi, catatan)
  values (p_no_target_peminta, p_id_proposal, current_akun_id(), 'revision_submitted', p_catatan);

  -- No target on the notice: the sweep index would otherwise refuse the
  -- second revision round's notice to the same approver.
  perform catat_notifikasi('revision_submitted', v_jabatan_peminta, p_id_proposal,
                           null, null, p_catatan);
end;
$fn$;

-- --------------------------------------------------------------------------
-- Notifications
-- --------------------------------------------------------------------------

-- The disposition message is the detail line the target reads.
create or replace function notifikasi_target_terbuka() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_proposal int; v_dokumen int; v_jenis text; v_pesan text;
begin
  if new.status <> 'pending_action'
     or (tg_op = 'UPDATE' and old.status = 'pending_action') then
    return new;
  end if;

  select d.id_proposal_dokumen, d.no_dokumen_kerjasama, d.jenis_disposisi,
         nullif(btrim(d.pesan_disposisi), '')
    into v_proposal, v_dokumen, v_jenis, v_pesan
    from disposisi d where d.no = new.no_disposisi;

  perform catat_notifikasi(
    case when v_jenis = 'approval' then 'disposition_assigned'
         else 'renewal_request_assigned' end,
    new.id_jabatan, v_proposal, v_dokumen, new.no,
    coalesce(v_pesan,
      case when v_jenis = 'approval'
           then 'Sebuah dokumen menunggu persetujuan jabatan Anda.'
           else 'Permintaan pembaruan dokumen ditujukan ke unit Anda.' end));
  return new;
end;
$fn$;

-- A revision request goes to the submitter only; every other outcome still
-- goes to the submitter and IO.
create or replace function notifikasi_dari_riwayat() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_jenis text;
  v_pemilik int;
  v_io int;
begin
  v_jenis := case new.aksi
    when 'approve'            then 'approved'
    when 'reject'             then 'rejected'
    when 'pending'            then 'pending'
    when 'revision_requested' then 'revision_requested'
    when 'reactivated'        then 'reactivated'
    else null end;

  if v_jenis is null or new.id_proposal_dokumen is null then
    return new;
  end if;

  v_pemilik := jabatan_pemilik_proposal(new.id_proposal_dokumen);
  if v_pemilik is not null then
    perform catat_notifikasi(v_jenis, v_pemilik, new.id_proposal_dokumen,
                             null, null, new.catatan);
  end if;

  if v_jenis = 'revision_requested' then
    return new;
  end if;

  for v_io in select * from jabatan_io() loop
    if v_io is distinct from v_pemilik then
      perform catat_notifikasi(v_jenis, v_io, new.id_proposal_dokumen,
                               null, null, new.catatan);
    end if;
  end loop;

  return new;
end;
$fn$;

-- Header verb for the new notice; the rest is 20260918000400 unchanged.
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
  elsif new.jenis_notifikasi not in ('split_decision', 'sla_yellow', 'sla_red',
                                     'sla_eskalasi', 'expiring_soon') then
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

-- --------------------------------------------------------------------------
-- Storage: the submitter uploads the revised file under revisi/<id>/, and
-- that folder is as private as draft/ and disposisi/.
-- --------------------------------------------------------------------------
create policy dokumen_kerjasama_unggah_revisi on storage.objects for insert
  to authenticated with check (
    bucket_id = 'dokumen-kerjasama'
    and (storage.foldername(name))[1] = 'revisi'
    and (storage.foldername(name))[2] ~ '^[0-9]+$'
    and exists (
      select 1 from proposal_dokumen p
       where p.id = (storage.foldername(name))[2]::int
         and p.id_akun_pembuat = current_akun_id()
    )
  );

drop policy dokumen_kerjasama_baca on storage.objects;
create policy dokumen_kerjasama_baca on storage.objects for select
  to authenticated using (
    bucket_id = 'dokumen-kerjasama'
    and (
      (
        (storage.foldername(name))[1] is distinct from 'draft'
        and (storage.foldername(name))[1] is distinct from 'disposisi'
        and (storage.foldername(name))[1] is distinct from 'revisi'
      )
      or (
        (storage.foldername(name))[2] ~ '^[0-9]+$'
        and boleh_baca_proposal((storage.foldername(name))[2]::int)
      )
    )
  );
