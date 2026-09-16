import Link from "next/link";
import { redirect } from "next/navigation";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";

/**
 * The app shell (Design §3): one flat sidebar shared by every role. Role
 * differences show up in which rows and actions appear, not in a different
 * menu.
 */
const MENU = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/kerja-sama", label: "Cari Kerja Sama" },
  { href: "/buat", label: "Buat Kerja Sama" },
  { href: "/antrean", label: "Antrean Saya" },
] as const;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const akun = await akunSaatIni();

  // Signed in to Supabase Auth but with no akun row: the account exists as a
  // credential but has no position, so it has no authority over anything.
  if (!akun) {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect("/login");

    return (
      <main className="mx-auto max-w-lg p-10">
        <h1 className="mb-2 text-lg font-semibold">Akun belum terhubung jabatan</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Login berhasil, tetapi email ini belum tertaut ke satu jabatan di
          master data. Hubungi Kantor Kerja Sama untuk menautkannya.
        </p>
      </main>
    );
  }

  const { data: jabatan } = await (await supabaseServer())
    .from("jabatan")
    .select("nama")
    .eq("id", akun.id_jabatan)
    .maybeSingle();

  return (
    <div className="flex min-h-screen">
      <aside
        className="hidden w-64 shrink-0 flex-col p-5 text-white md:flex"
        style={{ background: "var(--midnight)" }}
      >
        <div className="mb-8">
          <div className="text-sm font-semibold tracking-wide">SIM KERJA SAMA</div>
          <div className="text-xs opacity-70">Universitas Kristen Petra</div>
        </div>

        <div className="mb-6 rounded-lg bg-white/10 p-3">
          {/* The audit identifies positions, not individuals, so the shell
              names the position first (§12.3). */}
          <div className="text-xs font-medium">{jabatan?.nama ?? "Jabatan"}</div>
          <div className="text-[11px] opacity-70">{akun.email}</div>
        </div>

        <nav className="flex flex-col gap-1">
          {MENU.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="rounded-lg px-3 py-2 text-sm hover:bg-white/10"
            >
              {m.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-6 text-[11px] opacity-60">
          {akun.role === "io_admin"
            ? "IO Admin"
            : akun.role === "io_staff"
              ? "Staf KUI"
              : akun.role === "viewer"
                ? "Peninjau"
                : "Pengusul"}
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-6 md:p-8">{children}</main>
    </div>
  );
}
