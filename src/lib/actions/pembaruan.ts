"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Renewal actions (PRD §9).
 *
 * Same discipline as the workflow actions: every one of these is a thin call
 * into the Postgres function that owns the rule. In particular the evaluation
 * gate is NOT checked here — `buat_proposal_perpanjangan` refuses in the
 * database, so no route, no script and no future API can get past it (BR-26,
 * EC-01).
 */

export type Hasil = { ok: true; nilai?: unknown } | { ok: false; pesan: string };

async function panggil(fn: string, args: Record<string, unknown>): Promise<Hasil> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    // The database message names the rule that refused, which is what the user
    // needs to read (EC-06).
    console.error(`[simks] ${fn} ditolak:`, error.message);
    return { ok: false, pesan: error.message };
  }
  return { ok: true, nilai: data };
}

/**
 * The Head dispositions a renewal request (PRD §9.1) — to the owning unit by
 * default, or to the positions Admin picked. An empty list means automatic.
 */
export async function kirimPermintaanPembaruan(
  noDokumen: number,
  pesan: string,
  jabatan: number[] = [],
): Promise<Hasil> {
  const hasil = await panggil("kirim_permintaan_pembaruan", {
    p_no_dokumen: noDokumen,
    p_pesan: pesan || null,
    p_jabatan: jabatan.length ? jabatan : null,
  });
  revalidatePath("/kerja-sama", "layout");
  return hasil;
}

/** The faculty-side evaluation, filled in-system by an account of the unit. */
export async function kirimEvaluasiFakultas(
  noEvaluasi: number,
  jawaban: Record<string, unknown>,
): Promise<Hasil> {
  // An incomplete Likert grid is refused before the RPC, with the reason
  // `bacaJawaban` already worked out — otherwise the CHECK constraint refuses it
  // and the user reads raw Postgres instead (EC-06).
  if (typeof jawaban.galat === "string") return { ok: false, pesan: jawaban.galat };
  const hasil = await panggil("kirim_evaluasi_fakultas", {
    p_no: noEvaluasi,
    p_jawaban: jawaban,
  });
  revalidatePath("/kerja-sama", "layout");
  return hasil;
}

/** A split is resolved by an explicit, reasoned, audited override (BR-27). */
export async function putuskanPembaruan(
  noDokumen: number,
  keputusan: "continue" | "terminate",
  alasan: string,
): Promise<Hasil> {
  const hasil = await panggil("putuskan_pembaruan", {
    p_no_dokumen: noDokumen,
    p_keputusan: keputusan,
    p_alasan: alasan,
  });
  revalidatePath("/kerja-sama", "layout");
  return hasil;
}

/**
 * Reopening returns the NEW token, because the unit has to send it. The old one
 * is already inert and the prior answer is preserved as history (BR-30, DR-08).
 */
export async function bukaUlangEvaluasi(noEvaluasi: number): Promise<Hasil> {
  const hasil = await panggil("buka_ulang_evaluasi", { p_no: noEvaluasi });
  revalidatePath("/kerja-sama", "layout");
  return hasil;
}

/** KUI activates the partner's link; again, it replaces the old one. */
export async function buatTautanEvaluasiMitra(noDokumen: number): Promise<Hasil> {
  const hasil = await panggil("buat_tautan_evaluasi_mitra", { p_no_dokumen: noDokumen });
  revalidatePath("/kerja-sama", "layout");
  return hasil;
}

/**
 * Admin explicitly starts Pembaruan once both evaluations agree (V8 §16) —
 * this is the moment the unit pengusul is actually told, with the signed PDF
 * and the final approved draft, that the renewal has begun.
 */
export async function mulaiProsesPembaruan(noDokumen: number): Promise<Hasil> {
  const hasil = await panggil("mulai_proses_pembaruan", { p_no_dokumen: noDokumen });
  revalidatePath("/kerja-sama", "layout");
  return hasil;
}

/** The gate must already be open; the database is what decides that. */
export async function buatProposalPerpanjangan(
  noDokumen: number,
  file: string | null,
): Promise<Hasil> {
  const hasil = await panggil("buat_proposal_perpanjangan", {
    p_no_dokumen: noDokumen,
    p_file: file,
  });
  revalidatePath("/kerja-sama", "layout");
  return hasil;
}

/** Early termination — an Active document goes inactive, always with a reason. */
export async function arsipkanDokumen(
  noDokumen: number,
  alasan: string,
  idProposal: number,
): Promise<Hasil> {
  const hasil = await panggil("arsipkan_dokumen", {
    p_no: noDokumen,
    p_alasan: alasan,
  });
  revalidatePath(`/kerja-sama/${idProposal}`);
  revalidatePath("/kerja-sama");
  return hasil;
}
