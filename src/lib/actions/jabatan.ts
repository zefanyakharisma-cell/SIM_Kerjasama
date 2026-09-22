"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Inline Jabatan creation/edit from the Buat Kerja Sama form (Revisi V8
 * §10) — deliberately narrower than Master Data's simpanJabatan: no
 * redirect (the caller is mid-proposal, not on the Master Data page), and
 * no approval-tier or kepala-unit fields (those stay a considered Master
 * Data decision, not a side effect of filling in a proposal).
 */

export type HasilJabatan = { ok: true; id: number } | { ok: false; pesan: string };

export async function tambahJabatanRingan(nama: string, idUnit: number): Promise<HasilJabatan> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("tambah_jabatan_ringan", {
    p_nama: nama,
    p_id_unit: idUnit,
  });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/buat");
  return { ok: true, id: data as number };
}

export async function ubahJabatanRingan(id: number, nama: string, idUnit: number): Promise<HasilJabatan> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("ubah_jabatan_ringan", {
    p_id: id,
    p_nama: nama,
    p_id_unit: idUnit,
  });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/buat");
  return { ok: true, id };
}
