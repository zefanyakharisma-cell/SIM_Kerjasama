import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one upload path into the dokumen-kerjasama bucket. Storage policies
 * decide who may write where; this only checks the file type and keeps the
 * name safe to use as part of a storage path.
 */

/** PDF or Word — drafts, revisions, disposisi and renewal files (Revisi V7 §8.1). */
export const TERIMA_PDF_WORD = ".pdf,.doc,.docx";
/** The signed document is previewed inline, so it stays PDF. */
export const TERIMA_PDF = ".pdf";

/**
 * Upload ceiling, mirrored by the bucket's own file_size_limit — this check is
 * only the friendly one, so the user gets an Indonesian message instead of a
 * storage error.
 */
export const BATAS_MB = 20;

const POLA: Record<string, RegExp> = {
  [TERIMA_PDF_WORD]: /\.(pdf|docx?)$/i,
  [TERIMA_PDF]: /\.pdf$/i,
};

export async function unggahBerkas(
  supabase: SupabaseClient,
  folder: string,
  berkas: File,
  terima: string = TERIMA_PDF_WORD,
): Promise<{ path: string } | { pesan: string }> {
  if (!POLA[terima].test(berkas.name)) {
    return {
      pesan: terima === TERIMA_PDF ? "Berkas harus PDF." : "Berkas harus PDF atau Word (.doc/.docx).",
    };
  }
  if (berkas.size > BATAS_MB * 1024 * 1024) {
    return { pesan: `Ukuran berkas maksimal ${BATAS_MB} MB.` };
  }
  const namaAman = berkas.name.replace(/[^\w.\-]/g, "_");
  const path = `${folder}/${Date.now()}-${namaAman}`;
  const { error } = await supabase.storage
    .from("dokumen-kerjasama")
    .upload(path, berkas, { upsert: true });
  if (error) {
    console.error(`[simks] unggah ${folder} gagal:`, error.message);
    return { pesan: "Gagal mengunggah berkas." };
  }
  return { path };
}

/** Only a PDF can be shown in an iframe; anything else is a download link. */
export const bisaPratinjau = (path: string | null | undefined) => Boolean(path && /\.pdf$/i.test(path));
