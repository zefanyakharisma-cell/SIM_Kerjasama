import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reads the recipient choice posted by <TujuanEvaluasi>: automatic (an empty
 * list — the database routes to the unit pengusul) or the positions Admin
 * ticked. Manual with nothing ticked is refused here, with a reason, rather
 * than silently falling back to automatic.
 */
export function bacaTujuanEvaluasi(
  formData: FormData,
): { jabatan: number[] } | { galat: string } {
  if (formData.get("mode") !== "manual") return { jabatan: [] };
  const jabatan = formData.getAll("jabatan").map(Number).filter(Number.isInteger);
  return jabatan.length ? { jabatan } : { galat: "Pilih minimal satu jabatan tujuan evaluasi." };
}

/** Every active position, labelled with its unit so same-named heads differ. */
export async function opsiJabatanEvaluasi(
  supabase: SupabaseClient,
): Promise<{ id: number; label: string }[]> {
  const { data } = await supabase
    .from("jabatan")
    .select("id, nama, unit ( nama )")
    .eq("is_active", true)
    .order("nama");
  // An embedded to-one relation can come back as an object or a one-element
  // array depending on how the client infers it; accept both.
  type Baris = { id: number; nama: string; unit: { nama: string } | { nama: string }[] | null };
  return ((data ?? []) as Baris[]).map((j) => {
    const unit = Array.isArray(j.unit) ? j.unit[0] : j.unit;
    return { id: j.id, label: unit?.nama ? `${j.nama} — ${unit.nama}` : j.nama };
  });
}
