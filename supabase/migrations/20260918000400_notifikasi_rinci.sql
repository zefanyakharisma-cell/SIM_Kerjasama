-- Detailed notifications:
--   [Nama Jabatan] [Action] [No. Dokumen] [Jenis Dokumen] [Nama Mitra] [— Agenda, MoA only]
-- e.g. "Dekan FT menyetujui 012/UN/2026 MoA PT Maju Jaya — Magang Mahasiswa"
--
-- One BEFORE INSERT trigger on notifikasi composes the header, so every
-- writer — catat_notifikasi, the direct inserts in the renewal functions, both
-- sweeps, and any path written later — gets the same format without being
-- touched. The text each writer supplied stays underneath as the detail line.
-- The sweep idempotency index keys on (target, jenis, recipient), not isi, so
-- it is unaffected.

-- How a document is named in a sentence. No. Dokumen exists only after
-- activation, so a proposal simply goes without it. Agenda is shown for MoA
-- only: an MoU is an umbrella and its agenda says little.
create function label_dokumen(p_id_proposal int) returns text
language sql stable security definer set search_path = public as $fn$
  select concat_ws(' ',
           dk.no_dokumen,
           p.jenis_kerjasama::text,
           (select string_agg(pr.nama, ', ' order by pp.is_lead desc, pr.nama)
              from partner_pengusul pp join partner pr on pr.id = pp.id_partner
             where pp.id_proposal_dokumen = p.id))
         || case when p.jenis_kerjasama::text = 'MoA' then coalesce(' — ' || (
              select string_agg(ag.nama, ', ' order by ag.nama)
                from proposal_dokumen_agenda pda join agenda ag on ag.id = pda.id_agenda
               where pda.id_proposal_dokumen = p.id), '')
            else '' end
    from proposal_dokumen p
    left join dokumen_kerja_sama dk on dk.id_proposal_dokumen = p.id
   where p.id = p_id_proposal;
$fn$;

create function notifikasi_rinci() returns trigger
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
    when 'reactivated'              then 'mengaktifkan kembali'
    when 'evaluation_submitted'     then 'mengirim evaluasi'
    when 'split_decision'           then 'menandai evaluasi berbeda pada'
    when 'sla_yellow'               then 'mengingatkan tenggat (kuning)'
    when 'sla_red'                  then 'mengingatkan tenggat (merah)'
    when 'sla_eskalasi'             then 'mengeskalasi tenggat'
    when 'expiring_soon'            then 'mengingatkan masa berakhir'
    else replace(new.jenis_notifikasi, '_', ' ') end;

  -- The actor. A disposition is sent by its disposisi's sender; any other
  -- event is done by whoever is signed in right now. The partner answers
  -- through a token with no account, and the sweeps run with no session.
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

create trigger notifikasi_rinci
  before insert on notifikasi
  for each row execute function notifikasi_rinci();

-- Internal to the trigger; neither is an API.
revoke execute on function label_dokumen(int) from public, anon, authenticated;
revoke execute on function notifikasi_rinci() from public, anon, authenticated;

comment on function notifikasi_rinci is
  'Prefixes every notification with [Jabatan] [aksi] [No. Dokumen] [Jenis]
   [Mitra] [— Agenda for MoA]; the writer''s own text follows on a new line.';
