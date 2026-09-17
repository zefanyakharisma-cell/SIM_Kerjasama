import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The lists, their per-column filters, and the three exports (PRD §8.4,
 * Design §4.5).
 *
 * One definition, three consumers. The export button promises to export "what
 * I am looking at", and the only way to keep that promise is for the export and
 * the on-screen list to build the identical query — so both call
 * `terapkanFilter` here, and the export differs only in taking every page
 * instead of one.
 */

export const TAB = {
  aktif: "Kerja Sama Aktif",
  proposal: "Proposal Kerja Sama",
  disetujui: "Disetujui",
  berakhir: "Akan Berakhir",
  pembaruan: "Pembaruan",
  arsip: "Arsip",
} as const;

export type TabKey = keyof typeof TAB;

export const adalahTab = (v: string | undefined): v is TabKey =>
  Boolean(v && v in TAB);

const STATUS_PROPOSAL = [
  "Draft",
  "Diajukan",
  "Diproses",
  "Disposisi - Tier 1",
  "Disposisi - Tier 2",
  "Disposisi - Tier 3",
  "Pending",
];

/**
 * Every field gets a column filter control (Design §4.5). Keeping them in one
 * table means the header row, the query and the export header all iterate the
 * same list and cannot drift apart.
 */
export const KOLOM = [
  { kunci: "no_dokumen", label: "No. Dokumen", jenis: "teks" },
  { kunci: "nama_mitra", label: "Mitra", jenis: "teks" },
  { kunci: "jenis_kerjasama", label: "Jenis", jenis: "pilih", opsi: ["MoU", "MoA"] },
  { kunci: "status_tampil", label: "Status", jenis: "teks" },
  { kunci: "unit_pengusul", label: "Unit Pengusul", jenis: "teks" },
  { kunci: "negara", label: "Negara", jenis: "teks" },
] as const;

export type Filter = Record<string, string>;

/** Pulls the filter values out of the URL, so filter state survives a reload. */
export function bacaFilter(sp: Record<string, string | string[] | undefined>): Filter {
  const f: Filter = {};
  for (const k of KOLOM) {
    const v = sp[`f_${k.kunci}`];
    if (typeof v === "string" && v.trim()) f[k.kunci] = v.trim();
  }
  for (const k of ["dari", "sampai"]) {
    const v = sp[`f_${k}`];
    if (typeof v === "string" && v.trim()) f[k] = v.trim();
  }
  return f;
}

export function kueriDariFilter(f: Filter): string {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => p.set(`f_${k}`, v));
  return p.toString();
}

/**
 * Tab scope plus column filters, applied to `v_daftar_dokumen`.
 *
 * The tab is the list's natural scope and the status filter narrows within it;
 * there is no global archive toggle, because the archive is one tab among the
 * others (PRD §8.2).
 */
export function terapkanFilter(q: any, tab: TabKey, f: Filter) {
  switch (tab) {
    case "aktif":
      q = q.eq("status_dokumen", "Aktif");
      break;
    case "proposal":
      q = q.in("status_proposal", STATUS_PROPOSAL).is("status_dokumen", null);
      break;
    case "disetujui":
      q = q.eq("status_proposal", "Disetujui").is("status_dokumen", null);
      break;
    case "berakhir":
      // Auto Renewed carries no end date, so it is absent here by construction
      // rather than by a special case (BR-11).
      q = q.eq("status_dokumen", "Akan Berakhir").not("tanggal_berakhir", "is", null);
      break;
    case "pembaruan":
      q = q.eq("is_perpanjangan", true);
      break;
    case "arsip":
      q = q.in("status_dokumen", ["Diarsipkan", "Kedaluarsa"]);
      break;
  }

  for (const k of KOLOM) {
    const v = f[k.kunci];
    if (!v) continue;
    q = k.jenis === "pilih" ? q.eq(k.kunci, v) : q.ilike(k.kunci, `%${v}%`);
  }

  const patokan = tab === "berakhir" ? "tanggal_berakhir" : "waktu_proposal_dokumen";
  if (f.dari) q = q.gte(patokan, f.dari);
  if (f.sampai) q = q.lte(patokan, f.sampai);

  return q;
}

export const PER_HALAMAN = 25;

/** One page of a tab. Pagination is server-side; 2,000+ documents is the target. */
export async function ambilHalaman(
  supabase: SupabaseClient,
  tab: TabKey,
  f: Filter,
  halaman: number,
) {
  const dari = (halaman - 1) * PER_HALAMAN;
  const q = terapkanFilter(
    supabase.from("v_daftar_dokumen").select("*", { count: "exact" }),
    tab,
    f,
  )
    .order("id_proposal", { ascending: false })
    .range(dari, dari + PER_HALAMAN - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(`Daftar gagal dimuat: ${error.message}`);
  return { baris: data ?? [], total: count ?? 0 };
}

/**
 * CSV rather than a binary workbook, deliberately: Excel opens this natively,
 * and the alternative is a zip-and-XML dependency for the same columns. The BOM
 * is what stops Excel mangling "Universität" on a Windows machine.
 */
export function keCsv(baris: Record<string, unknown>[], kolom: string[][]): string {
  const sel = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const kepala = kolom.map(([, label]) => sel(label)).join(",");
  const isi = baris.map((r) => kolom.map(([k]) => sel(r[k])).join(","));
  return "﻿" + [kepala, ...isi].join("\r\n");
}
