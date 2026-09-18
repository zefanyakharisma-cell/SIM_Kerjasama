-- The functions created in 20260917001100 and 20260918000100 picked up
-- EXECUTE for anon from the platform's default privileges — the exact hole
-- 20260917000800_hardening_phase234.sql closed for everything before them.
-- Each one fails closed for anon (current_akun_id() is NULL), but the rule is
-- that only the two partner-token functions are reachable without a session.
revoke execute on function aktivasi_dokumen(
  int, text, date, date, date, text, text, text, text, text, text, text
) from public, anon;
revoke execute on function simpan_anak_proposal(
  int, jsonb, int, int[], int[], int[], text, jsonb, jsonb
) from public, anon;
revoke execute on function set_kontak_utama(int, int, int) from public, anon;
