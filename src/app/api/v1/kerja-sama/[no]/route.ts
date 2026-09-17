import { NextResponse, type NextRequest } from "next/server";
import { apiKeyValid, supabaseLayanan } from "@/lib/supabase/service";

/**
 * GET /api/v1/kerja-sama/{no} — one agreement's detail (PRD §15, Phase 4).
 *
 * Archived documents ARE readable here, unlike in the list. That is deliberate,
 * and it is the reason archival is a status rather than a deletion: the
 * Realization System may hold a reference to a document that has since been
 * superseded, and it has to be able to resolve what that reference was before
 * following it to the successor (BR-09, BR-13). The response says plainly
 * whether the document is still Active.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ no: string }> },
) {
  if (!apiKeyValid(request)) {
    return NextResponse.json({ pesan: "Kunci API tidak valid." }, { status: 401 });
  }

  const { no } = await params;
  const noDokumen = Number(no);
  if (!Number.isInteger(noDokumen)) {
    return NextResponse.json({ pesan: "Nomor dokumen tidak valid." }, { status: 400 });
  }

  const supabase = supabaseLayanan();

  const { data: d, error } = await supabase
    .from("v_daftar_dokumen")
    .select("*")
    .eq("no_dokumen_kerjasama", noDokumen)
    .maybeSingle();

  if (error) {
    console.error("[simks] API detail gagal:", error.message);
    return NextResponse.json({ pesan: "Gagal membaca data." }, { status: 500 });
  }
  if (!d) {
    return NextResponse.json({ pesan: "Dokumen tidak ditemukan." }, { status: 404 });
  }

  const [{ data: agenda }, { data: bidang }] = await Promise.all([
    supabase
      .from("proposal_dokumen_agenda")
      .select("agenda ( nama, is_amendment )")
      .eq("id_proposal_dokumen", d.id_proposal),
    supabase
      .from("proposal_dokumen_bidang")
      .select("bidang_kerjasama ( nama )")
      .eq("id_proposal_dokumen", d.id_proposal),
  ]);

  return NextResponse.json({
    no: d.no_dokumen_kerjasama,
    no_dokumen: d.no_dokumen,
    jenis: d.jenis_kerjasama,
    status: d.status_dokumen,
    aktif: d.status_dokumen === "Aktif",
    alasan_arsip: d.alasan_arsip,
    mitra: d.nama_mitra,
    negara: d.negara,
    internasional: d.is_international,
    unit_pengusul: d.unit_pengusul,
    periode: d.periode_kerjasama,
    auto_renewed: d.sifat_periode_kerjasama === "Auto Renewed",
    tanggal_tanda_tangan: d.tanggal_tanda_tangan,
    tanggal_mulai: d.tanggal_mulai,
    tanggal_berakhir: d.tanggal_berakhir,
    agenda: (agenda ?? []).map((a: any) => a.agenda?.nama).filter(Boolean),
    bidang: (bidang ?? []).map((b: any) => b.bidang_kerjasama?.nama).filter(Boolean),
    is_perpanjangan: d.is_perpanjangan,
  });
}
