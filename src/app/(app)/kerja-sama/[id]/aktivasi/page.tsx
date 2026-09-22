import { notFound, redirect } from "next/navigation";
import { isIO, akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { aktivasiDokumen } from "@/lib/actions/workflow";
import { SubmitButton } from "@/components/submit-button";
import { TERIMA_PDF, unggahBerkas } from "@/lib/unggah";

/**
 * Siap TTD's activation form (revision V3; status renamed in V8 §2). Every
 * row here has already cleared Tier 3 and been printed for signing, so there
 * is nothing left to decide — only the signed-document details to type in,
 * once, by IO.
 */
export const dynamic = "force-dynamic";

const gaya = { borderColor: "var(--border)" };
const inputKelas = "w-full rounded-lg border px-3 py-2 text-sm";

export default async function AktivasiDokumen({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idProposal = Number(id);
  const supabase = await supabaseServer();
  const akun = await akunSaatIni();

  if (!isIO(akun)) notFound();

  const { data: proposal } = await supabase
    .from("proposal_dokumen")
    .select(
      `id, jenis_kerjasama, status_proposal,
       partner_pengusul ( partner ( nama ) )`,
    )
    .eq("id", idProposal)
    .maybeSingle();

  if (!proposal) notFound();
  // Only a Siap TTD proposal reaches this form — same rule the RPC itself
  // enforces, checked here too so the page reads correctly instead of
  // failing only on submit.
  if (proposal.status_proposal !== "Siap TTD") {
    redirect(`/kerja-sama/${idProposal}/laporan` as any);
  }

  const namaMitra =
    ((proposal as any).partner_pengusul ?? [])
      .map((p: any) => p.partner?.nama)
      .filter(Boolean)
      .join(", ") || "Mitra belum dipilih";

  async function aktifkan(formData: FormData) {
    "use server";
    const akhir = String(formData.get("tanggal_berakhir") ?? "");
    // The signed document (Revisi V7 §3). Optional, as the Google Drive link is.
    let uploadDokumen: string | null = null;
    const berkas = formData.get("berkas") as File | null;
    if (berkas && berkas.size > 0) {
      const unggah = await unggahBerkas(await supabaseServer(), `dokumen/${idProposal}`, berkas, TERIMA_PDF);
      if ("pesan" in unggah) throw new Error(unggah.pesan);
      uploadDokumen = unggah.path;
    }
    const hasil = await aktivasiDokumen(idProposal, {
      noDokumen: String(formData.get("no_dokumen") ?? ""),
      tanggalMulai: String(formData.get("tanggal_mulai") ?? ""),
      tanggalBerakhir: akhir === "" ? null : akhir,
      noBerkasDikti: String(formData.get("no_berkas_dikti") ?? "") || null,
      penandatanganPetra: String(formData.get("penandatangan_petra") ?? "") || null,
      penandatanganMitra: String(formData.get("penandatangan_mitra") ?? "") || null,
      jabatanPetra: String(formData.get("jabatan_petra") ?? "") || null,
      jabatanMitra: String(formData.get("jabatan_mitra") ?? "") || null,
      uploadDokumen,
    });
    if (!hasil.ok) throw new Error(hasil.pesan);
    redirect(`/kerja-sama/${idProposal}/laporan` as any);
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="text-lg font-semibold" style={{ color: "var(--midnight)" }}>
          Aktivasi Dokumen
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {namaMitra} · {proposal.jenis_kerjasama}
        </p>
      </header>

      <form action={aktifkan} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2" style={gaya}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nomor Dokumen (*)</span>
          <input name="no_dokumen" required className={`no-dokumen ${inputKelas}`} style={gaya} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nomor LAPORKERMA</span>
          <input name="no_berkas_dikti" className={inputKelas} style={gaya} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Tanggal Mulai (*)</span>
          <input type="date" name="tanggal_mulai" required className={inputKelas} style={gaya} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Tanggal Berakhir</span>
          <input type="date" name="tanggal_berakhir" className={inputKelas} style={gaya} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Penandatangan PETRA</span>
          <input name="penandatangan_petra" className={inputKelas} style={gaya} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Penandatangan Mitra</span>
          <input name="penandatangan_mitra" className={inputKelas} style={gaya} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Jabatan Penandatangan PETRA</span>
          <input name="jabatan_petra" className={inputKelas} style={gaya} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Jabatan Penandatangan Mitra</span>
          <input name="jabatan_mitra" className={inputKelas} style={gaya} />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Upload Dokumen (PDF bertanda tangan)</span>
          <input type="file" name="berkas" accept={TERIMA_PDF} className={inputKelas} style={gaya} />
        </label>

        <div className="sm:col-span-2">
          <SubmitButton
            labelMenunggu="Mengaktifkan…"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--status-active)" }}
          >
            Aktifkan Dokumen
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
