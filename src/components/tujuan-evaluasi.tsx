"use client";

import { useState } from "react";
import { PilihBanyak } from "@/components/pilih-banyak";

/**
 * Who receives the PETRA evaluation form: the unit pengusul, routed by the
 * database as before, or positions Admin picks. The picker is only rendered in
 * manual mode, so an automatic send posts no `jabatan` at all.
 */
export function TujuanEvaluasi({ opsi }: { opsi: { id: number; label: string }[] }) {
  const [mode, setMode] = useState<"otomatis" | "manual">("otomatis");
  return (
    <fieldset className="space-y-2 text-xs">
      <legend className="mb-1 font-medium">Kirim formulir evaluasi ke</legend>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="mode"
          value="otomatis"
          checked={mode === "otomatis"}
          onChange={() => setMode("otomatis")}
        />
        Otomatis ke unit pengusul
      </label>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="mode"
          value="manual"
          checked={mode === "manual"}
          onChange={() => setMode("manual")}
        />
        Pilih jabatan manual
      </label>
      {mode === "manual" ? <PilihBanyak name="jabatan" opsi={opsi} /> : null}
    </fieldset>
  );
}
