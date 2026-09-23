import type { Cell, Worksheet } from "exceljs";
import { selXlsx } from "@/lib/laporan";

/**
 * The two formatted reports on Cari Kerja Sama, laid out as the KUI templates
 * Table_Database_Kerjasama.xlsx and Table_Database_SLA.xlsx.
 *
 * The Kerja Sama template's checklist columns (Jenis Mitra, Bidang, and one
 * per faculty/prodi/unit) are built from master data, not copied from the
 * template: a new unit or bidang gets its column without a code change. The
 * header is therefore a tree — a group spans its leaves, and a leaf is merged
 * down to the last header row — rendered to however many rows it needs.
 */

// Template colours (Table_Database_Kerjasama.xlsx styles.xml).
const WARNA_DASAR = "E5B8B7";
const WARNA_BIDANG = "E6B9B8"; // theme accent 2, tint 0.6
const WARNA_FAKULTAS = ["EAF1DD", "BFBFBF", "B6DDE8", "F2DBDB", "CCC0D9", "FFE599", "FBD4B4", "B8CCE4"];
const CENTANG = "✓";
const WIB_MS = 7 * 60 * 60 * 1000;

const FONT_KS = { name: "Calibri", size: 10 };
const FONT_SLA = { name: "Arial", size: 10 };
const GARIS = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
} as const;

/** A header node: a group when it has `anak`, otherwise one column. */
type Simpul = {
  label: string;
  warna?: string;
  anak?: Simpul[];
  /** Leaf only: the value of this column for one document. */
  nilai?: (d: any) => unknown;
  lebar?: number;
  centang?: boolean;
};

const daun = (s: Simpul): Simpul[] => (s.anak ? s.anak.flatMap(daun) : [s]);
const kedalaman = (s: Simpul): number => (s.anak ? 1 + Math.max(0, ...s.anak.map(kedalaman)) : 1);
const warnai = (s: Simpul, warna: string): Simpul => ({
  ...s,
  warna: s.warna ?? warna,
  anak: s.anak?.map((a) => warnai(a, s.warna ?? warna)),
});

function isi(cell: Cell, warna: string | undefined) {
  if (warna) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${warna}` } };
  cell.border = GARIS;
}

/**
 * Writes the header tree from row 1 and returns the leaf columns in order.
 * Every cell of a merged range gets the fill and border, so the merge keeps
 * its outline in Excel and LibreOffice alike.
 */
function tulisHeader(ws: Worksheet, akar: Simpul[], font: object): { daun: Simpul[]; baris: number } {
  const jumlahBaris = Math.max(...akar.map(kedalaman));
  let kolom = 1;
  const tulis = (s: Simpul, baris: number) => {
    const awal = kolom;
    if (s.anak?.length) {
      for (const a of s.anak) tulis(a, baris + 1);
    } else {
      kolom++;
    }
    const akhir = kolom - 1;
    const bawah = s.anak?.length ? baris : jumlahBaris;
    for (let r = baris; r <= bawah; r++)
      for (let c = awal; c <= akhir; c++) isi(ws.getCell(r, c), s.warna);
    if (bawah > baris || akhir > awal) ws.mergeCells(baris, awal, bawah, akhir);
    const cell = ws.getCell(baris, awal);
    cell.value = s.label;
    cell.font = font;
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
      // A checklist column is narrow; its name reads bottom-to-top instead.
      ...(s.centang ? { textRotation: 90 } : {}),
    };
  };
  for (const s of akar) tulis(s, 1);
  return { daun: akar.flatMap(daun), baris: jumlahBaris };
}

/** One data cell: dates as dates in WIB, text wrapped, checks centred. */
function tulisData(ws: Worksheet, kolom: Simpul[], dokumen: any[], mulai: number, font: object) {
  dokumen.forEach((d, i) => {
    const row = ws.getRow(mulai + i);
    kolom.forEach((k, j) => {
      const cell = row.getCell(j + 1);
      const v = k.nilai?.(d);
      if (k.centang) {
        cell.value = v ? CENTANG : null;
        cell.alignment = { horizontal: "center", vertical: "top" };
      } else if (v instanceof Date) {
        cell.value = v;
        cell.numFmt = "dd/mm/yyyy hh:mm";
        cell.alignment = { vertical: "top" };
      } else {
        const s = selXlsx(v);
        cell.value = s.nilai as any;
        if (s.format) cell.numFmt = s.format;
        cell.alignment = { vertical: "top", wrapText: true };
      }
      cell.font = font;
      cell.border = GARIS;
    });
  });
}

async function bukuBaru() {
  const ExcelJS = (await import("exceljs")).default;
  return new ExcelJS.Workbook();
}

// ---------------------------------------------------------------------------
// Laporan Kerja Sama Aktif — Table_Database_Kerjasama
// ---------------------------------------------------------------------------

type Unit = {
  id: number;
  nama: string;
  id_parent_unit: number | null;
  id_jenis_unit: number;
  is_active: boolean;
};
type Opsi = { id: number; nama: string; is_active: boolean };

/**
 * The unit tree as header groups. Units under the university root are each a
 * group (Fakultas, School); the supporting units ('Unit Pembantu') gather
 * under one "Unit Pendukung" group, as in the template. A unit that has
 * children can itself be a document's Lingkup, so it gets a leading
 * "Seluruh …" column — only when some exported document picked it directly.
 */
function simpulUnit(unit: Unit[], idPembantu: number | null, dipakai: Set<number>): Simpul[] {
  const anak = new Map<number | null, Unit[]>();
  const ids = new Set(unit.map((u) => u.id));
  for (const u of unit) {
    const induk = u.id_parent_unit !== null && ids.has(u.id_parent_unit) ? u.id_parent_unit : null;
    anak.set(induk, [...(anak.get(induk) ?? []), u]);
  }
  for (const daftar of anak.values()) daftar.sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  const kolomUnit = (u: Unit, label: string): Simpul => ({
    label,
    centang: true,
    lebar: 5.6,
    nilai: (d) => (d.unit_ids ?? []).includes(u.id),
  });

  // Null when neither the unit nor anything under it belongs in the report.
  const bangun = (u: Unit, jalur: Set<number>): Simpul | null => {
    if (jalur.has(u.id)) return null; // a cycle in bad data must not hang the export
    const turunan = (anak.get(u.id) ?? [])
      .map((a) => bangun(a, new Set(jalur).add(u.id)))
      .filter((s): s is Simpul => s !== null);
    const tampil = u.is_active || dipakai.has(u.id);
    if (!turunan.length) return tampil ? kolomUnit(u, u.nama) : null;
    return {
      label: u.nama,
      anak: dipakai.has(u.id) ? [kolomUnit(u, `Seluruh ${u.nama}`), ...turunan] : turunan,
    };
  };

  const akar = anak.get(null) ?? [];
  // One university root: its children are the top-level groups, and the root
  // itself (the whole university as Lingkup) is a column of its own if used.
  const [atas, seluruh] =
    akar.length === 1 && anak.get(akar[0].id)?.length
      ? [anak.get(akar[0].id) ?? [], dipakai.has(akar[0].id) ? [kolomUnit(akar[0], akar[0].nama)] : []]
      : [akar, []];

  const akademik: Simpul[] = [];
  const pendukung: Simpul[] = [];
  for (const u of atas) {
    const s = bangun(u, new Set(akar.length === 1 ? [akar[0].id] : []));
    if (s) (u.id_jenis_unit === idPembantu ? pendukung : akademik).push(s);
  }

  return [
    ...seluruh.map((s) => ({ ...s, warna: "FFFFFF" })),
    ...akademik.map((s, i) => warnai(s, WARNA_FAKULTAS[i % WARNA_FAKULTAS.length])),
    ...(pendukung.length ? [warnai({ label: "Unit Pendukung", anak: pendukung }, "FFFFFF")] : []),
  ];
}

export async function keXlsxLaporanAktif(
  dokumen: any[],
  master: { bidang: Opsi[]; jenisMitra: Opsi[]; unit: Unit[]; idPembantu: number | null },
): Promise<Buffer> {
  const dipakai = (k: string) => new Set<number>(dokumen.flatMap((d) => d[k] ?? []));
  const bidangDipakai = dipakai("bidang_ids");
  const jenisDipakai = dipakai("jenis_mitra_ids");

  // A retired option keeps its column only while an exported document still
  // carries it, so no check mark is ever dropped.
  const aktifAtauDipakai = (o: Opsi[], d: Set<number>) => o.filter((x) => x.is_active || d.has(x.id));

  const jenisMitra = (luarNegeri: boolean): Simpul => ({
    label: luarNegeri ? "Luar Negeri" : "Dalam Negeri",
    anak: aktifAtauDipakai(master.jenisMitra, jenisDipakai).map((j) => ({
      label: j.nama,
      centang: true,
      lebar: 6.4,
      nilai: (d) => Boolean(d.is_international) === luarNegeri && (d.jenis_mitra_ids ?? []).includes(j.id),
    })),
  });

  const teks = (label: string, lebar: number, nilai: (d: any) => unknown): Simpul => ({ label, lebar, nilai });

  const akar: Simpul[] = [
    teks("No.", 5.3, (d) => d.__no),
    teks("Mitra", 38.9, (d) => d.nama_mitra),
    teks("Negara", 13, (d) => d.negara),
    teks("Alamat", 34.9, (d) => d.alamat),
    { label: "Jenis Mitra", anak: [jenisMitra(true), jenisMitra(false)] },
    teks("Jenis Dokumen", 11.6, (d) => d.jenis_kerjasama),
    warnai(
      {
        label: "Bidang Kerja Sama",
        anak: aktifAtauDipakai(master.bidang, bidangDipakai).map((b) => ({
          label: b.nama,
          centang: true,
          lebar: 8.9,
          nilai: (d: any) => (d.bidang_ids ?? []).includes(b.id),
        })),
      },
      WARNA_BIDANG,
    ),
    teks("Agenda Kerjasama", 55, (d) => d.agenda),
    teks("No. Dokumen", 18.9, (d) => d.no_dokumen),
    teks("No. LAPORKERMA", 18.9, (d) => d.no_berkas_dikti),
    teks("Pengusul", 20.1, (d) => d.unit_pengusul),
    teks("Tanggal Mulai", 16.9, (d) => d.tanggal_mulai),
    teks("Tanggal Selesai", 12.4, (d) =>
      d.tanggal_berakhir ?? (d.sifat_periode_kerjasama === "Auto Renewed" ? "Auto Renewed" : null),
    ),
    teks("Pihak UKP", 27.4, (d) => d.penandatangan_petra),
    teks("Pihak Partner", 33.6, (d) => d.penandatangan_mitra),
    teks("Informasi Tambahan", 29.6, (d) => d.informasi_tambahan),
    ...simpulUnit(master.unit, master.idPembantu, dipakai("unit_ids")),
    teks("Kontak Mitra", 72.6, (d) => d.kontak_mitra),
    teks("Kontak Petra", 53.4, (d) => d.kontak_pengusul),
  ].map((s) => warnai(s, WARNA_DASAR));

  const buku = await bukuBaru();
  const ws = buku.addWorksheet("Kerja Sama Aktif");
  const { daun: kolom, baris } = tulisHeader(ws, akar, FONT_KS);
  kolom.forEach((k, i) => (ws.getColumn(i + 1).width = k.lebar ?? 12));
  for (let r = 1; r < baris; r++) ws.getRow(r).height = 38;
  // The last header row carries the rotated checklist names.
  ws.getRow(baris).height = 130;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: baris }];

  tulisData(ws, kolom, dokumen.map((d, i) => ({ ...d, __no: i + 1 })), baris + 1, FONT_KS);
  return Buffer.from(await buku.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Laporan Proses Kerja Sama — Table_Database_SLA
// ---------------------------------------------------------------------------

/** A timestamptz as a WIB wall-clock Date, since Excel cells carry no zone. */
const wib = (v: unknown) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(Date.parse(v) + WIB_MS) : null;

export async function keXlsxLaporanProses(dokumen: any[]): Promise<Buffer> {
  const dasar: Simpul[] = [
    { label: "No", lebar: 4.9, nilai: (d) => d.__no },
    { label: "Jenis Dokumen", lebar: 18, nilai: (d) => d.jenis_kerjasama },
    { label: "Partner", lebar: 18.3, nilai: (d) => d.nama_mitra },
    { label: "Negara", lebar: 18.1, nilai: (d) => d.negara },
    { label: "Agenda", lebar: 30, nilai: (d) => d.agenda },
    {
      label: "Status Dokumen",
      lebar: 18.7,
      // A rejection archives the document; the report names the rejection.
      nilai: (d) => (d.status_proposal === "Ditolak" ? "Ditolak" : d.status_tampil),
    },
    { label: "Tanggal Diajukan", lebar: 18.4, nilai: (d) => wib(d.waktu_proposal_dokumen) },
    { label: "Tanggal Disposisi", lebar: 18.3, nilai: (d) => wib(d.waktu_disposisi) },
    { label: "Tanggal Approval Tier-1", lebar: 17.9, nilai: (d) => wib(d.tier_1) },
    { label: "Tanggal Approval Tier-2", lebar: 18.3, nilai: (d) => wib(d.tier_2) },
    { label: "Tanggal Approval Tier-3", lebar: 21.7, nilai: (d) => wib(d.tier_3) },
    { label: "Tanggal Dokumen Diaktifkan", lebar: 18.4, nilai: (d) => wib(d.waktu_aktif) },
    {
      label: "Total Waktu Dokumen Diproses",
      lebar: 18.4,
      nilai: (d) => (d.total_hari_kerja == null ? null : `${d.total_hari_kerja} hari kerja`),
    },
  ];
  const kolom = dasar.map((k) => ({ ...k, warna: WARNA_BIDANG }));

  const buku = await bukuBaru();
  const ws = buku.addWorksheet("Proses Kerja Sama");
  tulisHeader(ws, kolom, { ...FONT_SLA, bold: true });
  kolom.forEach((k, i) => (ws.getColumn(i + 1).width = k.lebar ?? 18));
  ws.getRow(1).height = 25.5;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: kolom.length } };

  tulisData(ws, kolom, dokumen.map((d, i) => ({ ...d, __no: i + 1 })), 2, FONT_SLA);
  return Buffer.from(await buku.xlsx.writeBuffer());
}
