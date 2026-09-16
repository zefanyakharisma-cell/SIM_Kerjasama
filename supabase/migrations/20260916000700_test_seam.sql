-- Tier gating and SLA must be unit-testable directly against Postgres, with no
-- HTTP cycle (rules §9). A test therefore needs to act AS a position.
--
-- The seam: when there is no Auth session, current_akun() honours the
-- `simks.akun_id` session setting -- but ONLY for the privileged roles that run
-- migrations, sweeps and tests. A browser client connects as `authenticated`,
-- never reaches that branch, and so can never impersonate a position by setting
-- a GUC.
create or replace function current_akun() returns akun
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_akun akun;
  v_impersonasi text;
begin
  select a.* into v_akun from akun a
   where a.auth_user_id = auth.uid() and a.is_active limit 1;
  if found then return v_akun; end if;

  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    v_impersonasi := current_setting('simks.akun_id', true);
    if v_impersonasi is not null and v_impersonasi <> '' then
      select a.* into v_akun from akun a
       where a.id = v_impersonasi::int and a.is_active;
      return v_akun;
    end if;
  end if;

  return null;
end;
$fn$;

comment on function current_akun is
  'The akun behind the current session. Falls back to the simks.akun_id setting
   only for privileged roles (tests, sweeps); an authenticated client cannot.';
