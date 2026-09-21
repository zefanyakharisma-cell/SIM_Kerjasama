"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { keluar } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";

export type MenuItem = { href: string; label: string };

const PERAN_LABEL: Record<string, string> = {
  io_admin: "IO Admin",
  io_staff: "Staf KUI",
  viewer: "Peninjau",
  submitter: "Pengusul",
};

// 20px stroke icons, one per route. Unknown routes fall back to a circle.
const IKON: Record<string, string> = {
  "/dashboard": "M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z",
  "/kerja-sama": "M8.5 3a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM17 17l-4.1-4.1",
  "/buat": "M4 3h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM10 7v6M7 10h6",
  "/catat": "M4 3h9l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM12 3v4h4M6 11h8M6 14h5",
  "/antrean": "M3 5h14M3 10h14M3 15h9",
  "/notifikasi": "M5 8a5 5 0 0 1 10 0c0 5 2 6 2 6H3s2-1 2-6zM8.5 17a1.5 1.5 0 0 0 3 0",
  "/master-data":
    "M3 5c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2zM3 5v10c0 1.1 3.1 2 7 2s7-.9 7-2V5M3 10c0 1.1 3.1 2 7 2s7-.9 7-2",
  "/admin": "M3 6h8M15 6h2M3 14h2M9 14h8M13 4v4M7 12v4",
};

function Ikon({ d }: { d: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * The sidebar shell, split into a client component so the collapse toggle and
 * account panel can hold local state — the layout above it stays a Server
 * Component that only fetches data.
 *
 * Desktop gets the fixed aside; below md the same contents open as a drawer
 * from the top bar. The collapse state lives in a cookie so the server renders
 * the right width on first paint.
 */
export function SidebarNav({
  menu,
  belumDibaca,
  jabatan,
  email,
  role,
  terlipatAwal,
}: {
  menu: MenuItem[];
  belumDibaca: number;
  jabatan: string;
  email: string;
  role: string;
  terlipatAwal: boolean;
}) {
  const pathname = usePathname();
  const [terlipat, setTerlipat] = useState(terlipatAwal);
  const [akunTerbuka, setAkunTerbuka] = useState(false);
  const [menuTerbuka, setMenuTerbuka] = useState(false);

  const ubahLipat = () => {
    const next = !terlipat;
    setTerlipat(next);
    document.cookie = `sidebar-terlipat=${next ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
  };

  // Escape closes whatever is open; a click outside the account panel closes it.
  useEffect(() => {
    if (!akunTerbuka && !menuTerbuka) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAkunTerbuka(false);
      setMenuTerbuka(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-akun]")) setAkunTerbuka(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [akunTerbuka, menuTerbuka]);

  const peran = PERAN_LABEL[role] ?? role;

  // Rendered twice (aside and drawer); `varian` keeps the ids unique.
  const isi = (lipat: boolean, varian: "desktop" | "seluler") => (
    <>
      <div className={`mb-6 flex items-center gap-2 ${lipat ? "justify-center" : "justify-between"}`}>
        <div className={`flex items-center gap-2 ${lipat ? "hidden" : ""}`}>
          <Image
            src="/logo-petra.png"
            alt="Universitas Kristen Petra"
            width={32}
            height={32}
            className="rounded bg-white/90 p-0.5"
          />
          <div>
            <div className="text-sm font-semibold leading-tight tracking-wide">
              SIM KERJA SAMA
            </div>
            <div className="text-[11px] opacity-80">Universitas Kristen Petra</div>
          </div>
        </div>
        {varian === "desktop" ? (
          <button
            type="button"
            onClick={ubahLipat}
            aria-label={lipat ? "Tampilkan menu" : "Sembunyikan menu"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm hover:bg-white/10"
          >
            {lipat ? "»" : "«"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMenuTerbuka(false)}
            aria-label="Tutup menu"
            autoFocus
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg hover:bg-white/10"
          >
            ×
          </button>
        )}
      </div>

      <div className="relative mb-6" data-akun>
        <button
          type="button"
          onClick={() => setAkunTerbuka((v) => !v)}
          aria-expanded={akunTerbuka}
          aria-haspopup="true"
          aria-controls={`panel-akun-${varian}`}
          title={lipat ? `${jabatan} — ${email}` : undefined}
          className={`w-full rounded-lg bg-white/10 text-left hover:bg-white/15 ${
            lipat ? "p-2 text-center" : "p-3"
          }`}
        >
          {lipat ? (
            <div className="text-xs font-medium">
              {jabatan.slice(0, 2).toUpperCase()}
              <span className="sr-only"> — akun</span>
            </div>
          ) : (
            <>
              <div className="text-xs font-medium">{jabatan}</div>
              <div className="truncate text-xs opacity-80">{email}</div>
            </>
          )}
        </button>

        {akunTerbuka ? (
          <div
            id={`panel-akun-${varian}`}
            className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg border bg-white p-3 text-xs shadow-lg"
            style={{ borderColor: "var(--border)", color: "var(--text-primary, #19304b)" }}
          >
            <div className="mb-1 font-semibold" style={{ color: "var(--midnight)" }}>
              Informasi Akun
            </div>
            <div className="mb-0.5">
              <span style={{ color: "var(--text-muted)" }}>Jabatan: </span>
              {jabatan}
            </div>
            <div className="mb-0.5 break-all">
              <span style={{ color: "var(--text-muted)" }}>Email: </span>
              {email}
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>Peran: </span>
              {peran}
            </div>
            <form action={keluar} className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <SubmitButton
                labelMenunggu="Keluar…"
                className="w-full rounded-lg px-3 py-1.5 text-left font-medium hover:bg-black/5"
              >
                Keluar
              </SubmitButton>
            </form>
          </div>
        ) : null}
      </div>

      <nav className="flex flex-col gap-1" aria-label="Menu utama">
        {menu.map((m) => {
          const aktif = pathname === m.href || pathname.startsWith(`${m.href}/`);
          const lencana = m.href === "/notifikasi" && belumDibaca > 0;
          return (
            <Link
              key={m.href}
              href={m.href as Route}
              title={lipat ? m.label : undefined}
              aria-current={aktif ? "page" : undefined}
              onClick={() => setMenuTerbuka(false)}
              className={`flex items-center gap-3 rounded-lg py-2 text-sm hover:bg-white/10 ${
                lipat ? "justify-center px-2" : "px-3"
              }`}
              style={aktif ? { background: "rgba(255,255,255,0.14)" } : undefined}
            >
              <span className="relative">
                <Ikon d={IKON[m.href] ?? "M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"} />
                {lipat && lencana ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--midnight)]"
                    style={{ background: "var(--status-progress-strong)" }}
                  />
                ) : null}
              </span>
              <span className={lipat ? "sr-only" : "flex-1"}>{m.label}</span>
              {lencana ? (
                <span
                  className={lipat ? "sr-only" : "rounded-full px-1.5 text-xs font-medium"}
                  style={lipat ? undefined : { background: "var(--status-progress-strong)" }}
                >
                  {belumDibaca}
                  <span className="sr-only"> belum dibaca</span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {!lipat ? <div className="mt-auto pt-6 text-xs opacity-80">{peran}</div> : null}
    </>
  );

  return (
    <>
      <header
        className="flex items-center justify-between px-4 py-3 text-white md:hidden"
        style={{ background: "var(--midnight)" }}
      >
        <span className="text-sm font-semibold tracking-wide">SIM KERJA SAMA</span>
        <button
          type="button"
          onClick={() => setMenuTerbuka(true)}
          aria-expanded={menuTerbuka}
          aria-controls="menu-seluler"
          aria-label="Buka menu"
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10"
        >
          <Ikon d="M3 5h14M3 10h14M3 15h14" />
        </button>
      </header>

      {menuTerbuka ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuTerbuka(false)}
            aria-hidden="true"
          />
          <div
            id="menu-seluler"
            className="relative flex h-full w-72 max-w-[85%] flex-col overflow-y-auto p-5 text-white"
            style={{ background: "var(--midnight)" }}
          >
            {isi(false, "seluler")}
          </div>
        </div>
      ) : null}

      <aside
        className={`hidden shrink-0 flex-col py-5 text-white transition-[width] duration-150 md:flex ${
          terlipat ? "w-16 px-2" : "w-64 px-5"
        }`}
        style={{ background: "var(--midnight)" }}
      >
        {isi(terlipat, "desktop")}
      </aside>
    </>
  );
}
