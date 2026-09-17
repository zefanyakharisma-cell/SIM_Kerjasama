import { NextResponse, type NextRequest } from "next/server";
import { apiKeyValid, supabaseLayanan } from "@/lib/supabase/service";

/**
 * GET /api/v1/kerja-sama — Active MoU/MoA, for the Partnership Realization
 * System (PRD §15, Phase 4).
 *
 * Read-only, and deliberately narrow. The Realization System's need is one
 * sentence: list the Active agreements an Implementation Arrangement may be
 * filed against. So this returns Active documents and the few fields needed to
 * choose between them — not proposals, not archived documents, not the approval
 * trail, not evaluations.
 *
 * "Active only" is the contract, not a default: an arrangement must never point
 * at an archived document (BR-13), and the cheapest way to keep that true is for
 * the archived ones never to appear here at all.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!apiKeyValid(request)) {
    return NextResponse.json({ pesan: "Kunci API tidak valid." }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const halaman = Math.max(1, Number(sp.get("halaman") ?? 1) || 1);
  const perHalaman = Math.min(
    200,
    Math.max(1, Number(sp.get("per_halaman") ?? 100) || 100),
  );
  const dari = (halaman - 1) * perHalaman;

  let q = supabaseLayanan()
    .from("v_daftar_dokumen")
    .select(
      "no_dokumen_kerjasama, no_dokumen, jenis_kerjasama, nama_mitra, negara, " +
        "is_international, unit_pengusul, tanggal_mulai, tanggal_berakhir, " +
        "sifat_periode_kerjasama",
      { count: "exact" },
    )
    .eq("status_dokumen", "Aktif");

  const jenis = sp.get("jenis");
  if (jenis === "MoU" || jenis === "MoA") q = q.eq("jenis_kerjasama", jenis);

  const unit = sp.get("unit");
  if (unit) q = q.ilike("unit_pengusul", `%${unit}%`);

  const { data, count, error } = await q
    .order("no_dokumen_kerjasama", { ascending: true })
    .range(dari, dari + perHalaman - 1);

  if (error) {
    console.error("[simks] API daftar gagal:", error.message);
    return NextResponse.json({ pesan: "Gagal membaca data." }, { status: 500 });
  }

  return NextResponse.json({
    total: count ?? 0,
    halaman,
    per_halaman: perHalaman,
    data: (data ?? []).map((d: any) => ({
      no: d.no_dokumen_kerjasama,
      no_dokumen: d.no_dokumen,
      jenis: d.jenis_kerjasama,
      mitra: d.nama_mitra,
      negara: d.negara,
      internasional: d.is_international,
      unit_pengusul: d.unit_pengusul,
      tanggal_mulai: d.tanggal_mulai,
      // NULL for Auto Renewed, which has no end date at all (BR-11).
      tanggal_berakhir: d.tanggal_berakhir,
      auto_renewed: d.sifat_periode_kerjasama === "Auto Renewed",
    })),
  });
}
