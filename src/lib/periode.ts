/**
 * Periode Kerja Sama as "[n] Tahun [n] Bulan" (Revisi V6 §3). The form takes
 * two numbers; storage stays the one text column, so every reader of
 * periode_kerjasama keeps working unchanged.
 */

const bulat = (v: unknown, maks: number): number => {
  const n = Math.trunc(Number(String(v ?? "").trim() || 0));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), maks) : 0;
};

/** "5 Tahun 6 Bulan"; zero parts dropped; null when both are empty or zero. */
export function susunPeriode(tahun: unknown, bulan: unknown): string | null {
  const t = bulat(tahun, 99);
  const b = bulat(bulan, 11);
  const bagian = [t ? `${t} Tahun` : "", b ? `${b} Bulan` : ""].filter(Boolean);
  return bagian.length ? bagian.join(" ") : null;
}

/** Reads a stored value (including old free text like "5 tahun") back into the two fields. */
export function uraiPeriode(teks: string | null | undefined): { tahun: string; bulan: string } {
  const s = teks ?? "";
  return {
    tahun: /(\d+)\s*tahun/i.exec(s)?.[1] ?? "",
    bulan: /(\d+)\s*bulan/i.exec(s)?.[1] ?? "",
  };
}
