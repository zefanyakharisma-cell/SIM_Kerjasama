-- Renewal steps in the document History.
--
-- Until now a renewal wrote History only when the extension proposal was made
-- and when the predecessor was archived; the request, both evaluations, a
-- reopen and a split decision left no trace there. They are recorded by
-- triggers on the tables those steps already write, the same approach
-- 20260917000100_notifications.sql takes: every path is covered, including
-- ones written later, and the renewal functions themselves stay untouched.
--
-- The new aksi values (renewal_requested, evaluation_submitted,
-- evaluation_reopened, renewal_decided) are not in notifikasi_dari_riwayat's
-- list, so these rows do not notify twice — the renewal functions already
-- notify for themselves.

create function catat_riwayat_pembaruan() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_no_dokumen int;
  v_akun int;
  v_aksi text;
  v_catatan text;
  v_sisi text;
begin
  if tg_table_name = 'disposisi' then
    if new.jenis_disposisi <> 'renewal_request' then return new; end if;
    v_no_dokumen := new.no_dokumen_kerjasama;
    v_akun := new.id_akun_pengirim;
    v_aksi := 'renewal_requested';
    v_catatan := new.pesan_disposisi;

  elsif tg_table_name = 'evaluasi' then
    v_no_dokumen := new.id_dokumen_kerjasama;
    -- NULL for the partner, who answers through a token with no account.
    v_akun := current_akun_id();
    v_sisi := case new.respondent_type when 'faculty' then 'Fakultas' else 'Mitra' end;
    if old.status = 'pending' and new.status = 'submitted' then
      v_aksi := 'evaluation_submitted';
      v_catatan := v_sisi || ': rekomendasi '
                   || case new.rekomendasi when 'continue' then 'lanjutkan' else 'akhiri' end;
    elsif old.status = 'submitted' and new.status = 'superseded' then
      v_aksi := 'evaluation_reopened';
      v_catatan := 'Evaluasi ' || lower(v_sisi) || ' dibuka ulang';
    else
      return new;
    end if;

  elsif tg_table_name = 'keputusan_pembaruan' then
    v_no_dokumen := new.id_dokumen_kerjasama;
    v_akun := new.id_akun;
    v_aksi := 'renewal_decided';
    v_catatan := case new.keputusan when 'continue' then 'Lanjutkan' else 'Hentikan' end
                 || ' — ' || new.alasan;
  else
    return new;
  end if;

  insert into riwayat_approval (id_proposal_dokumen, id_akun, aksi, catatan)
  select dk.id_proposal_dokumen, v_akun, v_aksi, v_catatan
    from dokumen_kerja_sama dk where dk.no = v_no_dokumen;
  return new;
end;
$fn$;

create trigger disposisi_riwayat_pembaruan
  after insert on disposisi
  for each row execute function catat_riwayat_pembaruan();

create trigger evaluasi_riwayat_pembaruan
  after update of status on evaluasi
  for each row execute function catat_riwayat_pembaruan();

create trigger keputusan_pembaruan_riwayat
  after insert on keputusan_pembaruan
  for each row execute function catat_riwayat_pembaruan();

revoke execute on function catat_riwayat_pembaruan() from public, anon;

comment on function catat_riwayat_pembaruan is
  'Writes each renewal step (request, evaluation submitted/reopened, split
   decision) to riwayat_approval so it shows in the document History.';
