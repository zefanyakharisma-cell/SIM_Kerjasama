/**
 * Master Data's table whitelist (Revisi V6 §2). A form names a key from here,
 * never a table, so a posted value can only ever reach these tables. Every
 * one carries is_active, so a value still referenced by a proposal is retired
 * instead of deleted (BR-23).
 */

/** The single-column lookup lists the proposal form picks from. */
export const DAFTAR = {
  tujuan: { tabel: "tujuan_kerjasama", kolom: "nilai", label: "Tujuan" },
  manfaat_mitra: { tabel: "manfaat_mitra", kolom: "nilai", label: "Manfaat Mitra" },
  manfaat_petra: { tabel: "manfaat_petra", kolom: "nilai", label: "Manfaat Petra" },
  bidang: { tabel: "bidang_kerjasama", kolom: "nama", label: "Bidang Kerja Sama" },
  agenda: { tabel: "agenda", kolom: "nama", label: "Agenda Kerja Sama" },
  jenis_mitra: { tabel: "jenis_mitra", kolom: "nama", label: "Jenis Mitra" },
} as const;
export type DaftarKey = keyof typeof DAFTAR;

/** Every table Master Data may write, keyed by its tab. */
export const TABEL = {
  mitra: "partner",
  jabatan: "jabatan",
  pegawai: "pegawai",
  unit: "unit",
  negara: "negara",
  ...Object.fromEntries(Object.entries(DAFTAR).map(([k, d]) => [k, d.tabel])),
} as Record<"mitra" | "jabatan" | "pegawai" | "unit" | "negara" | DaftarKey, string>;
export type TabelKey = keyof typeof TABEL;

export const adalahTabel = (v: unknown): v is TabelKey =>
  typeof v === "string" && Object.hasOwn(TABEL, v);
export const adalahDaftar = (v: unknown): v is DaftarKey =>
  typeof v === "string" && Object.hasOwn(DAFTAR, v);
