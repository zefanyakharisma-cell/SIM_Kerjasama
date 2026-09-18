import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie and keeps unauthenticated traffic out
 * of the app shell.
 *
 * This is convenience, not enforcement: RLS decides what any request can
 * actually reach, so a missed redirect leaks nothing (AR-02).
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string; options?: CookieOptions }[]) =>
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          ),
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const masuk = request.nextUrl.pathname.startsWith("/login");

  if (!data.user && !masuk) {
    const ke = request.nextUrl.clone();
    ke.pathname = "/login";
    return NextResponse.redirect(ke);
  }
  if (data.user && masuk) {
    const ke = request.nextUrl.clone();
    ke.pathname = "/dashboard";
    return NextResponse.redirect(ke);
  }

  return response;
}

export const config = {
  // Everything except static assets, the public partner evaluation page, and
  // the Realization read API.
  //
  // `api/v1` is excluded because it authenticates with an API key rather than a
  // session — redirecting a machine client to /login would turn a 401 into a
  // 307 and an HTML page. `/api/ekspor` is deliberately NOT excluded: the
  // exports run on the caller's own session so that RLS decides their rows.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|evaluasi/.*|api/v1/.*|.*\\.png$).*)",
  ],
};
