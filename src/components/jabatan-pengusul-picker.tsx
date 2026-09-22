"use client";

import { useState, useTransition } from "react";
import { SearchSelect } from "@/components/search-select";
import { tambahJabatanRingan, ubahJabatanRingan } from "@/lib/actions/jabatan";

const inputKelas = "w-full rounded-lg border px-3 py-2 text-sm";
const inputGaya = { borderColor: "var(--border)" };

type Jab = {
  id: number;
  nama: string;
  id_unit: number | null;
  tier_disposisi: number | null;
  unit: { nama: string }[] | { nama: string } | null;
};

const satuUnit = (v: Jab["unit"]) => (Array.isArray(v) ? v[0] : v)?.nama ?? null;

/**
 * Jabatan Pengusul (Revisi V8 §10): shows the selected position's unit and
 * approval tier, and lets any account add a brand-new position, or (Admin
 * only) edit the selected one — inline, without leaving the proposal form.
 */
export function JabatanPengusulPicker({
  jabatan,
  units,
  defaultValue,
  isAdmin,
}: {
  jabatan: Jab[];
  units: { id: number; nama: string }[];
  defaultValue: number | null;
  isAdmin: boolean;
}) {
  const [daftar, setDaftar] = useState(jabatan);
  const [idTerpilih, setIdTerpilih] = useState<number | null>(defaultValue);
  const [mode, setMode] = useState<"none" | "tambah" | "ubah">("none");
  const [nama, setNama] = useState("");
  const [idUnit, setIdUnit] = useState<number | "">("");
  const [galat, setGalat] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const terpilih = daftar.find((j) => j.id === idTerpilih) ?? null;

  function bukaTambah() {
    setNama("");
    setIdUnit("");
    setGalat(null);
    setMode("tambah");
  }

  function bukaUbah() {
    if (!terpilih) return;
    setNama(terpilih.nama);
    setIdUnit(terpilih.id_unit ?? "");
    setGalat(null);
    setMode("ubah");
  }

  function simpan() {
    if (!nama.trim() || !idUnit) {
      setGalat("Nama dan Unit wajib diisi.");
      return;
    }
    setGalat(null);
    startTransition(async () => {
      const hasil =
        mode === "ubah" && terpilih
          ? await ubahJabatanRingan(terpilih.id, nama.trim(), Number(idUnit))
          : await tambahJabatanRingan(nama.trim(), Number(idUnit));
      if (!hasil.ok) {
        setGalat(hasil.pesan);
        return;
      }
      const unit = units.find((u) => u.id === Number(idUnit)) ?? null;
      const baru: Jab = {
        id: hasil.id,
        nama: nama.trim(),
        id_unit: Number(idUnit),
        tier_disposisi: terpilih?.tier_disposisi ?? null,
        unit,
      };
      setDaftar((s) => [...s.filter((j) => j.id !== baru.id), baru].sort((a, b) => a.nama.localeCompare(b.nama)));
      setIdTerpilih(baru.id);
      setMode("none");
    });
  }

  return (
    <div>
      <SearchSelect
        key={daftar.map((j) => j.id).join(",")}
        name="id_jabatan_pengusul"
        options={daftar.map((j) => ({ id: j.id, label: j.nama }))}
        defaultValue={idTerpilih}
        placeholder="Cari jabatan..."
        ariaLabel="Jabatan Pengusul"
        required
        onValueChange={setIdTerpilih}
      />

      {terpilih ? (
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {satuUnit(terpilih.unit) ?? "Unit belum diisi"} ·{" "}
          {terpilih.tier_disposisi ? `Tier ${terpilih.tier_disposisi}` : "Bukan approver"}
        </p>
      ) : null}

      <div className="mt-2 flex gap-3 text-xs">
        {terpilih && isAdmin ? (
          <button type="button" className="underline" onClick={bukaUbah}>
            Edit jabatan ini
          </button>
        ) : null}
        <button type="button" className="underline" onClick={bukaTambah}>
          + Tambah Jabatan Baru
        </button>
      </div>

      {mode !== "none" ? (
        <div className="mt-2 grid gap-2 rounded-lg border p-3 sm:grid-cols-2" style={inputGaya}>
          <input
            placeholder="Nama Jabatan"
            aria-label="Nama Jabatan Baru"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className={inputKelas}
            style={inputGaya}
          />
          <select
            aria-label="Unit"
            value={idUnit}
            onChange={(e) => setIdUnit(e.target.value ? Number(e.target.value) : "")}
            className={inputKelas}
            style={inputGaya}
          >
            <option value="">Unit...</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nama}
              </option>
            ))}
          </select>
          {galat ? <p className="text-xs sm:col-span-2" style={{ color: "var(--sla-red)" }}>{galat}</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              disabled={pending}
              onClick={simpan}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              style={{ background: "var(--midnight)" }}
            >
              {pending ? "Menyimpan…" : mode === "ubah" ? "Simpan Perubahan" : "Tambah"}
            </button>
            <button type="button" className="rounded-lg border px-3 py-1.5 text-xs" style={inputGaya} onClick={() => setMode("none")}>
              Batal
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
