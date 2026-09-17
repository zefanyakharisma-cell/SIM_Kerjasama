"use client";

import { useState } from "react";

const inputKelas = "w-full rounded-lg border px-3 py-2 text-sm";
const inputGaya = { borderColor: "var(--border)" };

/**
 * III. Kerja Sama yang Diusulkan (Revisi V4 §3.a).
 *
 * Jenis toggles which of the MoU / MoA blocks is shown — MoU shows a summary
 * of activity, MoA shows Hak/Kewajiban, never both (§3.a.1). Tujuan and the
 * two Manfaat fields are click-and-choose dropdowns backed by the
 * tujuan_kerjasama/manfaat_petra/manfaat_mitra tables, not free text (§3.a.2).
 */
export function KerjaSamaFields({
  jenisAwal,
  tujuanOpsi,
  manfaatPetraOpsi,
  manfaatMitraOpsi,
  tujuanAwal,
  manfaatPetraAwal,
  manfaatMitraAwal,
  ringkasanKegiatanAwal,
  hakPetraAwal,
  hakMitraAwal,
  kewajibanPetraAwal,
  kewajibanMitraAwal,
}: {
  jenisAwal: string;
  tujuanOpsi: string[];
  manfaatPetraOpsi: string[];
  manfaatMitraOpsi: string[];
  tujuanAwal: string;
  manfaatPetraAwal: string;
  manfaatMitraAwal: string;
  ringkasanKegiatanAwal: string;
  hakPetraAwal: string;
  hakMitraAwal: string;
  kewajibanPetraAwal: string;
  kewajibanMitraAwal: string;
}) {
  const [jenis, setJenis] = useState(jenisAwal || "MoU");

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Jenis (*)</span>
        <select
          name="jenis_kerjasama"
          required
          value={jenis}
          onChange={(e) => setJenis(e.target.value)}
          className={inputKelas}
          style={inputGaya}
        >
          <option value="MoU">MoU</option>
          <option value="MoA">MoA</option>
        </select>
      </label>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium">Tujuan Kerja Sama</span>
        <select name="tujuan_kerjasama" defaultValue={tujuanAwal} className={inputKelas} style={inputGaya}>
          <option value="">Pilih tujuan...</option>
          {tujuanOpsi.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium">Manfaat bagi UKP</span>
        <select
          name="manfaat_bagi_petra"
          defaultValue={manfaatPetraAwal}
          className={inputKelas}
          style={inputGaya}
        >
          <option value="">Pilih manfaat...</option>
          {manfaatPetraOpsi.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium">Manfaat bagi Mitra</span>
        <select
          name="manfaat_bagi_mitra"
          defaultValue={manfaatMitraAwal}
          className={inputKelas}
          style={inputGaya}
        >
          <option value="">Pilih manfaat...</option>
          {manfaatMitraOpsi.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
          Satu pernyataan bersama, berlaku untuk seluruh mitra pada dokumen ini.
        </span>
      </label>

      {jenis === "MoU" ? (
        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium">Ringkasan Kegiatan (MoU)</span>
          <textarea
            name="ringkasan_kegiatan"
            rows={2}
            defaultValue={ringkasanKegiatanAwal}
            className={inputKelas}
            style={inputGaya}
          />
        </label>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Hak UKP (MoA)</span>
            <textarea
              name="hak_petra"
              rows={2}
              defaultValue={hakPetraAwal}
              className={inputKelas}
              style={inputGaya}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Hak Mitra (MoA)</span>
            <textarea
              name="hak_calon_mitra"
              rows={2}
              defaultValue={hakMitraAwal}
              className={inputKelas}
              style={inputGaya}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Kewajiban UKP (MoA)</span>
            <textarea
              name="kewajiban_petra"
              rows={2}
              defaultValue={kewajibanPetraAwal}
              className={inputKelas}
              style={inputGaya}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Kewajiban Mitra (MoA)</span>
            <textarea
              name="kewajiban_calon_mitra"
              rows={2}
              defaultValue={kewajibanMitraAwal}
              className={inputKelas}
              style={inputGaya}
            />
          </label>
        </div>
      )}
    </>
  );
}
