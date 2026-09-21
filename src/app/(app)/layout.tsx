import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/sidebar-nav";

/**
 * The app shell (Design §3): one flat sidebar shared by every role. Role
 * differences show up in which rows and actions appear, not in a different
 * menu.
 */
const MENU = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/kerja-sama", label: "Cari Kerja Sama" },
  // One entry for both ways in: KUI picks "ajukan" or "catat langsung"
  // (Pencatatan Langsung, Revisi V8 §1) at the top of the page itself.
  { href: "/buat", label: "Buat Kerja Sama" },
  { href: "/antrean", label: "Antrean Saya" },
  { href: "/notifikasi", label: "Notifikasi" },
  { href: "/master-data", label: "Master Data", adminSaja: true },
  // Master data and system settings. Shown to everyone, refused by RLS to
  // everyone else — but hiding it keeps the menu honest about what a role can
  // actually do, so it is filtered below.
  { href: "/admin", label: "Pengaturan", adminSaja: true },
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

  const supabase = await supabaseServer();

  // Unread count on the nav item itself. RLS scopes notifikasi to this
  // account's position already, so there is nothing to filter here.
  const [{ data: jabatan }, { count: belumDibaca }] = await Promise.all([
    supabase.from("jabatan").select("nama").eq("id", akun.id_jabatan).maybeSingle(),
    supabase
      .from("notifikasi")
      .select("*", { count: "exact", head: true })
      .eq("id_jabatan_penerima", akun.id_jabatan)
      .is("waktu_dibaca", null),
  ]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <SidebarNav
        menu={MENU.filter(
          (m) =>
            !("adminSaja" in m) || akun.role === "io_admin",
        )}
        belumDibaca={belumDibaca ?? 0}
        jabatan={jabatan?.nama ?? "Jabatan"}
        email={akun.email}
        role={akun.role}
        terlipatAwal={(await cookies()).get("sidebar-terlipat")?.value === "1"}
      />

      <main className="min-w-0 flex-1 p-6 md:p-8">{children}</main>
    </div>
  );
}
