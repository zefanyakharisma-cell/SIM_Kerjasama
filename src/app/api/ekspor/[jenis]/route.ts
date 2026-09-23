import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  bacaFilter,
  keXlsx,
  lolosIlike,
  STATUS_DOKUMEN_AKTIF,
  termCari,
  terapkanFilter,
  terapkanUrutan,
  type Filter,
} from "@/lib/laporan";
import { keXlsxLaporanAktif, keXlsxLaporanProses } from "@/lib/ekspor-template";

/**
 * The four downloads on Cari Kerja Sama:
 *   laporan-aktif  — Laporan Kerja Sama Aktif, in the Table_Database_Kerjasama layout
 *   laporan-proses — Laporan Proses Kerja Sama, in the Table_Database_SLA layout
 *   data-aktif     — every raw field of the active documents
 *   data-sla       — the raw approval-time record, one row per approver per round
 *
 * Each carries the list's search and column filters (Design §4.5) but has its
 * own fixed scope, so the tab the user is on does not narrow it.
 *
 * A Route Handler rather than a Server Action, which is the one exception to
 * EC-04: an action returns a value to a React tree and cannot hand the browser
 * a file. Nothing is fetched here for the UI — this is a download endpoint, and
 * it runs on the caller's own session, so RLS decides the rows exactly as it
 * does on screen (AR-02).
 */
export const dynamic = "force-dynamic";

const KOLOM_DATA_AKTIF: string[][] = [
  ["id_proposal", "ID Proposal"],
  ["no_dokumen", "No. Dokumen"],
  ["jenis_kerjasama", "Jenis Dokumen"],
  ["status_tampil", "Status"],
  ["nama_mitra", "Mitra"],
  ["negara", "Negara"],
  ["is_international", "Luar Negeri"],
  ["alamat", "Alamat"],
  ["jenis_mitra", "Jenis Mitra"],
  ["agenda", "Agenda Kerja Sama"],
  ["bidang", "Bidang Kerja Sama"],
  ["lingkup", "Lingkup"],
  ["unit_pengusul", "Unit Pengusul"],
  ["jabatan_pengusul", "Jabatan Pengusul"],
  ["periode_kerjasama", "Periode (tahun)"],
  ["sifat_periode_kerjasama", "Sifat Periode"],
  ["tanggal_tanda_tangan", "Tanggal Tanda Tangan"],
  ["tanggal_mulai", "Tanggal Mulai"],
  ["tanggal_berakhir", "Tanggal Selesai"],
  ["sisa_hari", "Sisa Hari"],
  ["waktu_proposal_dokumen", "Diajukan"],
  ["waktu_disetujui", "Disetujui"],
  ["waktu_aktif", "Aktif Sejak"],
  ["no_berkas_dikti", "No. LAPORKERMA"],
  ["folder_kui", "Folder KUI"],
  ["link_gdrive", "Link Google Drive"],
  ["upload_dokumen", "Berkas Dokumen"],
  ["is_perpanjangan", "Perpanjangan"],
  ["is_pencatatan_langsung", "Pencatatan Langsung"],
  ["informasi_tambahan", "Informasi Tambahan"],
  ["penandatangan_petra", "Pihak UKP"],
  ["penandatangan_mitra", "Pihak Partner"],
  ["kontak_pengusul", "Kontak Petra"],
  ["kontak_mitra", "Kontak Mitra"],
];

const KOLOM_DATA_SLA: string[][] = [
  ["id_proposal", "ID Proposal"],
  ["no_dokumen", "No. Dokumen"],
  ["jenis_kerjasama", "Jenis Dokumen"],
  ["nama_mitra", "Mitra"],
  ["status_proposal", "Status Proposal"],
  ["jenis_disposisi", "Jenis Disposisi"],
  ["round_ke", "Ronde"],
  ["waktu_disposisi", "Waktu Disposisi"],
  ["tier", "Tier"],
  ["jabatan", "Jabatan"],
  ["status", "Status"],
  ["waktu_unlock", "Mulai Menunggu"],
  ["waktu_resolusi", "Ditindak"],
  ["durasi_hari_kerja", "Hari Kerja Terpakai"],
  ["status_sla", "Bendera Batas Waktu"],
  ["batas_waktu_sla", "Batas Waktu"],
];

// The Status filter is tab-relative: the list offers values a download's own
// scope may contradict (a Draft filter would empty Kerja Sama Aktif). It is
// kept only where the value lies inside that scope.
const STATUS_AKTIF_TAMPIL = ["Aktif", "Akan Berakhir", "Disposisi Evaluasi"];

function filterTanpaStatus(filter: Filter, boleh: string[] = []): Filter {
  const f = { ...filter };
  if (f.status_tampil && !boleh.includes(f.status_tampil)) delete f.status_tampil;
  return f;
}

/** Active documents (Aktif and Akan Berakhir) from v_laporan_dokumen, filtered as the list is. */
async function dokumenAktif(supabase: any, filter: Filter) {
  const q = terapkanFilter(
    supabase.from("v_laporan_dokumen").select("*"),
    null,
    filterTanpaStatus(filter, STATUS_AKTIF_TAMPIL),
  ).in("status_dokumen", STATUS_DOKUMEN_AKTIF);
  return terapkanUrutan(q, filter).limit(10000);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jenis: string }> },
) {
  const { jenis } = await params;
  const supabase = await supabaseServer();
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filter = bacaFilter(sp);

  let berkas: Buffer;
  let nama: string;

  if (jenis === "laporan-aktif") {
    const [dok, bidang, jenisMitra, unit, jenisUnit] = await Promise.all([
      dokumenAktif(supabase, filter),
      supabase.from("bidang_kerjasama").select("id, nama, is_active").order("id"),
      supabase.from("jenis_mitra").select("id, nama, is_active").order("id"),
      supabase.from("unit").select("id, nama, id_parent_unit, id_jenis_unit, is_active"),
      supabase.from("jenis_unit").select("id, jenis"),
    ]);
    const galat = [dok, bidang, jenisMitra, unit, jenisUnit].find((r) => r.error)?.error;
    if (galat) return NextResponse.json({ pesan: galat.message }, { status: 500 });
    berkas = await keXlsxLaporanAktif(dok.data ?? [], {
      bidang: bidang.data ?? [],
      jenisMitra: jenisMitra.data ?? [],
      unit: unit.data ?? [],
      idPembantu: (jenisUnit.data ?? []).find((j: any) => j.jenis === "Unit Pembantu")?.id ?? null,
    });
    nama = "laporan-kerja-sama-aktif";
  } else if (jenis === "laporan-proses") {
    const q = terapkanFilter(
      supabase.from("v_proses_dokumen").select("*"),
      null,
      filterTanpaStatus(filter),
    );
    const { data, error } = await terapkanUrutan(q, filter).limit(10000);
    if (error) return NextResponse.json({ pesan: error.message }, { status: 500 });
    berkas = await keXlsxLaporanProses(data ?? []);
    nama = "laporan-proses-kerja-sama";
  } else if (jenis === "data-aktif") {
    const [dok, bidang] = await Promise.all([
      dokumenAktif(supabase, filter),
      supabase.from("bidang_kerjasama").select("id, nama"),
    ]);
    const galat = dok.error ?? bidang.error;
    if (galat) return NextResponse.json({ pesan: galat.message }, { status: 500 });
    const namaBidang = new Map((bidang.data ?? []).map((b: any) => [b.id, b.nama]));
    const baris = (dok.data ?? []).map((d: any) => ({
      ...d,
      bidang: (d.bidang_ids ?? []).map((id: number) => namaBidang.get(id)).filter(Boolean).join(", "),
    }));
    berkas = await keXlsx(baris, KOLOM_DATA_AKTIF, "Data Kerja Sama Aktif");
    nama = "data-kerja-sama-aktif";
  } else if (jenis === "data-sla") {
    let q: any = supabase.from("v_sla_dokumen").select("*");
    // The approval record, narrowed by the same document-level values the
    // list is showing.
    if (filter.no_dokumen) q = q.ilike("no_dokumen", `%${lolosIlike(filter.no_dokumen)}%`);
    if (filter.nama_mitra) q = q.ilike("nama_mitra", `%${lolosIlike(filter.nama_mitra)}%`);
    if (filter.jenis_kerjasama) q = q.eq("jenis_kerjasama", filter.jenis_kerjasama);
    const cari = termCari(filter.q ?? "");
    if (cari) q = q.or(`no_dokumen.ilike.*${cari}*,nama_mitra.ilike.*${cari}*`);
    const { data, error } = await q
      .order("id_proposal", { ascending: false, nullsFirst: false })
      .order("round_ke")
      .order("tier")
      .limit(10000);
    if (error) return NextResponse.json({ pesan: error.message }, { status: 500 });
    berkas = await keXlsx(data ?? [], KOLOM_DATA_SLA, "Data SLA");
    nama = "data-sla";
  } else {
    return NextResponse.json(
      { pesan: "Ekspor tidak dikenal; gunakan laporan-aktif, laporan-proses, data-aktif atau data-sla." },
      { status: 404 },
    );
  }

  // Asia/Jakarta, not UTC — otherwise the filename date can be a day behind
  // for downloads made in the evening (UTC+7).
  const tanggal = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  return new NextResponse(new Uint8Array(berkas), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="simks-${nama}-${tanggal}.xlsx"`,
    },
  });
}
