"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

export type MenuItem = { href: string; label: string };

const PERAN_LABEL: Record<string, string> = {
  io_admin: "IO Admin",
  io_staff: "Staf KUI",
  viewer: "Peninjau",
  submitter: "Pengusul",
};

/**
 * The sidebar shell, split into a client component so the collapse toggle and
 * account panel can hold local state — the layout above it stays a Server
 * Component that only fetches data.
 */
export function SidebarNav({
  menu,
  belumDibaca,
  jabatan,
  email,
  role,
}: {
  menu: MenuItem[];
  belumDibaca: number;
  jabatan: string;
  email: string;
  role: string;
}) {
  const pathname = usePathname();
  const [terlipat, setTerlipat] = useState(false);
  const [akunTerbuka, setAkunTerbuka] = useState(false);

  // ponytail: localStorage only, no per-device sync needed for a display toggle.
  useEffect(() => {
    try {
      setTerlipat(localStorage.getItem("sidebar-terlipat") === "1");
    } catch {
      // Private browsing / blocked storage — default to expanded.
    }
  }, []);

  const ubahLipat = () => {
    setTerlipat((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-terlipat", next ? "1" : "0");
      } catch {
        // Not persisted this session; still toggles visually.
      }
      return next;
    });
  };

  return (
    <aside
      className={`hidden shrink-0 flex-col p-5 text-white transition-[width] duration-150 md:flex ${
        terlipat ? "w-16" : "w-64"
      }`}
      style={{ background: "var(--midnight)" }}
    >
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className={`flex items-center gap-2 ${terlipat ? "hidden" : ""}`}>
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
            <div className="text-[11px] opacity-70">Universitas Kristen Petra</div>
          </div>
        </div>
        <button
          type="button"
          onClick={ubahLipat}
          aria-label={terlipat ? "Tampilkan menu" : "Sembunyikan menu"}
          className="rounded-lg p-1.5 text-xs hover:bg-white/10"
        >
          {terlipat ? "»" : "«"}
        </button>
      </div>

      <div className="relative mb-6">
        <button
          type="button"
          onClick={() => setAkunTerbuka((v) => !v)}
          className="w-full rounded-lg bg-white/10 p-3 text-left hover:bg-white/15"
        >
          {terlipat ? (
            <div className="text-xs font-medium">
              {jabatan.slice(0, 2).toUpperCase()}
            </div>
          ) : (
            <>
              <div className="text-xs font-medium">{jabatan}</div>
              <div className="text-[11px] opacity-70">{email}</div>
            </>
          )}
        </button>

        {akunTerbuka ? (
          <div
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
            <div className="mb-0.5">
              <span style={{ color: "var(--text-muted)" }}>Email: </span>
              {email}
            </div>
            <div>
              <span style={{ color: "var(--text-muted)" }}>Peran: </span>
              {PERAN_LABEL[role] ?? role}
            </div>
          </div>
        ) : null}
      </div>

      <nav className="flex flex-col gap-1">
        {menu.map((m) => {
          const aktif = pathname === m.href || pathname.startsWith(`${m.href}/`);
          return (
            <Link
              key={m.href}
              href={m.href as Route}
              title={terlipat ? m.label : undefined}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-white/10"
              style={aktif ? { background: "rgba(255,255,255,0.14)" } : undefined}
            >
              <span className={terlipat ? "truncate" : ""}>
                {terlipat ? m.label.slice(0, 1) : m.label}
              </span>
              {!terlipat && m.href === "/notifikasi" && belumDibaca ? (
                <span
                  className="rounded-full px-1.5 text-[11px] font-medium"
                  style={{ background: "var(--status-progress)" }}
                >
                  {belumDibaca}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {!terlipat ? (
        <div className="mt-auto pt-6 text-[11px] opacity-60">
          {PERAN_LABEL[role] ?? role}
        </div>
      ) : null}
    </aside>
  );
}
