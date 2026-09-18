import { NextResponse, type NextRequest } from "next/server";
import { apiKeyValid, supabaseLayanan } from "@/lib/supabase/service";
import { STATUS_DOKUMEN_AKTIF } from "@/lib/laporan";

/**
 * GET /api/v1/kerja-sama/{no}/penerus — resolve a renewal successor
 * (PRD §15, Phase 4).
 *
 * The one question the Realization System cannot answer with a join: it holds a
 * reference to an agreement, that agreement was renewed one or more times, and
 * an Implementation Arrangement must always point at the ACTIVE document
 * (BR-13). This walks the chain and says which document the reference should be
 * moved to.
 *
 * `perlu_dipindahkan` is that answer in one field, so the caller does not
 * re-derive it by comparing ids and get it subtly wrong.
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
  const diminta = Number(no);
  if (!Number.isInteger(diminta)) {
    return NextResponse.json({ pesan: "Nomor dokumen tidak valid." }, { status: 400 });
  }

  const { data, error } = await supabaseLayanan().rpc("resolusi_penerus", {
    p_no_dokumen: diminta,
  });

  if (error) {
    console.error("[simks] API penerus gagal:", error.message);
    return NextResponse.json({ pesan: "Gagal membaca data." }, { status: 500 });
  }

  const baris = (data as any[])?.[0];
  if (!baris) {
    return NextResponse.json({ pesan: "Dokumen tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({
    diminta,
    berlaku: {
      no: baris.no_dokumen_kerjasama,
      no_dokumen: baris.no_dokumen,
      status: baris.status,
      aktif: (STATUS_DOKUMEN_AKTIF as readonly string[]).includes(baris.status),
      alasan_arsip: baris.alasan_arsip,
    },
    // How many renewals sit between the reference held and the current
    // document. Zero means the reference is already current.
    langkah: baris.langkah,
    perlu_dipindahkan: baris.no_dokumen_kerjasama !== diminta,
  });
}
