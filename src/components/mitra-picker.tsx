"use client";

import { useRef, useState } from "react";
import { SearchSelect } from "@/components/search-select";

const inputKelas = "w-full rounded-lg border px-3 py-2 text-sm";
const inputGaya = { borderColor: "var(--border)" };

type Baris = {
  key: number;
  mode: "existing" | "baru";
  kontakMode: "existing" | "baru";
  idPartnerAwal: number | null;
};

/**
 * Data Calon Mitra (Revisi V4 §1.a): each row is either an existing partner
 * (searched by name, pre-filled) or a brand-new partner (fields entered
 * inline). The "+" row is optional — most documents have exactly one partner
 * (PRD §7.8) — and only shows a Mitra Utama choice once there is more than one.
 *
 * Each row also carries a contact: for a new partner the entire
 * PARTNER_CONTACT entity is filled inline, and for an existing partner the
 * user picks between an existing contact on file or a new one.
 */
export function MitraPicker({
  partners,
  negara,
  jenisMitra,
  contacts,
  awal,
  leadAwal,
}: {
  partners: { id: number; nama: string }[];
  negara: { id: number; nama: string }[];
  jenisMitra: { id: number; nama: string }[];
  /** All partner contacts; filtered per row to the selected partner. */
  contacts: { id: number; id_partner: number; nama: string }[];
  /** Pre-selected partner ids, for editing a draft. */
  awal: number[];
  leadAwal: number | null;
}) {
  const [baris, setBaris] = useState<Baris[]>(
    awal.length
      ? awal.map((p, i) => ({ key: i, mode: "existing" as const, kontakMode: "existing" as const, idPartnerAwal: p }))
      : [{ key: 0, mode: "existing", kontakMode: "existing", idPartnerAwal: null }],
  );
  // Keyed by row key (not position), so removing a row can't misattribute a
  // partner's contacts to the row that slides into its old index.
  const [idPartnerTerpilih, setIdPartnerTerpilih] = useState<Record<number, number | null>>(
    Object.fromEntries(awal.map((p, i) => [i, p])),
  );
  // Lead is tracked by row key too, so removing another row doesn't shift it.
  const [leadKey, setLeadKey] = useState<number>(() => {
    const i = awal.indexOf(leadAwal ?? -1);
    return i >= 0 ? i : 0;
  });
  const kunciBerikutnya = useRef(baris.length);
  const leadIndex = Math.max(
    0,
    baris.findIndex((b) => b.key === leadKey),
  );

  return (
    <div>
      <input type="hidden" name="mitra_count" value={baris.length} />
      {baris.length > 1 ? <input type="hidden" name="lead_index" value={leadIndex} /> : null}

      {baris.map((b, i) => (
        <div key={b.key} className="mb-3 rounded-lg border p-3" style={inputGaya}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`mitra_mode_${i}`}
                  value="existing"
                  checked={b.mode === "existing"}
                  onChange={() =>
                    setBaris((s) => s.map((r) => (r.key === b.key ? { ...r, mode: "existing" } : r)))
                  }
                />
                Pilih Mitra
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`mitra_mode_${i}`}
                  value="baru"
                  checked={b.mode === "baru"}
                  onChange={() =>
                    setBaris((s) => s.map((r) => (r.key === b.key ? { ...r, mode: "baru" } : r)))
                  }
                />
                Tambah Mitra Baru
              </label>
            </div>
            {baris.length > 1 ? (
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  name="lead_index_radio"
                  checked={leadKey === b.key}
                  onChange={() => setLeadKey(b.key)}
                />
                Mitra Utama
              </label>
            ) : null}
            {baris.length > 1 ? (
              <button
                type="button"
                className="text-xs underline"
                onClick={() => {
                  // Computed outside the updater: React may run a functional
                  // updater more than once, and setLeadKey inside it would fire
                  // just as often.
                  const sisa = baris.filter((r) => r.key !== b.key);
                  setBaris(sisa);
                  if (leadKey === b.key && sisa[0]) setLeadKey(sisa[0].key);
                }}
              >
                Hapus
              </button>
            ) : null}
          </div>

          {b.mode === "existing" ? (
            <>
              <SearchSelect
                name={`id_partner_${i}`}
                options={partners.map((p) => ({ id: p.id, label: p.nama }))}
                defaultValue={b.idPartnerAwal}
                placeholder="Cari nama mitra..."
                ariaLabel="Mitra"
                required
                onValueChange={(idBaru) => setIdPartnerTerpilih((s) => ({ ...s, [b.key]: idBaru }))}
              />

              <div className="mt-3 border-t pt-2" style={inputGaya}>
                <div className="mb-2 flex gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`kontak_mode_${i}`}
                      value="existing"
                      checked={b.kontakMode === "existing"}
                      onChange={() =>
                        setBaris((s) => s.map((r) => (r.key === b.key ? { ...r, kontakMode: "existing" } : r)))
                      }
                    />
                    Pilih Kontak
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`kontak_mode_${i}`}
                      value="baru"
                      checked={b.kontakMode === "baru"}
                      onChange={() =>
                        setBaris((s) => s.map((r) => (r.key === b.key ? { ...r, kontakMode: "baru" } : r)))
                      }
                    />
                    Kontak Baru
                  </label>
                </div>

                {b.kontakMode === "existing" ? (
                  <SearchSelect
                    name={`id_kontak_${i}`}
                    options={contacts
                      .filter((c) => c.id_partner === idPartnerTerpilih[b.key])
                      .map((c) => ({ id: c.id, label: c.nama }))}
                    placeholder="Cari nama kontak..."
                    ariaLabel="Kontak Mitra"
                  />
                ) : (
                  <FormKontak i={i} />
                )}
              </div>
            </>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                name={`mitra_baru_nama_${i}`}
                placeholder="Nama Mitra (*)"
                aria-label="Nama Mitra"
                required
                className={`${inputKelas} sm:col-span-2`}
                style={inputGaya}
              />
              <select
                name={`mitra_baru_negara_${i}`}
                aria-label="Negara"
                required
                className={inputKelas}
                style={inputGaya}
                defaultValue=""
              >
                <option value="" disabled>
                  Negara (*)
                </option>
                {negara.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nama}
                  </option>
                ))}
              </select>
              <select name={`mitra_baru_jenis_${i}`} aria-label="Jenis Mitra" className={inputKelas} style={inputGaya} defaultValue="">
                <option value="">Jenis Mitra</option>
                {jenisMitra.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nama}
                  </option>
                ))}
              </select>
              <input name={`mitra_baru_kota_${i}`} placeholder="Kota" aria-label="Kota" className={inputKelas} style={inputGaya} />
              <input name={`mitra_baru_alamat_${i}`} placeholder="Alamat" aria-label="Alamat" className={inputKelas} style={inputGaya} />
              <input name={`mitra_baru_telp_${i}`} placeholder="No. Telp" aria-label="No. Telp Mitra" className={inputKelas} style={inputGaya} />
              <input
                name={`mitra_baru_homepage_${i}`}
                placeholder="Homepage"
                aria-label="Homepage"
                className={`${inputKelas} sm:col-span-2`}
                style={inputGaya}
              />

              <div className="border-t pt-2 sm:col-span-2" style={inputGaya}>
                <span className="mb-1 block text-xs font-medium">Kontak Mitra</span>
                <FormKontak i={i} />
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        className="rounded-lg border px-3 py-1.5 text-xs"
        style={inputGaya}
        onClick={() =>
          setBaris((s) => [
            ...s,
            { key: kunciBerikutnya.current++, mode: "existing", kontakMode: "existing", idPartnerAwal: null },
          ])
        }
      >
        + Tambah Mitra Lain
      </button>
      <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
        Gunakan tombol ini hanya bila dokumen ditandatangani lebih dari satu mitra.
      </span>
    </div>
  );
}

/** The full PARTNER_CONTACT entity, filled inline for row index `i`. */
function FormKontak({ i }: { i: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input
        name={`kontak_nama_${i}`}
        placeholder="Nama Kontak"
        aria-label="Nama Kontak"
        className={`${inputKelas} sm:col-span-2`}
        style={inputGaya}
      />
      <input name={`kontak_jabatan_${i}`} placeholder="Jabatan" aria-label="Jabatan Kontak" className={inputKelas} style={inputGaya} />
      <input name={`kontak_email_${i}`} type="email" placeholder="Email" aria-label="Email Kontak" className={inputKelas} style={inputGaya} />
      <input
        name={`kontak_telp_${i}`}
        aria-label="No. Telp Kontak"
        placeholder="No. Telp"
        className={`${inputKelas} sm:col-span-2`}
        style={inputGaya}
      />
    </div>
  );
}
