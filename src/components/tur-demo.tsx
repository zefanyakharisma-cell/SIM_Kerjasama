"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BAB_UMUM, babUntuk, type Bab, type Langkah } from "@/lib/tur";

/**
 * "Mode Tutorial": a guided tour that walks a new user through every menu,
 * component and button, one popup at a time (content in lib/tur.ts).
 *
 * While the mode is on, each page plays its own chapter the first time it is
 * opened; the shell chapter (menu, account, bell) plays once before the
 * first one. The mode, the chapters already seen and whether the welcome card
 * was shown live in localStorage — a per-browser convenience, so every access
 * is wrapped: a blocked storage only means the tour asks again.
 */

const KUNCI_AKTIF = "simks-tur-aktif";
const KUNCI_DILIHAT = "simks-tur-dilihat";
const KUNCI_SAMBUTAN = "simks-tur-sambutan";

const baca = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const tulis = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage blocked: the tour just forgets */
  }
};
const dilihat = (): string[] => {
  try {
    const v = JSON.parse(baca(KUNCI_DILIHAT) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const tandaiDilihat = (id: string) => {
  const kini = dilihat();
  if (!kini.includes(id)) tulis(KUNCI_DILIHAT, JSON.stringify([...kini, id]));
};

/** The first on-screen element for a target; hidden copies (drawer, aside) don't count. */
function cariTarget(target: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

type Konteks = {
  aktif: boolean;
  ubahAktif: (v: boolean) => void;
  ulangi: () => void;
  adaTurHalaman: boolean;
};

const TurKonteks = createContext<Konteks | null>(null);

type Jalan = {
  nomor: number; // remounts the card when a tour is restarted on the same page
  bab: { judul: string; id: string }[];
  langkah: (Langkah & { bab: string })[];
};

export function TurProvider({ peran, children }: { peran: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [aktif, setAktif] = useState(false);
  const [sambutan, setSambutan] = useState(false);
  const [jalan, setJalan] = useState<Jalan | null>(null);

  // Read storage after mount, so the server and first client render agree.
  useEffect(() => {
    setAktif(baca(KUNCI_AKTIF) === "1");
    if (baca(KUNCI_SAMBUTAN) === null) setSambutan(true);
  }, []);

  // Only the steps this role sees whose element is on this screen right now —
  // called once the page has painted, so the counter never promises a step
  // that will be skipped.
  const susun = useCallback(
    (daftar: Bab[]): Jalan | null => {
      const langkah = daftar.flatMap((b) =>
        b.langkah
          .filter((l) => !l.peran || (l.peran as string[]).includes(peran))
          .filter((l) => !l.target || cariTarget(l.target))
          .map((l) => ({ ...l, bab: b.judul })),
      );
      const bab = daftar.filter((b) => langkah.some((l) => l.bab === b.judul));
      return langkah.length
        ? { nomor: Date.now(), bab: bab.map((b) => ({ id: b.id, judul: b.judul })), langkah }
        : null;
    },
    [peran],
  );

  const mulai = useCallback(
    (paksa: boolean) => {
      const halaman = babUntuk(pathname);
      const sudah = dilihat();
      const daftar: Bab[] = [];
      if (!sudah.includes(BAB_UMUM.id) && !paksa) daftar.push(BAB_UMUM);
      if (halaman && (paksa || !sudah.includes(halaman.id))) daftar.push(halaman);
      if (!daftar.length) return;
      const j = susun(daftar);
      if (j) setJalan(j);
      // Nothing of the chapter is on this screen: don't offer it again.
      else daftar.forEach((b) => tandaiDilihat(b.id));
    },
    [pathname, susun],
  );

  // Each page plays its chapter on first visit while the mode is on. The
  // delay lets a streamed page finish painting its targets.
  useEffect(() => {
    if (!aktif || sambutan) return;
    const t = setTimeout(() => mulai(false), 500);
    return () => clearTimeout(t);
  }, [aktif, sambutan, pathname, mulai]);

  // A new page cancels a tour still open on the old one.
  useEffect(() => setJalan(null), [pathname]);

  const ubahAktif = useCallback((v: boolean) => {
    setAktif(v);
    tulis(KUNCI_AKTIF, v ? "1" : "0");
    if (v) tulis(KUNCI_DILIHAT, null); // switching on starts over
    else setJalan(null);
  }, []);

  const tutupSambutan = (ikut: boolean) => {
    tulis(KUNCI_SAMBUTAN, "1");
    setSambutan(false);
    ubahAktif(ikut);
  };

  const selesai = useCallback(() => {
    jalan?.bab.forEach((b) => tandaiDilihat(b.id));
    setJalan(null);
  }, [jalan]);

  return (
    <TurKonteks.Provider
      value={{ aktif, ubahAktif, ulangi: () => mulai(true), adaTurHalaman: babUntuk(pathname) !== null }}
    >
      {children}
      {sambutan ? <Sambutan onPilih={tutupSambutan} /> : null}
      {jalan ? <Sorotan key={jalan.nomor} jalan={jalan} onSelesai={selesai} /> : null}
    </TurKonteks.Provider>
  );
}

export const useTur = () => useContext(TurKonteks);

// ------------------------------------------------------------------ Welcome

function Sambutan({ onPilih }: { onPilih: (ikut: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="tur-sambutan-judul"
      onCancel={(e) => {
        e.preventDefault();
        onPilih(false);
      }}
      className="w-[calc(100%-2rem)] max-w-md rounded-xl border bg-white p-6 backdrop:bg-black/50"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-full text-lg text-white"
        style={{ background: "var(--midnight)" }}
        aria-hidden="true"
      >
        ?
      </div>
      <h2 id="tur-sambutan-judul" className="text-base font-semibold" style={{ color: "var(--midnight)" }}>
        Baru pertama kali di SIM Kerja Sama?
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        Ikuti tur singkat yang menjelaskan setiap menu, komponen dan tombol, langkah demi
        langkah. Anda bisa menyalakan atau mematikannya kapan saja lewat sakelar{" "}
        <strong>Mode Tutorial</strong> di menu samping.
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onPilih(false)}
          className="rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          Nanti saja
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => onPilih(true)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--midnight)" }}
        >
          Mulai tur
        </button>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------- Spotlight

const JARAK = 12; // gap between the highlighted element and the card
const LEBAR_KARTU = 340;
const TEPI = 16;
const PADDING = 6; // the cut-out is a little larger than its element

type Kotak = { top: number; left: number; width: number; height: number };

function Sorotan({ jalan, onSelesai }: { jalan: Jalan; onSelesai: () => void }) {
  const [i, setI] = useState(0);
  const [arah, setArah] = useState<1 | -1>(1);
  const [kotak, setKotak] = useState<Kotak | null>(null);
  const [siap, setSiap] = useState(false);
  const [tinggiKartu, setTinggiKartu] = useState(200);
  const elRef = useRef<HTMLElement | null>(null);
  const kartuRef = useRef<HTMLDivElement>(null);
  const lanjutRef = useRef<HTMLButtonElement>(null);
  const langkah = jalan.langkah[i];

  // Resolve the step's element. It was on screen when the tour was built; if
  // it has gone since (a resize swapped desktop for mobile), look for a short
  // while, then move on in the direction the user was going.
  useEffect(() => {
    setSiap(false);
    elRef.current = null;
    if (!langkah.target) {
      setKotak(null);
      setSiap(true);
      return;
    }
    let batal = false;
    const mulai = performance.now();
    const cari = () => {
      if (batal) return;
      const el = cariTarget(langkah.target!);
      if (el) {
        elRef.current = el;
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        // Measure after the smooth scroll has had time to settle.
        setTimeout(() => {
          if (batal) return;
          ukur();
          setSiap(true);
        }, 350);
        return;
      }
      if (performance.now() - mulai < 700) {
        requestAnimationFrame(cari);
        return;
      }
      const berikut = i + arah;
      if (berikut >= jalan.langkah.length) onSelesai();
      else if (berikut < 0) {
        setKotak(null);
        setSiap(true); // nothing before it: show the card centred instead
      } else setI(berikut);
    };
    cari();
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, langkah]);

  const ukur = () => {
    const el = elRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setKotak({
      top: r.top - PADDING,
      left: r.left - PADDING,
      width: r.width + PADDING * 2,
      height: r.height + PADDING * 2,
    });
  };

  // Follow the element through scrolling and resizing.
  useEffect(() => {
    const ikuti = () => requestAnimationFrame(ukur);
    window.addEventListener("resize", ikuti);
    window.addEventListener("scroll", ikuti, true);
    return () => {
      window.removeEventListener("resize", ikuti);
      window.removeEventListener("scroll", ikuti, true);
    };
  }, []);

  useEffect(() => {
    if (!siap) return;
    lanjutRef.current?.focus({ preventScroll: true });
    if (kartuRef.current) setTinggiKartu(kartuRef.current.offsetHeight);
  }, [siap, i]);

  const terakhir = i === jalan.langkah.length - 1;
  const maju = () => {
    if (terakhir) return onSelesai();
    setArah(1);
    setI(i + 1);
  };
  const mundur = () => {
    if (i === 0) return;
    setArah(-1);
    setI(i - 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSelesai();
      } else if (e.key === "ArrowRight") maju();
      else if (e.key === "ArrowLeft") mundur();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Below the element when it fits, else above, else pinned to the bottom.
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const lebar = Math.min(LEBAR_KARTU, vw - TEPI * 2);
  let posisi: React.CSSProperties;
  if (!kotak) {
    posisi = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else {
    const kiri = Math.min(Math.max(kotak.left + kotak.width / 2 - lebar / 2, TEPI), vw - lebar - TEPI);
    const bawah = kotak.top + kotak.height + JARAK;
    const atas = kotak.top - JARAK - tinggiKartu;
    // A tall, narrow target (the sidebar) has no room above or below: sit beside it.
    const kanan = kotak.left + kotak.width + JARAK;
    if (bawah + tinggiKartu <= vh - TEPI) posisi = { top: bawah, left: kiri };
    else if (atas >= TEPI) posisi = { top: atas, left: kiri };
    else if (kanan + lebar <= vw - TEPI)
      posisi = { top: Math.min(Math.max(kotak.top, TEPI), vh - tinggiKartu - TEPI), left: kanan };
    else posisi = { bottom: TEPI, left: kiri };
  }

  const nomorBab = jalan.langkah.slice(0, i + 1).filter((l, k, a) => k === 0 || l.bab !== a[k - 1].bab).length;

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      {/* Swallows clicks so the page underneath can't be used mid-tour. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {kotak ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl transition-all duration-300"
          style={{
            ...kotak,
            boxShadow: "0 0 0 9999px rgba(10, 20, 35, 0.6)",
            outline: "2px solid rgba(255,255,255,0.9)",
            opacity: siap ? 1 : 0,
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(10, 20, 35, 0.6)" }} aria-hidden="true" />
      )}

      <div
        ref={kartuRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tur-judul"
        aria-describedby="tur-isi"
        className="fixed rounded-xl border bg-white p-4 shadow-2xl transition-opacity duration-200"
        style={{ ...posisi, width: lebar, borderColor: "var(--border)", opacity: siap ? 1 : 0 }}
      >
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide">
          <span style={{ color: "var(--status-progress-strong)" }}>
            {jalan.bab.length > 1 ? `${nomorBab}/${jalan.bab.length} · ` : ""}
            {langkah.bab}
          </span>
          <span style={{ color: "var(--text-muted)" }} aria-live="polite">
            {i + 1} dari {jalan.langkah.length}
          </span>
        </div>
        <h2 id="tur-judul" className="text-base font-semibold" style={{ color: "var(--midnight)" }}>
          {langkah.judul}
        </h2>
        <p id="tur-isi" className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {langkah.isi}
        </p>

        <div className="mt-3 h-1 overflow-hidden rounded-full" style={{ background: "var(--surface-sunk)" }}>
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${((i + 1) / jalan.langkah.length) * 100}%`, background: "var(--midnight)" }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSelesai}
            className="rounded-lg px-2 py-1.5 text-xs underline"
            style={{ color: "var(--text-secondary)" }}
          >
            Lewati
          </button>
          <span className="flex gap-2">
            {i > 0 ? (
              <button
                type="button"
                onClick={mundur}
                className="rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Kembali
              </button>
            ) : null}
            <button
              ref={lanjutRef}
              type="button"
              onClick={maju}
              className="rounded-lg px-4 py-1.5 text-sm font-medium text-white"
              style={{ background: "var(--midnight)" }}
            >
              {terakhir ? "Selesai" : "Lanjut"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Toggle

/** The sidebar switch. `lipat` is the collapsed icon-only sidebar. */
export function SakelarTur({ lipat, onUbah }: { lipat: boolean; onUbah?: () => void }) {
  const tur = useTur();
  if (!tur) return null;
  const { aktif, ubahAktif, ulangi, adaTurHalaman } = tur;
  const ganti = () => {
    onUbah?.();
    ubahAktif(!aktif);
  };

  if (lipat) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={aktif}
        onClick={ganti}
        title={`Mode Tutorial: ${aktif ? "aktif" : "mati"}`}
        data-tour="tur"
        className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold hover:bg-white/10"
        style={aktif ? { background: "rgba(255,255,255,0.14)" } : undefined}
      >
        ?<span className="sr-only">Mode Tutorial</span>
      </button>
    );
  }

  return (
    <div data-tour="tur" className="rounded-lg bg-white/5 p-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={aktif}
        onClick={ganti}
        className="flex w-full items-center justify-between gap-3 text-left text-sm"
      >
        <span>
          <span className="block font-medium">Mode Tutorial</span>
          <span className="block text-[11px] opacity-75">Panduan langkah demi langkah</span>
        </span>
        <span
          aria-hidden="true"
          className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
          style={{ background: aktif ? "var(--status-active)" : "rgba(255,255,255,0.25)" }}
        >
          <span
            className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]"
            style={{ left: aktif ? 18 : 2 }}
          />
        </span>
      </button>
      {aktif && adaTurHalaman ? (
        <button
          type="button"
          onClick={() => {
            onUbah?.();
            ulangi();
          }}
          className="mt-2 text-xs underline opacity-90 hover:opacity-100"
        >
          Ulangi tur halaman ini
        </button>
      ) : null}
    </div>
  );
}
