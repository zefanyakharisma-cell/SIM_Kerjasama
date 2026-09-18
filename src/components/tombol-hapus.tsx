"use client";

import { useRef } from "react";
import { hapus } from "@/lib/actions/master-data";
import { useKonfirmasi } from "@/components/konfirmasi-dialog";

/**
 * Master Data's delete, behind the in-app confirm. The server decides between
 * a real delete and a deactivation (still referenced), and says which.
 */
export function TombolHapus({ tab, id, nama }: { tab: string; id: number; nama: string }) {
  const form = useRef<HTMLFormElement>(null);
  const { konfirmasi, dialog } = useKonfirmasi();

  return (
    <form ref={form} action={hapus}>
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="id" value={id} />
      <button
        type="button"
        className="text-xs underline"
        style={{ color: "var(--action-danger)" }}
        onClick={async () => {
          const ya = await konfirmasi({
            judul: `Hapus "${nama}"?`,
            pesan:
              "Bila data ini masih dipakai dokumen atau data lain, data tidak dihapus melainkan dinonaktifkan.",
            labelKonfirmasi: "Hapus",
            nada: "bahaya",
          });
          if (ya) form.current?.requestSubmit();
        }}
      >
        Hapus
      </button>
      {dialog}
    </form>
  );
}
