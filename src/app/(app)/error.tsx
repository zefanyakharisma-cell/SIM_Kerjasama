"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary for the app pages. The raw message goes to the console, never
 * the screen: it can carry database detail users should not see and cannot act on.
 */
export default function Galat({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[simks] halaman gagal dimuat:", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto max-w-lg rounded-xl border bg-white p-6"
      style={{ borderColor: "var(--border)" }}
    >
      <h1 className="text-base font-semibold" style={{ color: "var(--midnight)" }}>
        Halaman ini gagal dimuat
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        Terjadi kesalahan saat memuat data. Silakan coba lagi; bila masalah
        berlanjut, hubungi Kantor Kerja Sama dan Urusan Internasional.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--midnight)" }}
        >
          Coba lagi
        </button>
        <Link href="/dashboard" className="text-sm underline" style={{ color: "var(--text-secondary)" }}>
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
