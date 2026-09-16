"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

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

export async function kirimDisposisi(
  idProposal: number,
  idJabatan: number[],
  pesan: string,
): Promise<Hasil> {
  const hasil = await panggil("kirim_disposisi", {
    p_id_proposal: idProposal,
    p_id_jabatan: idJabatan,
    p_pesan: pesan || null,
  });
  revalidatePath(`/kerja-sama/${idProposal}`);
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
    tanggalTandaTangan: string;
    tanggalMulai: string;
    tanggalBerakhir: string | null;
    folderKui: string | null;
    noBerkasDikti: string | null;
  },
): Promise<Hasil> {
  const hasil = await panggil("aktivasi_dokumen", {
    p_id_proposal: idProposal,
    // Typed by IO, never generated and never format-checked (BR-22).
    p_no_dokumen: data.noDokumen,
    p_tanggal_tanda_tangan: data.tanggalTandaTangan,
    p_tanggal_mulai: data.tanggalMulai,
    p_tanggal_berakhir: data.tanggalBerakhir,
    p_folder_kui: data.folderKui,
    p_no_berkas_dikti: data.noBerkasDikti,
  });
  revalidatePath(`/kerja-sama/${idProposal}`);
  revalidatePath("/kerja-sama");
  return hasil;
}
