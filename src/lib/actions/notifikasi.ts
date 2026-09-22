"use server";

import { revalidatePath } from "next/cache";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { KOLOM_NOTIFIKASI, type Notifikasi } from "@/lib/notifikasi";

/**
 * The bell's popup reads through here rather than fetching in the layout:
 * notifications are only needed when the popup actually opens, so every other
 * page load stays one query lighter.
 */
export async function ambilNotifikasi(): Promise<Notifikasi[]> {
  const akun = await akunSaatIni();
  if (!akun) return [];
  const supabase = await supabaseServer();
  // RLS lets IO read every position's inbox (for oversight), so without this
  // filter IO would see each event once per recipient. The inbox is its own.
  const { data } = await supabase
    .from("notifikasi")
    .select(KOLOM_NOTIFIKASI)
    .eq("id_jabatan_penerima", akun.id_jabatan)
    .order("waktu_kirim", { ascending: false })
    .limit(100);
  return (data ?? []) as Notifikasi[];
}

/** Only the recipient position may mark its own inbox read; RLS says so. */
export async function tandaiSemuaTerbaca(): Promise<void> {
  const akun = await akunSaatIni();
  if (!akun) return;
  const supabase = await supabaseServer();
  await supabase
    .from("notifikasi")
    .update({ status: "read", waktu_dibaca: new Date().toISOString() })
    .eq("id_jabatan_penerima", akun.id_jabatan)
    .is("waktu_dibaca", null);
  // The unread badge is rendered by the app layout, so the whole shell has to
  // re-read — not just the notifikasi route.
  revalidatePath("/", "layout");
}
