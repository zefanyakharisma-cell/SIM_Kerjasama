import Link from "next/link";

/**
 * The one "Buat Kerja Sama" menu, two ways in (client revision 2026-09-21).
 * KUI chooses between a proposal that goes through approval and an
 * already-signed document recorded directly; other roles only ever propose,
 * so they never see this.
 */
const PILIHAN = [
  {
    href: "/buat",
    judul: "Ajukan untuk approval",
    isi: "Kerja sama baru: diajukan, didisposisi, lalu disetujui sebelum aktif.",
  },
  {
    href: "/catat",
    judul: "Sudah ditandatangani — catat langsung",
    isi: "Dokumen yang sudah bertanda tangan: langsung aktif tanpa approval.",
  },
] as const;

export function PilihanBuat({ aktif }: { aktif: "/buat" | "/catat" }) {
  return (
    <nav aria-label="Jenis pembuatan" className="mb-5 grid gap-2 sm:grid-cols-2">
      {PILIHAN.map((p) => {
        const dipilih = p.href === aktif;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={dipilih ? "page" : undefined}
            className="rounded-xl border-2 bg-white p-3"
            style={{ borderColor: dipilih ? "var(--midnight)" : "var(--border)" }}
          >
            <span className="block text-sm font-semibold" style={{ color: "var(--midnight)" }}>
              {p.judul}
            </span>
            <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
              {p.isi}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
