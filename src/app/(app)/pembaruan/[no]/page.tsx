import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Renewal tracking moved to the document report's Pembaruan tab. This route
 * stays only so links already sent out (emails, notifications) still land.
 */
export default async function PembaruanLama({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("dokumen_kerja_sama")
    .select("id_proposal_dokumen")
    .eq("no", Number(no))
    .maybeSingle();
  if (!data) notFound();
  redirect(`/kerja-sama/${data.id_proposal_dokumen}/laporan?tab=pembaruan` as any);
}
