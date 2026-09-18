-- catat_riwayat_pembaruan is a trigger function, never an API; the security
-- advisor flagged it as executable by `authenticated` via RPC.
revoke execute on function catat_riwayat_pembaruan() from authenticated;
