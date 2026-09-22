-- Follow-up to the V8 migrations: Postgres grants EXECUTE on a new function
-- to PUBLIC by default, so every function added in 20260926000200-000800 was
-- reachable by the `anon` role through /rest/v1/rpc/... Each one already
-- refuses an unauthenticated caller on its first line (current_akun_is_io()
-- or current_akun_id() is null), so nothing was exploitable — but leaving the
-- grant in place contradicts this codebase's standing rule (20260916000900
-- lock_down_function_execution, 20260918000200 cabut_anon) and shows up in
-- Supabase's security linter.
--
-- authenticated keeps its explicit grant; only the default PUBLIC/anon one goes.

revoke execute on function tandai_siap_ttd(int)                 from public, anon;
revoke execute on function mulai_proses_pembaruan(int)          from public, anon;
revoke execute on function tambah_jabatan_ringan(text, int)     from public, anon;
revoke execute on function ubah_jabatan_ringan(int, text, int)  from public, anon;
revoke execute on function current_akun_dapat_buat()            from public, anon;

-- A trigger function has no business being callable over the API at all; the
-- trigger itself fires regardless of EXECUTE privilege.
revoke execute on function catat_status_proposal() from public, anon, authenticated;
