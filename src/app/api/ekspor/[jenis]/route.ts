import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  adalahTab,
  bacaFilter,
  keXlsx,
  lolosIlike,
  termCari,
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
  ["status_sla", "Bendera Batas Waktu"],
  ["batas_waktu_sla", "Batas Waktu"],
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
  "Siap TTD",
  "Ditolak",
];

type Unit = { id: number; nama: string; id_parent_unit: number | null; is_active: boolean };

/**
 * Units in tree order — each faculty followed by its prodi and programs —
 * so the Lingkup columns read as the tree does. A name shared by two units
 * (e.g. the same program under two faculties) carries its parent's name.
 */
function urutPohon(unit: Unit[]): (Unit & { label: string })[] {
  const anak = new Map<number | null, Unit[]>();
  for (const u of unit) anak.set(u.id_parent_unit, [...(anak.get(u.id_parent_unit) ?? []), u]);
  const byId = new Map(unit.map((u) => [u.id, u]));
  const jumlahNama = new Map<string, number>();
  for (const u of unit) jumlahNama.set(u.nama, (jumlahNama.get(u.nama) ?? 0) + 1);

  const hasil: (Unit & { label: string })[] = [];
  const kunjungi = (induk: number | null, jalur: Set<number>) => {
    for (const u of anak.get(induk) ?? []) {
      if (jalur.has(u.id)) continue; // a cycle in bad data must not hang the export
      const induknya = u.id_parent_unit ? byId.get(u.id_parent_unit)?.nama : null;
      hasil.push({
        ...u,
        label: (jumlahNama.get(u.nama) ?? 0) > 1 && induknya ? `${u.nama} (${induknya})` : u.nama,
      });
      kunjungi(u.id, new Set(jalur).add(u.id));
    }
  };
  kunjungi(null, new Set());
  return hasil;
}

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
  let centang = new Set<string>();

  if (jenis === "sla") {
    let q: any = supabase.from("v_sla_dokumen").select("*");
    // The SLA export's own filters: the approval record, narrowed by the same
    // document-level values the list is showing.
    if (filter.no_dokumen) q = q.ilike("no_dokumen", `%${lolosIlike(filter.no_dokumen)}%`);
    if (filter.nama_mitra) q = q.ilike("nama_mitra", `%${lolosIlike(filter.nama_mitra)}%`);
    const cari = termCari(filter.q ?? "");
    if (cari) q = q.or(`no_dokumen.ilike.*${cari}*,nama_mitra.ilike.*${cari}*`);
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
    // This export has its own scope and must not inherit a tab's, so the tab
    // is passed as null. It used to pass "proposal", whose branch already
    // applies `.in("status_proposal", STATUS_PROPOSAL)` — and a second `.in()`
    // on the same column is ANDed by PostgREST, not replaced. The effective
    // set was the intersection, so Disetujui, Siap TTD and Ditolak (the three
    // PROSES adds, and half of what "dan Diproses" names) could never appear.
    //
    // status_tampil is the tab-relative status filter, so it is dropped here
    // too: the list's Status dropdown offers values this export's own range
    // contradicts, which is how exporting from Kerja Sama Aktif produced an
    // empty workbook.
    const filterProses = { ...filter };
    delete filterProses.status_tampil;
    const q = terapkanFilter(
      supabase.from("v_daftar_dokumen").select("*"),
      null,
      filterProses,
    )
      .in("status_proposal", PROSES)
      // A rejection archives the document (alasan_arsip = 'rejected'), so
      // Ditolak never has a null status_dokumen; everything else in range is
      // still a proposal that has not become a live document.
      .or("status_dokumen.is.null,status_proposal.eq.Ditolak");
    const { data, error } = await terapkanUrutan(q, filter).limit(10000);
    if (error) return NextResponse.json({ pesan: error.message }, { status: 500 });
    baris = data ?? [];
    kolom = KOLOM_DOKUMEN;
    nama = "dokumen-berjalan-dan-diproses";
  } else if (jenis === "aktif") {
    // Unduh Laporan (Revisi V6 §4). The tab the user is on is respected, so
    // the button next to the filters exports what the screen shows.
    const [{ data, error }, { data: bidang }, { data: unit }] = await Promise.all([
      terapkanUrutan(
        terapkanFilter(supabase.from("v_laporan_dokumen").select("*"), tab, filter),
        filter,
      ).limit(10000),
      supabase.from("bidang_kerjasama").select("id, nama, is_active").order("id"),
      supabase.from("unit").select("id, nama, id_parent_unit, is_active").order("nama"),
    ]);
    if (error) return NextResponse.json({ pesan: error.message }, { status: 500 });
    const dokumen = (data ?? []) as any[];

    // Every current option gets a column; a retired one only while some
    // exported document still carries it, so no TRUE is ever dropped.
    const dipakai = (k: string) => new Set(dokumen.flatMap((d) => d[k] ?? []));
    const bidangDipakai = dipakai("bidang_ids");
    const unitDipakai = dipakai("unit_ids");
    const kolomBidang = (bidang ?? [])
      .filter((b) => b.is_active || bidangDipakai.has(b.id))
      .map((b) => [`bidang:${b.id}`, `Bidang: ${b.nama}`]);
    const kolomUnit = urutPohon(unit ?? [])
      .filter((u) => u.is_active || unitDipakai.has(u.id))
      .map((u) => [`unit:${u.id}`, `Lingkup: ${u.label}`]);

    baris = dokumen.map((d) => {
      const r: Record<string, unknown> = { ...d };
      for (const id of d.bidang_ids ?? []) r[`bidang:${id}`] = true;
      for (const id of d.unit_ids ?? []) r[`unit:${id}`] = true;
      return r;
    });
    kolom = [
      ["no_dokumen", "No Dokumen"],
      ["jenis_kerjasama", "Jenis Dokumen"],
      ["nama_mitra", "Mitra"],
      ["negara", "Negara"],
      ["alamat", "Alamat"],
      ["jenis_mitra", "Jenis Mitra"],
      ["agenda", "Agenda Kerja Sama"],
      ...kolomBidang,
      ["tanggal_mulai", "Tanggal Mulai"],
      ["tanggal_berakhir", "Tanggal Selesai"],
      ["status_tampil", "Status"],
      ["unit_pengusul", "Unit Pengusul"],
      ...kolomUnit,
      ["penandatangan_petra", "Penandatangan PETRA"],
      ["penandatangan_mitra", "Penandatangan MITRA"],
      ["kontak_pengusul", "Kontak Pengusul"],
      ["kontak_mitra", "Kontak Mitra"],
    ];
    centang = new Set([...kolomBidang, ...kolomUnit].map(([k]) => k));
    nama = `laporan-${tab}`;
  } else {
    return NextResponse.json(
      { pesan: "Ekspor tidak dikenal; gunakan aktif, sla atau proses." },
      { status: 404 },
    );
  }

  // Asia/Jakarta, not UTC — otherwise the filename date can be a day behind
  // for downloads made in the evening (UTC+7).
  const tanggal = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const berkas = await keXlsx(baris, kolom, nama, centang);
  return new NextResponse(new Uint8Array(berkas), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="simks-${nama}-${tanggal}.xlsx"`,
    },
  });
}
