"use client";

import { useMemo, useRef, useState, useEffect } from "react";

export type UnitNode = {
  id: number;
  nama: string;
  id_parent_unit: number | null;
  id_jenis_unit: number;
};

/**
 * Lingkup Kerja Sama — the recursive tri-state unit tree (PRD §7.3, Design §4.6).
 *
 * Three things the spec is emphatic about, and all three are easy to get wrong:
 *
 *  1. The cascade is RECURSIVE over parent-child, not fixed to a Faculty ->
 *     Prodi -> Program depth. Checking a faculty checks every descendant at
 *     any depth (BR-37).
 *  2. Unchecking one child puts the parent in an INDETERMINATE state — a dash,
 *     not a check and not empty. A plain binary checkbox that snaps the whole
 *     faculty off when one child is unchecked is the specific failure to
 *     avoid.
 *  3. That partial state is DERIVED at render time from the selected set, and
 *     never stored. What gets posted is only the explicit set of chosen unit
 *     ids (BR-38, DR-09).
 */
export function PohonLingkup({ units }: { units: UnitNode[] }) {
  const [terpilih, setTerpilih] = useState<Set<number>>(new Set());

  const anakDari = useMemo(() => {
    const peta = new Map<number | null, UnitNode[]>();
    for (const u of units) {
      const daftar = peta.get(u.id_parent_unit) ?? [];
      daftar.push(u);
      peta.set(u.id_parent_unit, daftar);
    }
    return peta;
  }, [units]);

  /** Every descendant, at any depth. */
  const keturunan = useMemo(() => {
    const cache = new Map<number, number[]>();
    const kumpulkan = (id: number): number[] => {
      const sudah = cache.get(id);
      if (sudah) return sudah;
      const langsung = anakDari.get(id) ?? [];
      const semua = langsung.flatMap((a) => [a.id, ...kumpulkan(a.id)]);
      cache.set(id, semua);
      return semua;
    };
    return kumpulkan;
  }, [anakDari]);

  function ubah(id: number, dicentang: boolean) {
    setTerpilih((sebelum) => {
      const baru = new Set(sebelum);
      // The cascade: the node and all of its descendants move together.
      for (const n of [id, ...keturunan(id)]) {
        if (dicentang) baru.add(n);
        else baru.delete(n);
      }
      return baru;
    });
  }

  function pilihJenis(idJenis: number) {
    setTerpilih((sebelum) => {
      const baru = new Set(sebelum);
      units.filter((u) => u.id_jenis_unit === idJenis).forEach((u) => baru.add(u.id));
      return baru;
    });
  }

  const akar = anakDari.get(null) ?? [];

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => pilihJenis(1)}
          className="rounded border px-2 py-1"
          style={{ borderColor: "var(--border)" }}
        >
          Pilih semua Unit Akademik
        </button>
        <button
          type="button"
          onClick={() => pilihJenis(2)}
          className="rounded border px-2 py-1"
          style={{ borderColor: "var(--border)" }}
        >
          Pilih semua Unit Pendukung
        </button>
        <button
          type="button"
          onClick={() => setTerpilih(new Set())}
          className="rounded border px-2 py-1"
          style={{ borderColor: "var(--border)" }}
        >
          Kosongkan
        </button>
      </div>

      <div
        className="max-h-80 overflow-y-auto rounded-lg border p-3"
        style={{ borderColor: "var(--border)" }}
      >
        {akar.map((u) => (
          <Simpul
            key={u.id}
            unit={u}
            anakDari={anakDari}
            keturunan={keturunan}
            terpilih={terpilih}
            ubah={ubah}
            kedalaman={0}
          />
        ))}
      </div>

      {/* Only the explicit selection is posted. The tri-state above is a view
          of this set, never a third stored value. */}
      {[...terpilih].map((id) => (
        <input key={id} type="hidden" name="unit" value={id} />
      ))}

      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        {terpilih.size} unit dipilih.
      </p>
    </div>
  );
}

function Simpul({
  unit,
  anakDari,
  keturunan,
  terpilih,
  ubah,
  kedalaman,
}: {
  unit: UnitNode;
  anakDari: Map<number | null, UnitNode[]>;
  keturunan: (id: number) => number[];
  terpilih: Set<number>;
  ubah: (id: number, dicentang: boolean) => void;
  kedalaman: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const anak = anakDari.get(unit.id) ?? [];
  const semuaKeturunan = keturunan(unit.id);

  const sendiri = terpilih.has(unit.id);
  const jumlahTerpilih = semuaKeturunan.filter((k) => terpilih.has(k)).length;

  const penuh =
    semuaKeturunan.length === 0
      ? sendiri
      : jumlahTerpilih === semuaKeturunan.length && sendiri;
  // Derived, not stored: some but not all of the subtree is selected.
  const sebagian = !penuh && (sendiri || jumlahTerpilih > 0);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = sebagian;
  }, [sebagian]);

  return (
    <div style={{ paddingLeft: kedalaman * 16 }}>
      <label className="flex items-center gap-2 py-0.5 text-sm">
        <input
          ref={ref}
          type="checkbox"
          checked={penuh}
          // Screen readers must hear the partial state, not just checked/unchecked.
          aria-checked={sebagian ? "mixed" : penuh}
          onChange={(e) => ubah(unit.id, e.target.checked)}
        />
        <span>{unit.nama}</span>
      </label>
      {anak.map((a) => (
        <Simpul
          key={a.id}
          unit={a}
          anakDari={anakDari}
          keturunan={keturunan}
          terpilih={terpilih}
          ubah={ubah}
          kedalaman={kedalaman + 1}
        />
      ))}
    </div>
  );
}
