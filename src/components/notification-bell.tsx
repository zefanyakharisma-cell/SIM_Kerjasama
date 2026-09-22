"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  JUDUL_NOTIFIKASI,
  WARNA_NOTIFIKASI,
  tautanNotifikasi,
  waktuNotifikasi,
  type Notifikasi,
} from "@/lib/notifikasi";
import { ambilNotifikasi, tandaiSemuaTerbaca } from "@/lib/actions/notifikasi";

/**
 * The floating notification bell (Revisi V8 §4), built like iOS' AssistiveTouch
 * button: it sits above every page, can be dragged anywhere, snaps to whichever
 * side of the screen it was released nearest, and stays where it was left.
 *
 * Tapping it opens the inbox as a popup rather than navigating — the list is
 * fetched only when it is actually opened, so no other page load pays for it.
 * /notifikasi still exists as a full page for a direct link, and renders the
 * same rows from the same helpers (see lib/notifikasi.ts).
 */

const UKURAN = 48; // comfortably past iOS' 44pt minimum touch target
const TEPI = 12; // breathing room from the screen edge
const JARAK = 8; // gap between the button and its popup
const MIN_PANEL = 200; // below this a panel is a useless sliver
const AMBANG_SERET = 5; // px of travel before a tap is treated as a drag
const KUNCI = "simks-posisi-lonceng";

/** Where the popup sits so it never covers the button that opened it. */
type Panel = { atas?: number; bawah?: number; tinggiMaks: number };

type Posisi = { sisi: "kiri" | "kanan"; y: number };
const AWAL: Posisi = { sisi: "kanan", y: 84 };

type Seret = {
  px: number; // pointer position when the drag started
  py: number;
  x: number; // button position when the drag started
  y: number;
  cx: number; // where it has been dragged to
  cy: number;
  geser: boolean;
};

const tinggiLayar = () => (typeof window === "undefined" ? 800 : window.innerHeight);
const jepitY = (y: number) => Math.min(Math.max(y, TEPI), tinggiLayar() - UKURAN - TEPI);

export function NotificationBell({ belumDibaca }: { belumDibaca: number }) {
  const router = useRouter();
  const [posisi, setPosisi] = useState<Posisi>(AWAL);
  const [seret, setSeret] = useState<{ x: number; y: number } | null>(null);
  const [buka, setBuka] = useState(false);
  const [panel, setPanel] = useState<Panel>({ atas: TEPI, tinggiMaks: 400 });
  const [daftar, setDaftar] = useState<Notifikasi[] | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [menandai, setMenandai] = useState(false);
  const [belum, setBelum] = useState(belumDibaca);
  const gerakan = useRef<Seret | null>(null);
  // A drag ends with a click event too; this swallows that one so releasing
  // the button after moving it does not also open the panel.
  const abaikanKlik = useRef(false);

  // The server's count wins whenever the shell re-renders.
  useEffect(() => setBelum(belumDibaca), [belumDibaca]);

  // Restore where the button was left. In an effect rather than in the initial
  // state, so the server render and the first client render still agree.
  useEffect(() => {
    try {
      const simpan = localStorage.getItem(KUNCI);
      if (!simpan) return;
      const p = JSON.parse(simpan) as Posisi;
      if ((p.sisi === "kiri" || p.sisi === "kanan") && Number.isFinite(p.y)) {
        setPosisi({ sisi: p.sisi, y: jepitY(p.y) });
      }
    } catch {
      // Private window, cleared or blocked storage: the default corner is fine.
    }
  }, []);

  // A rotated phone must not leave the button stranded off-screen.
  useEffect(() => {
    const ukur = () => setPosisi((p) => ({ ...p, y: jepitY(p.y) }));
    window.addEventListener("resize", ukur);
    return () => window.removeEventListener("resize", ukur);
  }, []);

  useEffect(() => {
    if (!buka) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBuka(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [buka]);

  function bukaPanel(nilai: boolean, dari: Posisi) {
    setBuka(nilai);
    if (!nilai) return;

    // Sit the panel below the button, or above it when there is more room
    // there — never over it, or the popup hides the thing that opened it.
    const vh = tinggiLayar();
    const maks = vh * 0.7;
    const ruangBawah = vh - (dari.y + UKURAN + JARAK) - TEPI;
    const ruangAtas = dari.y - JARAK - TEPI;
    setPanel(
      ruangBawah >= Math.min(MIN_PANEL, maks) || ruangBawah >= ruangAtas
        ? { atas: dari.y + UKURAN + JARAK, tinggiMaks: Math.max(MIN_PANEL, Math.min(maks, ruangBawah)) }
        : { bawah: vh - dari.y + JARAK, tinggiMaks: Math.max(MIN_PANEL, Math.min(maks, ruangAtas)) },
    );

    setMemuat(true);
    ambilNotifikasi()
      .then(setDaftar)
      .finally(() => setMemuat(false));
  }

  function turun(e: React.PointerEvent<HTMLButtonElement>) {
    const kotak = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    gerakan.current = {
      px: e.clientX,
      py: e.clientY,
      x: kotak.left,
      y: kotak.top,
      cx: kotak.left,
      cy: kotak.top,
      geser: false,
    };
  }

  function gerak(e: React.PointerEvent<HTMLButtonElement>) {
    const g = gerakan.current;
    if (!g) return;
    const dx = e.clientX - g.px;
    const dy = e.clientY - g.py;
    if (!g.geser && Math.abs(dx) + Math.abs(dy) > AMBANG_SERET) g.geser = true;
    if (!g.geser) return;
    g.cx = g.x + dx;
    g.cy = g.y + dy;
    setSeret({ x: g.cx, y: g.cy });
  }

  function naik() {
    const g = gerakan.current;
    gerakan.current = null;
    setSeret(null);
    if (!g) return;

    // Opening is handled in onClick, not here: keyboard activation of a button
    // fires `click` and no pointer events at all, so a pointer-only bell is
    // unreachable by keyboard — and it is the only way into the inbox now that
    // Notifikasi has left the sidebar (V8 §4).
    if (!g.geser) return; // a tap: let the click through

    abaikanKlik.current = true;
    // Snap to whichever edge it was released nearest, the way iOS does.
    const sisi: Posisi["sisi"] =
      g.cx + UKURAN / 2 < window.innerWidth / 2 ? "kiri" : "kanan";
    const p: Posisi = { sisi, y: jepitY(g.cy) };
    setPosisi(p);
    try {
      localStorage.setItem(KUNCI, JSON.stringify(p));
    } catch {
      // Not being able to remember the spot is not worth failing over.
    }
  }

  async function tandai() {
    setMenandai(true);
    await tandaiSemuaTerbaca();
    const kini = new Date().toISOString();
    setDaftar((d) => d?.map((n) => (n.waktu_dibaca ? n : { ...n, waktu_dibaca: kini })) ?? d);
    setBelum(0);
    setMenandai(false);
    router.refresh();
  }

  // A cancelled gesture (a phone call, a system swipe) is not followed by a
  // click, so it must not arm abaikanKlik or the next activation is eaten.
  function batal() {
    gerakan.current = null;
    setSeret(null);
  }

  function klik() {
    if (abaikanKlik.current) {
      abaikanKlik.current = false; // this click closed a drag, not a tap
      return;
    }
    bukaPanel(!buka, posisi);
  }

  const gayaTombol: React.CSSProperties = seret
    ? { left: seret.x, top: seret.y, height: UKURAN, width: UKURAN }
    : {
        top: posisi.y,
        height: UKURAN,
        width: UKURAN,
        ...(posisi.sisi === "kiri" ? { left: TEPI } : { right: TEPI }),
      };

  // Fades back like AssistiveTouch when idle — but never while something is
  // still unread, because the badge is the whole point (V8 §4).
  const redup = !buka && !seret && belum === 0;

  return (
    <>
      <button
        type="button"
        onPointerDown={turun}
        onPointerMove={gerak}
        onPointerUp={naik}
        onPointerCancel={batal}
        onClick={klik}
        aria-label={belum > 0 ? `Notifikasi, ${belum} belum dibaca` : "Notifikasi"}
        aria-expanded={buka}
        className={`fixed z-50 flex touch-none select-none items-center justify-center rounded-full text-white shadow-lg backdrop-blur transition-[opacity,transform] ${
          seret ? "scale-110 cursor-grabbing" : "cursor-grab hover:scale-105"
        }`}
        style={{
          ...gayaTombol,
          background: "color-mix(in srgb, var(--midnight) 88%, transparent)",
          opacity: redup ? 0.6 : 1,
          // No transition while dragging, or the button lags behind the finger.
          transitionDuration: seret ? "0ms" : "200ms",
        }}
      >
        <svg
          width="21"
          height="21"
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
        {belum > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold text-white ring-2 ring-white"
            style={{ background: "var(--sla-red)" }}
          >
            {belum > 99 ? "99+" : belum}
          </span>
        ) : null}
      </button>

      {buka ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setBuka(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Notifikasi"
            className="fixed z-50 flex w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl"
            style={{
              ...(posisi.sisi === "kiri" ? { left: TEPI } : { right: TEPI }),
              ...(panel.atas !== undefined ? { top: panel.atas } : { bottom: panel.bawah }),
              maxHeight: panel.tinggiMaks,
              borderColor: "var(--border)",
            }}
          >
            <header
              className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="min-w-0">
                <h2 className="text-sm font-semibold" style={{ color: "var(--midnight)" }}>
                  Notifikasi
                </h2>
                <p className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                  Ditujukan ke jabatan Anda, bukan ke perorangan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBuka(false)}
                aria-label="Tutup notifikasi"
                className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg hover:bg-black/5"
                style={{ color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {memuat && daftar === null ? (
                <p className="p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  Memuat…
                </p>
              ) : (daftar ?? []).length === 0 ? (
                <p className="p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                  Belum ada notifikasi.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {(daftar ?? []).map((n) => {
                    const tautan = tautanNotifikasi(n);
                    const isi = (
                      <>
                        <span className="flex items-baseline gap-2">
                          <span
                            aria-hidden
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{
                              background: n.waktu_dibaca
                                ? "transparent"
                                : (WARNA_NOTIFIKASI[n.jenis_notifikasi] ??
                                  "var(--status-progress)"),
                            }}
                          />
                          <span className="text-sm font-medium">
                            {JUDUL_NOTIFIKASI[n.jenis_notifikasi] ?? n.jenis_notifikasi}
                          </span>
                        </span>
                        {n.isi ? (
                          <span
                            className="mt-0.5 block whitespace-pre-line pl-3.5 text-sm"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {n.isi}
                          </span>
                        ) : null}
                        <span
                          className="mt-0.5 block pl-3.5 text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {waktuNotifikasi(n.waktu_kirim)}
                        </span>
                      </>
                    );
                    const kelas = "block rounded-xl border p-3";
                    const gaya = {
                      borderColor: n.waktu_dibaca ? "var(--border)" : "var(--midnight)",
                    };

                    return (
                      <li key={n.id}>
                        {tautan ? (
                          <Link
                            href={tautan as Route}
                            onClick={() => setBuka(false)}
                            className={`${kelas} hover:bg-black/5`}
                            style={gaya}
                          >
                            {isi}
                          </Link>
                        ) : (
                          <div className={kelas} style={gaya}>
                            {isi}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {belum > 0 ? (
              <footer
                className="shrink-0 border-t p-2"
                style={{ borderColor: "var(--border)" }}
              >
                <button
                  type="button"
                  onClick={tandai}
                  disabled={menandai}
                  className="w-full rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-60"
                  style={{ borderColor: "var(--border)" }}
                >
                  {menandai ? "Menandai…" : `Tandai semua terbaca (${belum})`}
                </button>
              </footer>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
