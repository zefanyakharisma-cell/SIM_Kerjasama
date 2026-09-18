"use client";

import { useState } from "react";

type Opsi = { id: number; label: string };

/**
 * Search-and-tick list (Revisi V7 §9): one flat list, no tier groups, filtered
 * as you type. Real checkboxes carry `name`, so a form posts exactly what it
 * did before; a ticked row stays ticked (and posted) while filtered out of view.
 */
export function PilihBanyak({
  name,
  opsi,
  awal = [],
  onChange,
}: {
  name?: string;
  opsi: Opsi[];
  awal?: number[];
  onChange?: (ids: number[]) => void;
}) {
  const [cari, setCari] = useState("");
  const [dipilih, setDipilih] = useState<number[]>(awal);
  const q = cari.trim().toLowerCase();
  const tampil = (o: Opsi) => !q || o.label.toLowerCase().includes(q);

  function ubah(id: number, centang: boolean) {
    const baru = centang ? [...dipilih, id] : dipilih.filter((x) => x !== id);
    setDipilih(baru);
    onChange?.(baru);
  }

  const gaya = { borderColor: "var(--border)" };
  return (
    <div>
      {dipilih.length ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {opsi
            .filter((o) => dipilih.includes(o.id))
            .map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => ubah(o.id, false)}
                className="rounded-full border px-2 py-0.5 text-xs"
                style={gaya}
                aria-label={`Hapus ${o.label}`}
              >
                {o.label} ×
              </button>
            ))}
        </div>
      ) : null}
      <input
        type="search"
        value={cari}
        onChange={(e) => setCari(e.target.value)}
        placeholder="Cari jabatan…"
        className="mb-2 w-full rounded-lg border px-3 py-2 text-sm"
        style={gaya}
      />
      <div className="max-h-56 overflow-y-auto rounded-lg border p-2" style={gaya}>
        {opsi.map((o) => (
          <label key={o.id} className={`${tampil(o) ? "flex" : "hidden"} items-center gap-2 py-0.5 text-sm`}>
            <input
              type="checkbox"
              name={name}
              value={o.id}
              checked={dipilih.includes(o.id)}
              onChange={(e) => ubah(o.id, e.target.checked)}
            />
            {o.label}
          </label>
        ))}
        {!opsi.some(tampil) ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Tidak ada jabatan yang cocok.
          </p>
        ) : null}
      </div>
    </div>
  );
}
