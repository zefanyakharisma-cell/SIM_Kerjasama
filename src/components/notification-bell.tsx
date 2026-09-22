"use client";

import Link from "next/link";

/**
 * Floating notification bell (Revisi V8 §4) — Notifikasi is no longer a
 * sidebar row; this fixed button sits over every authenticated page instead,
 * with a red badge so an unread count is impossible to miss.
 */
export function NotificationBell({ belumDibaca }: { belumDibaca: number }) {
  return (
    <Link
      href="/notifikasi"
      aria-label={
        belumDibaca > 0
          ? `Notifikasi, ${belumDibaca} belum dibaca`
          : "Notifikasi"
      }
      className="fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition hover:scale-105 md:right-6 md:top-5"
      style={{ background: "var(--midnight)", color: "white" }}
    >
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
      >
        <path d="M5 8a5 5 0 0 1 10 0c0 5 2 6 2 6H3s2-1 2-6zM8.5 17a1.5 1.5 0 0 0 3 0" />
      </svg>
      {belumDibaca > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold text-white ring-2 ring-white"
          style={{ background: "var(--sla-red)" }}
        >
          {belumDibaca > 99 ? "99+" : belumDibaca}
        </span>
      ) : null}
    </Link>
  );
}
