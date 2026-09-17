import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * The service-role client and the API-key check — used by the `/api/v1` read
 * surface and by nothing else.
 *
 * This client BYPASSES RLS. That is the whole reason it is confined to one file
 * with this comment on it: every other path in the system reads through the
 * caller's own session so that RLS decides the rows (EC-05). Here there is no
 * session — the caller is another system — so the route is responsible for the
 * scope, and every `/api/v1` handler filters to Active documents before
 * returning anything.
 *
 * Never import this from a page or a Server Action.
 */
export function supabaseLayanan() {
  const kunci = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!kunci) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY belum diset — API Realisasi tidak dapat berjalan.",
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, kunci, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * One shared key for one consumer, compared in constant time.
 *
 * A per-client table with revocation is the right shape once there is a second
 * consumer. There is exactly one — the Realization System — and building the
 * table now would be a registry with a single row in it.
 */
export function apiKeyValid(request: NextRequest): boolean {
  const diharapkan = process.env.REALIZATION_API_KEY;
  if (!diharapkan) return false;

  const diberikan =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  const a = Buffer.from(diberikan);
  const b = Buffer.from(diharapkan);
  // timingSafeEqual throws on a length mismatch, so lengths are compared first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
