"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { akunSaatIni, isIO, supabaseServer } from "@/lib/supabase/server";
import { susunPeriode } from "@/lib/periode";
import { TERIMA_PDF, unggahBerkas } from "@/lib/unggah";
import { periksaDaftar, resolusiMitra } from "@/lib/actions/proposal";

/**
 * Pencatatan Langsung (Revisi V8 §1) — KUI records a document that was already
 * signed, without an approval step, and edits one afterwards.
 *
 * Sections I–IV are the same form simpanProposal serves, so the two pieces
 * that read them (periksaDaftar, resolusiMitra) are shared rather than copied.
 * Section V is the signed-document detail the activation form usually
 * collects. The whole write is one RPC, catat_dokumen_langsung, so a failure
 * anywhere rolls the document back rather than leaving half a record behind.
 */
export async function catatDokumenLangsung(formData: FormData) {
  const akun = await akunSaatIni();
  if (!akun) redirect("/login");
  // RLS and the RPC both refuse a non-IO caller; this only turns a silent
  // rejection into a clear redirect (same reasoning as master-data's
  // klienAdmin).
  if (!isIO(akun)) redirect("/dashboard");

  const supabase = await supabaseServer();
  const idEdit = Number(formData.get("id") ?? 0) || null;

  const proposal = {
    jenis_kerjasama: String(formData.get("jenis_kerjasama") ?? ""),
    periode_kerjasama: susunPeriode(
      formData.get("periode_tahun"),
      formData.get("periode_bulan"),
    ),
    sifat_periode_kerjasama: String(formData.get("sifat_periode_kerjasama") ?? ""),
    tujuan_kerjasama: String(formData.get("tujuan_kerjasama") ?? ""),
    manfaat_bagi_petra: String(formData.get("manfaat_bagi_petra") ?? ""),
    manfaat_bagi_mitra: String(formData.get("manfaat_bagi_mitra") ?? ""),
    informasi_tambahan: String(formData.get("informasi_tambahan") ?? ""),
  };

  await periksaDaftar(supabase, proposal);

  const { idPerBaris, kontakPerBaris } = await resolusiMitra(supabase, formData);
  const unik = [...new Set(idPerBaris.values())];
  if (!unik.length) throw new Error("Pilih setidaknya satu mitra.");

  const jenis = proposal.jenis_kerjasama;

  const { data: idBaru, error } = await supabase.rpc("catat_dokumen_langsung", {
    p_id: idEdit,
    p_proposal: proposal,
    // No partner is "Mitra Utama" — every one is equally important (V8 §8).
    p_partner: unik.map((p) => ({ id_partner: p })),
    p_id_jabatan: Number(formData.get("id_jabatan_pengusul") ?? 0) || null,
    p_bidang: formData.getAll("bidang").map(Number),
    p_agenda: formData.getAll("agenda").map(Number),
    p_unit: formData.getAll("unit").map(Number),
    p_sdg: formData.getAll("sdg").map(Number),
    p_mou:
      jenis === "MoU"
        ? { ringkasan_kegiatan: String(formData.get("ringkasan_kegiatan") ?? "") }
        : null,
    p_moa:
      jenis === "MoA"
        ? {
            hak_petra: String(formData.get("hak_petra") ?? ""),
            hak_calon_mitra: String(formData.get("hak_calon_mitra") ?? ""),
            kewajiban_petra: String(formData.get("kewajiban_petra") ?? ""),
            kewajiban_calon_mitra: String(formData.get("kewajiban_calon_mitra") ?? ""),
          }
        : null,
    p_dokumen: {
      no_dokumen: String(formData.get("no_dokumen") ?? ""),
      tanggal_tanda_tangan: String(formData.get("tanggal_tanda_tangan") ?? ""),
      tanggal_mulai: String(formData.get("tanggal_mulai") ?? ""),
      tanggal_berakhir: String(formData.get("tanggal_berakhir") ?? ""),
      folder_kui: String(formData.get("folder_kui") ?? ""),
      no_berkas_dikti: String(formData.get("no_berkas_dikti") ?? ""),
      // The file cannot be uploaded before this call: on a create the proposal
      // id it is filed under does not exist yet. It is attached below, the
      // same two-step simpanProposal uses for file_draft.
      upload_dokumen: "",
      penandatangan_petra: String(formData.get("penandatangan_petra") ?? ""),
      jabatan_petra: String(formData.get("jabatan_petra") ?? ""),
      penandatangan_mitra: String(formData.get("penandatangan_mitra") ?? ""),
      jabatan_mitra: String(formData.get("jabatan_mitra") ?? ""),
    },
  });
  if (error) throw new Error(`Dokumen gagal dicatat: ${error.message}`);

  const id = idBaru as number;

  // Primary contact per row, after the RPC — set_kontak_utama needs
  // partner_pengusul to link the partner to this proposal first.
  for (const [i, idKontak] of kontakPerBaris) {
    const idPartner = idPerBaris.get(i);
    if (!idPartner) continue;
    const { error: errKontak } = await supabase.rpc("set_kontak_utama", {
      p_id_proposal: id,
      p_id_partner: idPartner,
      p_id_kontak: idKontak,
    });
    if (errKontak) throw new Error(`Kontak utama gagal diset: ${errKontak.message}`);
  }

  // The signed PDF goes under the existing dokumen/<id_proposal> prefix — the
  // same place the activation form files it, already covered by
  // dokumen_kerjasama_unggah. An edit with no new file leaves the stored path
  // alone (the RPC coalesces), so this only runs when one was picked.
  const berkas = formData.get("berkas") as File | null;
  if (berkas && berkas.size > 0) {
    const unggah = await unggahBerkas(supabase, `dokumen/${id}`, berkas, TERIMA_PDF);
    if ("pesan" in unggah) throw new Error(unggah.pesan);
    const { error: errBerkas } = await supabase
      .from("dokumen_kerja_sama")
      .update({ upload_dokumen: unggah.path })
      .eq("id_proposal_dokumen", id);
    if (errBerkas) throw new Error(`Path berkas gagal disimpan: ${errBerkas.message}`);
  }

  revalidatePath("/kerja-sama");
  revalidatePath(`/kerja-sama/${id}/laporan`);
  redirect(`/kerja-sama/${id}/laporan`);
}
