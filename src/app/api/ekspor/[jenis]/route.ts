import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  adalahTab,
  bacaFilter,
  keXlsx,
  lolosIlike,
  terapkanFilter,
  terapkanUrutan,
  type TabKey,
} from "@/lib/laporan";

/**
 * The three dedicated exports (PRD §8.4):
 *   aktif  — active documents
 *   sla    — the approval-time record for each document
 *   proses — ongoing and processed documents
 *
 * Each carries the full filter set and exports the filtered view, not the whole
 * table (Design §4.5).
 *
 * A Route Handler rather than a Server Action, which is the one exception to
 * EC-04: an action returns a value to a React tree and cannot hand the browser
 * a file. Nothing is fetched here for the UI — this is a download endpoint, and
 * it runs on the caller's own session, so RLS decides the rows exactly as it
 * does on screen (AR-02).
 */
export const dynamic = "force-dynamic";

const KOLOM_DOKUMEN: string[][] = [
  ["no_dokumen", "No. Dokumen"],
  ["nama_mitra", "Mitra"],
  ["negara", "Negara"],
  ["is_international", "Luar Negeri"],
  ["jenis_kerjasama", "Jenis"],
  ["status_tampil", "Status"],
  ["alasan_arsip", "Alasan Arsip"],
  ["unit_pengusul", "Unit Pengusul"],
  ["periode_kerjasama", "Periode"],
  ["sifat_periode_kerjasama", "Sifat Periode"],
  ["tanggal_tanda_tangan", "Tanggal Tanda Tangan"],
  ["tanggal_mulai", "Tanggal Mulai"],
  ["tanggal_berakhir", "Tanggal Berakhir"],
  ["sisa_hari", "Sisa Hari"],
  ["waktu_proposal_dokumen", "Diajukan"],
  ["waktu_disetujui", "Disetujui"],
  ["waktu_aktif", "Aktif Sejak"],
  ["folder_kui", "Folder KUI"],
  ["no_berkas_dikti", "No. Berkas Dikti"],
];

const KOLOM_SLA: string[][] = [
  ["no_dokumen", "No. Dokumen"],
  ["nama_mitra", "Mitra"],
  ["jenis_disposisi", "Jenis Disposisi"],
  ["round_ke", "Ronde"],
  ["tier", "Tier"],
  ["jabatan", "Jabatan"],
  ["status", "Status"],
  ["waktu_unlock", "Mulai Menunggu"],
  ["waktu_resolusi", "Ditindak"],
  ["durasi_hari_kerja", "Hari Kerja Terpakai"],
  ["status_sla", "Bendera SLA"],
  ["batas_waktu_sla", "Batas SLA"],
];

// "Ongoing and processed" is every document past Draft, whatever state it
// reached — so it is a status filter, not a separate tab.
const PROSES = [
  "Diajukan",
  "Diproses",
  "Disposisi - Tier 1",
  "Disposisi - Tier 2",
  "Disposisi - Tier 3",
  "Pending",
  "Disetujui",
  "Ditolak",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jenis: string }> },
) {
  const { jenis } = await params;
  const supabase = await supabaseServer();
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filter = bacaFilter(sp);
  const tab: TabKey = adalahTab(sp.tab) ? sp.tab : "aktif";

  let baris: Record<string, unknown>[] = [];
  let kolom: string[][];
  let nama: string;

  if (jenis === "sla") {
    let q: any = supabase.from("v_sla_dokumen").select("*");
    // The SLA export's own filters: the approval record, narrowed by the same
    // document-level values the list is showing.
    if (filter.no_dokumen) q = q.ilike("no_dokumen", `%${lolosIlike(filter.no_dokumen)}%`);
    if (filter.nama_mitra) q = q.ilike("nama_mitra", `%${lolosIlike(filter.nama_mitra)}%`);
    const { data, error } = await q
      .order("id_proposal", { ascending: false })
      .order("round_ke")
      .order("tier")
      .limit(10000);
    if (error) return NextResponse.json({ pesan: error.message }, { status: 500 });
    baris = data ?? [];
    kolom = KOLOM_SLA;
    nama = "sla-per-dokumen";
  } else if (jenis === "proses") {
    const q = terapkanFilter(
      supabase.from("v_daftar_dokumen").select("*"),
      "proposal",
      filter,
    )
      .in("status_proposal", PROSES);
    const { data, error } = await terapkanUrutan(q, filter).limit(10000);
    if (error) return NextResponse.json({ pesan: error.message }, { status: 500 });
    baris = data ?? [];
    kolom = KOLOM_DOKUMEN;
    nama = "dokumen-berjalan-dan-diproses";
  } else if (jenis === "aktif") {
    // Export 1 is the active list; the tab the user is on is respected, so the
    // button next to the filters exports what the screen shows.
    const { data, error } = await terapkanUrutan(
      terapkanFilter(supabase.from("v_daftar_dokumen").select("*"), tab, filter),
      filter,
    ).limit(10000);
    if (error) return NextResponse.json({ pesan: error.message }, { status: 500 });
    baris = data ?? [];
    kolom = KOLOM_DOKUMEN;
    nama = `daftar-${tab}`;
  } else {
    return NextResponse.json(
      { pesan: "Ekspor tidak dikenal; gunakan aktif, sla atau proses." },
      { status: 404 },
    );
  }

  // Asia/Jakarta, not UTC — otherwise the filename date can be a day behind
  // for downloads made in the evening (UTC+7).
  const tanggal = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const berkas = await keXlsx(baris, kolom, nama);
  return new NextResponse(new Uint8Array(berkas), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="simks-${nama}-${tanggal}.xlsx"`,
    },
  });
}
