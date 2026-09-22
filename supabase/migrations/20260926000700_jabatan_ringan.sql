-- Revisi V8 §10 — from the Jabatan Pengusul dropdown in Buat Kerja Sama, any
-- account may add a brand-new position by filling a small form inline
-- (nama + unit only — no approval tier, no kepala unit flag: those stay a
-- Master Data / Admin decision, made deliberately, not a side-effect of
-- filling in a proposal). Editing an EXISTING jabatan's nama/unit from here
-- stays Admin-only, same authority as Master Data.

create function tambah_jabatan_ringan(p_nama text, p_id_unit int) returns int
language plpgsql security definer set search_path = public as $fn$
declare v_id int;
begin
  if current_akun_id() is null then
    raise exception 'Login diperlukan';
  end if;
  if coalesce(btrim(p_nama), '') = '' then
    raise exception 'Nama jabatan wajib diisi';
  end if;
  if not exists (select 1 from unit where id = p_id_unit) then
    raise exception 'Unit tidak ditemukan';
  end if;

  insert into jabatan (nama, id_unit, is_active)
  values (btrim(p_nama), p_id_unit, true)
  returning id into v_id;

  return v_id;
end;
$fn$;

grant execute on function tambah_jabatan_ringan(text, int) to authenticated;

create function ubah_jabatan_ringan(p_id int, p_nama text, p_id_unit int) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if not current_akun_is_io() then
    raise exception 'Only Admin edits an existing Jabatan';
  end if;
  if coalesce(btrim(p_nama), '') = '' then
    raise exception 'Nama jabatan wajib diisi';
  end if;
  if not exists (select 1 from unit where id = p_id_unit) then
    raise exception 'Unit tidak ditemukan';
  end if;

  update jabatan set nama = btrim(p_nama), id_unit = p_id_unit where id = p_id;
end;
$fn$;

grant execute on function ubah_jabatan_ringan(int, text, int) to authenticated;
