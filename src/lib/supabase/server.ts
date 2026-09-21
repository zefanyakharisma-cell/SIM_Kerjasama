import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Server-side Supabase client, bound to the request's auth cookies.
 *
 * Every query made through this runs as the `authenticated` role, so RLS is
 * what decides which rows come back (EC-05). Nothing here re-checks access.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: { name: string; value: string; options?: CookieOptions }[]) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

export type Akun = {
  id: number;
  id_jabatan: number;
  email: string;
  role: "submitter" | "io_staff" | "io_admin" | "viewer";
};

/** The signed-in account, or null. The account IS a position (DR-06). */
// cache(): the layout and the page both ask, and each ask was two round trips
// to Supabase (auth + akun). Once per request is enough.
export const akunSaatIni = cache(async (): Promise<Akun | null> => {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  // RLS lets any linked account read every akun row, so filter to our own.
  const { data } = await supabase
    .from("akun")
    .select("id, id_jabatan, email, role")
    .eq("auth_user_id", auth.user.id)
    .eq("is_active", true)
    .maybeSingle();
  return (data as Akun) ?? null;
});

export const isIO = (a: Akun | null) =>
  a?.role === "io_staff" || a?.role === "io_admin";
