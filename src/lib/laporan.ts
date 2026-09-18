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
  Boolean(v && Object.hasOwn(TAB, v));

/**
 * 'Akan Berakhir' is still a live, in-force agreement — only the daily sweep
 * moved it out of 'Aktif' because the end date is near. Anything that asks
 * "is this document still active" reuses this list instead of a bare
 * `=== "Aktif"` literal.
 */
export const STATUS_DOKUMEN_AKTIF = ["Aktif", "Akan Berakhir"] as const;

/** Escapes `%`, `_` and `\` so a user-entered value is literal inside `ilike`. */
export const lolosIlike = (v: string): string => v.replace(/[\\%_]/g, "\\$&");

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
  { kunci: "jabatan_pengusul", label: "Pengusul", jenis: "teks" },
  { kunci: "agenda", label: "Agenda Kerja Sama", jenis: "teks" },
  { kunci: "lingkup", label: "Lingkup", jenis: "teks" },
  { kunci: "negara", label: "Negara", jenis: "teks" },
] as const;

/** Sortable columns — a whitelist, so a URL value never names an arbitrary column. */
export const URUTAN = {
  id_proposal: "Terbaru dibuat",
  nama_mitra: "Nama Mitra",
  jenis_kerjasama: "Jenis",
  status_tampil: "Status",
  waktu_proposal_dokumen: "Tanggal Diajukan",
  tanggal_mulai: "Tanggal Mulai",
  tanggal_berakhir: "Tanggal Berakhir",
  sisa_hari: "Sisa Hari",
} as const;

/** The chosen sort, or newest-first when none (or an unknown one) is given. */
export function terapkanUrutan(q: any, f: Filter) {
  const kolom = f.urut && Object.hasOwn(URUTAN, f.urut) ? f.urut : "id_proposal";
  const naik = f.arah ? f.arah === "asc" : kolom !== "id_proposal";
  q = q.order(kolom, { ascending: naik, nullsFirst: false });
  // Stable paging when many rows share the sort value.
  return kolom === "id_proposal" ? q : q.order("id_proposal", { ascending: false });
}

export type Filter = Record<string, string>;

/** Pulls the filter values out of the URL, so filter state survives a reload. */
export function bacaFilter(sp: Record<string, string | string[] | undefined>): Filter {
  const f: Filter = {};
  for (const k of KOLOM) {
    const v = sp[`f_${k.kunci}`];
    if (typeof v === "string" && v.trim()) f[k.kunci] = v.trim();
  }
  for (const k of ["dari", "sampai", "urut", "arah"]) {
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
    q = k.jenis === "pilih" ? q.eq(k.kunci, v) : q.ilike(k.kunci, `%${lolosIlike(v)}%`);
  }

  const patokan = tab === "berakhir" ? "tanggal_berakhir" : "waktu_proposal_dokumen";
  if (f.dari) q = q.gte(patokan, f.dari);
  if (f.sampai) {
    // tanggal_berakhir is a DATE column, so "sampai" as its own midnight is
    // inclusive as-is. waktu_proposal_dokumen is a timestamptz, where the same
    // value means midnight *at the start* of that day — lte would silently
    // drop everything later that day, so it is bounded by the next day instead.
    if (tab === "berakhir") {
      q = q.lte(patokan, f.sampai);
    } else {
      const besok = tambahHari(f.sampai);
      if (besok) q = q.lt(patokan, besok);
    }
  }

  return q;
}

/** `tgl` + 1 day as 'YYYY-MM-DD', via pure date arithmetic (no timezone drift). Returns null if `tgl` isn't well-formed. */
function tambahHari(tgl: string): string | null {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tgl);
  if (!cocok) return null;
  const [, y, m, d] = cocok;
  const t = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(
    t.getUTCDate(),
  ).padStart(2, "0")}`;
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
  const q = terapkanUrutan(
    terapkanFilter(supabase.from("v_daftar_dokumen").select("*", { count: "exact" }), tab, f),
    f,
  ).range(dari, dari + PER_HALAMAN - 1);

  const { data, count, error } = await q;
  if (error) {
    // PGRST103: the page asked for starts past the last row (e.g. ?hal=9999).
    // That is not a broken query, just an out-of-range one — resolve the real
    // total instead of crashing the page.
    if (error.code === "PGRST103") {
      const { count: total } = await terapkanFilter(
        supabase.from("v_daftar_dokumen").select("*", { count: "exact", head: true }),
        tab,
        f,
      );
      return { baris: [], total: total ?? 0 };
    }
    throw new Error(`Daftar gagal dimuat: ${error.message}`);
  }
  return { baris: data ?? [], total: count ?? 0 };
}

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const WAKTU = /^\d{4}-\d{2}-\d{2}T/;
// Asia/Jakarta is UTC+7 with no DST. Excel cells carry no timezone, so a
// timestamp is written as Jakarta wall-clock time.
const WIB_MS = 7 * 60 * 60 * 1000;

/** One cell's value, typed so Excel sorts and filters it properly. */
function selXlsx(v: unknown): { nilai: unknown; format?: string; lebar: number } {
  if (v === null || v === undefined) return { nilai: null, lebar: 0 };
  if (typeof v === "boolean") return { nilai: v ? "Ya" : "Tidak", lebar: 5 };
  if (typeof v === "number") return { nilai: v, lebar: String(v).length };
  const s = String(v);
  if (TANGGAL.test(s)) return { nilai: new Date(`${s}T00:00:00Z`), format: "dd/mm/yyyy", lebar: 10 };
  if (WAKTU.test(s) && !Number.isNaN(Date.parse(s))) {
    return { nilai: new Date(Date.parse(s) + WIB_MS), format: "dd/mm/yyyy hh:mm", lebar: 16 };
  }
  // Longest line, since wrapped text is measured per line.
  return { nilai: s, lebar: Math.max(...s.split("\n").map((l) => l.length)) };
}

/**
 * A real .xlsx: frozen bold header with filters, columns sized to their
 * content, dates as dates. exceljs writes strings as string cells, never as
 * formulas, so user-entered text starting with "=" cannot execute.
 */
export async function keXlsx(
  baris: Record<string, unknown>[],
  kolom: string[][],
  namaSheet: string,
): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const buku = new ExcelJS.Workbook();
  const lembar = buku.addWorksheet(namaSheet.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const lebar = kolom.map(([, label]) => label.length);
  lembar.addRow(kolom.map(([, label]) => label)).font = { bold: true };

  for (const r of baris) {
    const sel = kolom.map(([k]) => selXlsx(r[k]));
    const row = lembar.addRow(sel.map((s) => s.nilai));
    sel.forEach((s, i) => {
      if (s.format) row.getCell(i + 1).numFmt = s.format;
      lebar[i] = Math.max(lebar[i], s.lebar);
    });
  }

  lembar.columns.forEach((c, i) => {
    c.width = Math.min(60, lebar[i] + 2);
    c.alignment = { vertical: "top", wrapText: true };
  });
  lembar.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: kolom.length } };

  return Buffer.from(await buku.xlsx.writeBuffer());
}
