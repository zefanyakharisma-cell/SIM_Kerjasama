-- Second hardening pass, driven by the Supabase security advisors after Phases
-- 2–4 landed. It found a real hole, and the reason it existed is worth writing
-- down so the next migration does not reopen it.
--
-- Phase 1 ran:
--
--   alter default privileges in schema public revoke execute on functions from public;
--
-- That only governs objects created **by the role that set it**, and only from
-- that point on. Every function created in a later migration therefore got
-- Postgres's normal default back: EXECUTE to PUBLIC, which `anon` inherits. So
-- sixteen functions written in Phases 2 and 3 were reachable with nothing but
-- the anon key.
--
-- Most of them check authority themselves and would have refused an
-- unauthenticated caller — `current_akun()` is NULL for anon, so every
-- `current_akun_is_io()` gate fails closed. A few did not, and they are the
-- actual finding:
--
--   * `agregasi_grafik`          — SECURITY DEFINER over v_daftar_dokumen, so it
--                                  bypasses RLS by design. Anyone holding the
--                                  anon key could read aggregate counts across
--                                  every document in the system.
--   * `status_gerbang_pembaruan` — the renewal state of any document by number.
--   * `jabatan_pemilik_dokumen` / `jabatan_pemilik_proposal` /
--     `jabatan_prefill_perpanjangan` — enumerate which positions are attached to
--     which document.
--
-- None of them writes anything. All of them leak.

-- --------------------------------------------------------------------------
-- 1. Close it, and close it by default for anything added later.
-- --------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- --------------------------------------------------------------------------
-- 2. Hand EXECUTE back deliberately, function by function.
-- --------------------------------------------------------------------------
-- Predicates the RLS policies evaluate, and the account lookup the app needs.
grant execute on function current_akun()                  to authenticated;
grant execute on function current_akun_id()               to authenticated;
grant execute on function current_akun_is_io()            to authenticated;
grant execute on function akun_punya_target(int)          to authenticated;
grant execute on function proposal_sudah_aktif(int)       to authenticated;
grant execute on function boleh_baca_proposal(int)        to authenticated;
grant execute on function proposal_sedang_disposisi(int)  to authenticated;
grant execute on function unit_descendants(int)           to authenticated;
grant execute on function unit_seleksi_status(int, int)   to authenticated;
grant execute on function pengaturan(text, text)          to authenticated;
grant execute on function is_hari_kerja(date)             to authenticated;
grant execute on function tambah_hari_kerja(timestamptz, int)                to authenticated;
grant execute on function hari_kerja_terpakai(timestamptz, timestamptz, int) to authenticated;
grant execute on function bendera_sla(int)                to authenticated;

-- Workflow actions. Each checks its own authority; the grant only decides who
-- may reach the check.
grant execute on function ajukan_proposal(int)                     to authenticated;
grant execute on function kirim_disposisi(int, int[], text, text)  to authenticated;
grant execute on function aksi_approval(int, text, text)           to authenticated;
grant execute on function reaktivasi_pending(int)                  to authenticated;
grant execute on function tambah_target(int, int)                  to authenticated;
grant execute on function hapus_target(int)                        to authenticated;
grant execute on function catat_revisi(int, text, text, int)       to authenticated;
grant execute on function arsipkan_dokumen(int, text)              to authenticated;
grant execute on function aktivasi_dokumen(int, text, date, date, date, text, text, text)
  to authenticated;

-- Renewal and evaluation.
grant execute on function akun_milik_unit(int)                    to authenticated;
grant execute on function jabatan_pemilik_dokumen(int)            to authenticated;
grant execute on function jabatan_pemilik_proposal(int)           to authenticated;
grant execute on function jabatan_prefill_perpanjangan(int)       to authenticated;
grant execute on function kirim_permintaan_pembaruan(int, text)   to authenticated;
grant execute on function status_gerbang_pembaruan(int)           to authenticated;
grant execute on function putuskan_pembaruan(int, text, text)     to authenticated;
grant execute on function kirim_evaluasi_fakultas(int, jsonb)     to authenticated;
grant execute on function buka_ulang_evaluasi(int)                to authenticated;
grant execute on function buat_proposal_perpanjangan(int, text)   to authenticated;

-- Master data and reporting.
grant execute on function gabung_partner(int, int)  to authenticated;
grant execute on function agregasi_grafik(jsonb)    to authenticated;

-- --------------------------------------------------------------------------
-- 3. The only two things `anon` may execute in the entire schema.
-- --------------------------------------------------------------------------
-- Both require a 256-bit token and both are scoped to exactly one evaluation.
-- This is the public surface, and it is two functions wide (AR-07).
grant execute on function resolusi_token_evaluasi(text)       to anon, authenticated;
grant execute on function kirim_evaluasi_partner(text, jsonb) to anon, authenticated;

-- --------------------------------------------------------------------------
-- 4. Trigger functions belong to the triggers, not to callers.
-- --------------------------------------------------------------------------
-- Postgres invokes these as the table owner when a row changes; nothing should
-- be able to call them directly, least of all through PostgREST.
revoke execute on function notifikasi_dari_riwayat()   from public, anon, authenticated;
revoke execute on function notifikasi_target_terbuka() from public, anon, authenticated;
revoke execute on function enforce_auto_renewed_no_end_date()
  from public, anon, authenticated;

-- recompute_tiers, the sweeps, catat_notifikasi, jabatan_io, token_baru,
-- terapkan_jawaban_evaluasi, resolusi_penerus and bersihkan_proposal_uji stay
-- granted to nobody: each is internal, or belongs to the scheduler, or to the
-- service role behind the API key.

-- --------------------------------------------------------------------------
-- 5. search_path on everything added since the first hardening pass.
-- --------------------------------------------------------------------------
alter function akun_milik_unit(int)                  set search_path = public;
alter function jabatan_pemilik_dokumen(int)          set search_path = public;
alter function jabatan_prefill_perpanjangan(int)     set search_path = public;
alter function gabung_partner(int, int)              set search_path = public;
alter function agregasi_grafik(jsonb)                set search_path = public;
