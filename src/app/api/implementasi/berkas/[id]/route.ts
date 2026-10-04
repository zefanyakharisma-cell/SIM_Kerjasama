import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Download one Implementation Arrangement / Report file of a SIM Realisasi
 * activity, for the Implementasi tab.
 *
 * SIM Realisasi keeps its files as bytes in realisasi.file_blobs, not in a
 * Storage bucket, so there is no signed URL to hand out. A Route Handler for
 * the same reason as /api/ekspor: only a route can give the browser a file. It
 * runs on the caller's own session; implementasi_berkas returns nothing unless
 * the caller may read a document of the activity's renewal chain, and never a
 * mobility_bundle file.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Berkas tidak ditemukan." }, { status: 404 });
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("implementasi_berkas", { p_id: id }).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const berkas = data as { nama_berkas: string; mime: string; isi: string | null } | null;
  if (!berkas?.isi) {
    return NextResponse.json({ error: "Berkas tidak ditemukan." }, { status: 404 });
  }

  // PostgREST serialises bytea as "\x" followed by hex.
  const isi = Buffer.from(berkas.isi.replace(/^\\x/, ""), "hex");
  const nama = berkas.nama_berkas || `berkas-${id}`;

  return new NextResponse(isi, {
    headers: {
      "Content-Type": berkas.mime,
      "Content-Length": String(isi.length),
      "Content-Disposition": `attachment; filename="${nama.replace(/["\\\r\n]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
