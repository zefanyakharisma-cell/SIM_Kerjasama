"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { unggahBerkas } from "@/lib/unggah";

/**
 * Server Actions write; Server Components read (EC-04).
 *
 * Every action here is a thin call into a Postgres function. The rules live
 * there — tier gating, the pending reset, the live-edit constraints, the
 * authority checks — so a scheduled sweep or the future Realization API gets
 * identical behaviour without going through Next.js (EC-01, G-3).
 *
 * These wrappers must therefore NOT re-implement any rule. They translate a
 * form post into an RPC call and surface the error.
 */

export type Hasil = { ok: true } | { ok: false; pesan: string };

async function panggil(fn: string, args: Record<string, unknown>): Promise<Hasil> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc(fn, args);

  if (error) {
    // Never swallow a failed transition (EC-06). The message from the database
    // names the rule that refused it, which is what the user needs to read.
    console.error(`[simks] ${fn} ditolak:`, error.message);
    return { ok: false, pesan: error.message };
  }
  return { ok: true };
}

export async function ajukanProposal(idProposal: number): Promise<Hasil> {
  const hasil = await panggil("ajukan_proposal", { p_id_proposal: idProposal });
  revalidatePath("/kerja-sama");
  revalidatePath(`/kerja-sama/${idProposal}`);
  return hasil;
}

/** Disetujui -> Siap TTD: Admin marks the document printed and in signing (V8 §2). */
export async function tandaiSiapTtd(idProposal: number): Promise<Hasil> {
  const hasil = await panggil("tandai_siap_ttd", { p_id_proposal: idProposal });
  revalidatePath(`/kerja-sama/${idProposal}`);
  revalidatePath("/kerja-sama");
  return hasil;
}

export async function kirimDisposisi(
  idProposal: number,
  idJabatan: number[],
  pesan: string,
  lampiran?: string | null,
): Promise<Hasil> {
  const hasil = await panggil("kirim_disposisi", {
    p_id_proposal: idProposal,
    p_id_jabatan: idJabatan,
    p_pesan: pesan || null,
    p_lampiran: lampiran || null,
  });
  revalidatePath(`/kerja-sama/${idProposal}`);
  revalidatePath(`/kerja-sama/${idProposal}/laporan`);
  return hasil;
}

/**
 * The four approver actions. One function because it is one decision at one
 * moment — but the consequences differ enormously, and making that obvious is
 * the job of the UI (Design §4.4), not of this wrapper.
 */
export async function aksiApproval(
  noTarget: number,
  aksi: "approve" | "reject" | "pending" | "revision",
  catatan: string,
  idProposal: number,
): Promise<Hasil> {
  const hasil = await panggil("aksi_approval", {
    p_no_target: noTarget,
    p_aksi: aksi,
    p_catatan: catatan || null,
  });
  revalidatePath(`/kerja-sama/${idProposal}`);
  revalidatePath("/antrean");
  return hasil;
}

/**
 * The submitter answers one open revision request with a new file. The draft
 * is replaced in place; catat_revisi logs it and tells the approver who asked.
 */
export async function unggahRevisi(
  idProposal: number,
  noTarget: number,
  formData: FormData,
): Promise<Hasil> {
  const berkas = formData.get("berkas") as File | null;
  if (!berkas || berkas.size === 0) return { ok: false, pesan: "Pilih berkas revisi." };

  const unggah = await unggahBerkas(await supabaseServer(), `revisi/${idProposal}`, berkas);
  if ("pesan" in unggah) return { ok: false, pesan: unggah.pesan };

  const hasil = await panggil("catat_revisi", {
    p_id_proposal: idProposal,
    p_file: unggah.path,
    p_catatan: String(formData.get("catatan") ?? "") || null,
    p_no_target_peminta: noTarget,
  });
  revalidatePath(`/kerja-sama/${idProposal}`);
  revalidatePath(`/kerja-sama/${idProposal}/laporan`);
  return hasil;
}

/** Reactivating a frozen document restarts the whole approval at tier 1 (BR-06). */
export async function reaktivasiPending(idProposal: number): Promise<Hasil> {
  const hasil = await panggil("reaktivasi_pending", { p_id_proposal: idProposal });
  revalidatePath(`/kerja-sama/${idProposal}`);
  return hasil;
}

export async function tambahTarget(
  idProposal: number,
  idJabatan: number,
): Promise<Hasil> {
  const hasil = await panggil("tambah_target", {
    p_id_proposal: idProposal,
    p_id_jabatan: idJabatan,
  });
  revalidatePath(`/kerja-sama/${idProposal}`);
  return hasil;
}

export async function hapusTarget(
  noTarget: number,
  idProposal: number,
): Promise<Hasil> {
  const hasil = await panggil("hapus_target", { p_no_target: noTarget });
  revalidatePath(`/kerja-sama/${idProposal}`);
  return hasil;
}

export async function aktivasiDokumen(
  idProposal: number,
  data: {
    noDokumen: string;
    // Falls back to tanggalMulai when omitted — the Disetujui tab's
    // activation form (revision V3) no longer asks for it separately.
    tanggalTandaTangan?: string;
    tanggalMulai: string;
    tanggalBerakhir: string | null;
    folderKui?: string | null;
    noBerkasDikti: string | null;
    penandatanganPetra?: string | null;
    jabatanPetra?: string | null;
    penandatanganMitra?: string | null;
    jabatanMitra?: string | null;
    // Storage path of the signed document (Revisi V7 §3).
    uploadDokumen?: string | null;
  },
): Promise<Hasil> {
  const hasil = await panggil("aktivasi_dokumen", {
    p_id_proposal: idProposal,
    // Typed by IO, never generated and never format-checked (BR-22).
    p_no_dokumen: data.noDokumen,
    p_tanggal_tanda_tangan: data.tanggalTandaTangan || data.tanggalMulai,
    p_tanggal_mulai: data.tanggalMulai,
    p_tanggal_berakhir: data.tanggalBerakhir,
    p_folder_kui: data.folderKui || null,
    p_no_berkas_dikti: data.noBerkasDikti,
    p_penandatangan_petra: data.penandatanganPetra || null,
    p_jabatan_petra: data.jabatanPetra || null,
    p_penandatangan_mitra: data.penandatanganMitra || null,
    p_jabatan_mitra: data.jabatanMitra || null,
    p_upload_dokumen: data.uploadDokumen || null,
  });
  revalidatePath(`/kerja-sama/${idProposal}`);
  revalidatePath(`/kerja-sama/${idProposal}/laporan`);
  revalidatePath("/kerja-sama");
  return hasil;
}
