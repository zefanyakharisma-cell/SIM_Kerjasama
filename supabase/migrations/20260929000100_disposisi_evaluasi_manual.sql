-- Disposisi Evaluasi — Admin chooses who receives the evaluation form.
--
-- Until now kirim_permintaan_pembaruan always routed to
-- jabatan_kepala_lingkup(no). Admin can now pick either:
--   * Otomatis ke unit pengusul — p_jabatan null/empty, exactly the old
--     routing (lingkup heads, falling back to the proposing positions);
--   * Pilih manual — p_jabatan lists the positions, one PETRA evaluation each.
--
-- The old (int, text) signature is DROPPED rather than overloaded: with
-- defaults on both, a two-argument call would be ambiguous between the two.
-- Dropping loses the ACL, so the grants are restated below.

drop function kirim_permintaan_pembaruan(int, text);

-- Body is 20260927000100_perbaikan_pp_id.sql's verbatim, except the source of
-- the recipient loop and the validation of a manual list.
create function kirim_permintaan_pembaruan(
  p_no_dokumen int,
  p_pesan      text  default null,
  p_jabatan    int[] default null
) returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_no_disposisi int;
  v_jabatan int;
  v_ada boolean := false;
  v_id_kontak int;
  v_manual boolean := coalesce(cardinality(p_jabatan), 0) > 0;
begin
  if not current_akun_is_io() then
    raise exception 'Only IO dispositions a renewal request (PRD §9.1)';
  end if;

  if exists (select 1 from disposisi
              where no_dokumen_kerjasama = p_no_dokumen
                and jenis_disposisi = 'renewal_request') then
    raise exception 'Document % already has a renewal request', p_no_dokumen;
  end if;

  -- A manual list must name real, active positions only — a typo'd or retired
  -- id would create an evaluation nobody can ever fill, holding the gate shut.
  if v_manual and exists (
       select 1 from unnest(p_jabatan) as x(id)
        where x.id is null
           or not exists (select 1 from jabatan j where j.id = x.id and j.is_active)) then
    raise exception 'Jabatan tujuan evaluasi tidak ditemukan atau sudah tidak aktif.';
  end if;

  insert into disposisi (no_dokumen_kerjasama, jenis_disposisi, round_ke,
                         pesan_disposisi, id_akun_pengirim)
  values (p_no_dokumen, 'renewal_request', 1,
          coalesce(p_pesan, 'Mohon ditangani pembaruan dokumen ini.'),
          current_akun_id())
  returning no into v_no_disposisi;

  for v_jabatan in
    select distinct x.id from unnest(p_jabatan) as x(id) where v_manual
    union
    select k.id from jabatan_kepala_lingkup(p_no_dokumen) as k(id) where not v_manual
  loop
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

revoke execute on function kirim_permintaan_pembaruan(int, text, int[]) from public, anon;
grant  execute on function kirim_permintaan_pembaruan(int, text, int[]) to authenticated;

-- ---------------------------------------------------------------------------
-- mulai_proses_pembaruan told jabatan_kepala_lingkup(no) that Pembaruan had
-- started. With a manual disposition those are not necessarily the positions
-- that evaluated, so it now tells the positions the renewal request was
-- actually sent to — the same set in automatic mode, so nothing changes there.
-- Body is 20260926000300_mulai_pembaruan.sql's verbatim otherwise;
-- create-or-replace keeps the existing grants.
-- ---------------------------------------------------------------------------
create or replace function mulai_proses_pembaruan(p_no_dokumen int) returns void
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
    select dt.id_jabatan from disposisi_target dt
      join disposisi d on d.no = dt.no_disposisi
     where d.no_dokumen_kerjasama = p_no_dokumen
       and d.jenis_disposisi = 'renewal_request'
  loop
    perform catat_notifikasi('renewal_open', v_jabatan, v_id_proposal, p_no_dokumen, null,
      'Pembaruan dimulai. Unggah dokumen perpanjangan di tab Pembaruan; PDF dokumen dan berkas revisi terakhir tersedia di sana.');
  end loop;
end;
$fn$;
