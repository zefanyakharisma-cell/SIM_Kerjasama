/**
 * Periode Kerja Sama as "[n] Tahun [n] Bulan" (Revisi V6 §3). The form takes
 * two numbers; storage stays the one text column, so every reader of
 * periode_kerjasama keeps working unchanged.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * The cutoff date of the "Akan Berakhir" window: today plus `expiring_soon_months`
 * from settings, never a hardcoded number (DR-04). One reader for both the
 * dashboard counter and the Sisa Hari colour on Cari Kerja Sama, so the two can
 * never disagree about what "akan berakhir" means.
 *
 * setMonth alone overflows — 31 Agustus + 6 bulan normalises to 3 Maret and
 * shifts the window by up to three days — so the day is clamped to the last day
 * of the target month.
 */
export async function batasAkanBerakhir(supabase: SupabaseClient): Promise<Date> {
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["expiring_soon_months"]);
  const bulan = Number(
    data?.find((p) => p.key === "expiring_soon_months")?.value ?? 6,
  );
  const batas = new Date();
  const hari = batas.getDate();
  batas.setDate(1);
  batas.setMonth(batas.getMonth() + bulan);
  const akhirBulan = new Date(batas.getFullYear(), batas.getMonth() + 1, 0).getDate();
  batas.setDate(Math.min(hari, akhirBulan));
  return batas;
}

/** Reads a stored value (including old free text like "5 tahun") back into the two fields. */
export function uraiPeriode(teks: string | null | undefined): { tahun: string; bulan: string } {
  const s = teks ?? "";
  return {
    tahun: /(\d+)\s*tahun/i.exec(s)?.[1] ?? "",
    bulan: /(\d+)\s*bulan/i.exec(s)?.[1] ?? "",
  };
}
