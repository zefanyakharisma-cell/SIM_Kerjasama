"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { DAFTAR, TABEL, adalahDaftar, adalahTabel, type TabelKey } from "@/lib/master-data";

/**
 * Master Data CRUD (Revisi V6 §2). RLS already limits writes to IO Admin;
 * the role check here only turns a silent RLS no-op into a clear redirect.
 *
 * Every action ends on the tab it came from with a one-line outcome in the
 * URL (`galat` / `info`), so a refused write is visible instead of only
 * logged. The proposal form reads these tables on every request, so a change
 * shows there at once.
 */

type Hasil = { galat?: string; info?: string };

function balik(tab: string, hasil: Hasil = {}): never {
  revalidatePath("/master-data");
  revalidatePath("/buat");
  const p = new URLSearchParams({ tab });
  if (hasil.galat) p.set("galat", hasil.galat);
  if (hasil.info) p.set("info", hasil.info);
  redirect(`/master-data?${p}`);
}

async function klienAdmin() {
  const akun = await akunSaatIni();
  if (akun?.role !== "io_admin") redirect("/dashboard");
  return supabaseServer();
}

const teks = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const teksAtauNull = (f: FormData, k: string) => teks(f, k) || null;
const angkaAtauNull = (f: FormData, k: string) => {
  const v = teks(f, k).replace(",", ".");
  return v === "" || Number.isNaN(Number(v)) ? null : Number(v);
};

/** A database refusal in words an admin can act on. */
function pesanGalat(e: { code?: string; message: string }): string {
  if (e.code === "23505") return "Nilai itu sudah ada.";
  if (e.code === "23503") return "Data ini masih dipakai data lain.";
  if (e.code === "23514") return "Isian tidak memenuhi aturan data.";
  return e.message;
}

function tabDari(f: FormData): TabelKey {
  const tab = f.get("tab");
  if (!adalahTabel(tab)) redirect("/master-data");
  return tab;
}

// ---- Shared: delete / (de)activate ---------------------------------------

/**
 * Deletes when nothing references the row; when something does (FK 23503)
 * the row is retired instead, so past proposals keep their value (BR-23).
 */
export async function hapus(f: FormData) {
  const tab = tabDari(f);
  const id = Number(f.get("id"));
  const klien = await klienAdmin();
  const { error } = await klien.from(TABEL[tab]).delete().eq("id", id);
  if (!error) balik(tab, { info: "Data dihapus." });
  if (error.code !== "23503") balik(tab, { galat: pesanGalat(error) });

  const { error: galatNonaktif } = await klien.from(TABEL[tab]).update({ is_active: false }).eq("id", id);
  if (galatNonaktif) balik(tab, { galat: pesanGalat(galatNonaktif) });
  balik(tab, {
    info: "Data masih dipakai dokumen atau data lain, jadi dinonaktifkan: hilang dari formulir, tetap tersimpan pada data lama.",
  });
}

export async function aturAktif(f: FormData) {
  const tab = tabDari(f);
  const klien = await klienAdmin();
  const { error } = await klien
    .from(TABEL[tab])
    .update({ is_active: f.get("aktif") === "1" })
    .eq("id", Number(f.get("id")));
  balik(tab, error ? { galat: pesanGalat(error) } : {});
}

// ---- Lookup lists --------------------------------------------------------

export async function simpanNilai(f: FormData) {
  const tab = tabDari(f);
  if (!adalahDaftar(tab)) balik(tab);
  const d = DAFTAR[tab];
  const nilai = teks(f, "nilai");
  if (!nilai) balik(tab, { galat: `${d.label} tidak boleh kosong.` });

  const klien = await klienAdmin();
  const baris: Record<string, unknown> = { [d.kolom]: nilai };
  // Only the agenda form carries the checkbox; unchecked sends nothing.
  if (tab === "agenda") baris.is_amendment = f.get("is_amendment") === "on";
  const id = Number(f.get("id") ?? 0);
  const { error } = id
    ? await klien.from(d.tabel).update(baris).eq("id", id)
    : await klien.from(d.tabel).insert(baris as any);
  balik(tab, error ? { galat: pesanGalat(error) } : { info: id ? "Perubahan disimpan." : `${d.label} ditambahkan.` });
}

// ---- Mitra ---------------------------------------------------------------

export async function simpanMitra(f: FormData) {
  const nama = teks(f, "nama");
  const idNegara = Number(f.get("id_negara") ?? 0);
  if (!nama || !idNegara) balik("mitra", { galat: "Nama mitra dan negara wajib diisi." });

  const klien = await klienAdmin();
  // is_international follows the country — the one domestic/international
  // source (DR-07) — never a separate choice.
  const { data: negara } = await klien.from("negara").select("is_domestic").eq("id", idNegara).single();
  const baris = {
    nama,
    id_negara: idNegara,
    is_international: !(negara?.is_domestic ?? false),
    id_jenis_mitra: Number(f.get("id_jenis_mitra") ?? 0) || null,
    kota: teksAtauNull(f, "kota"),
    alamat: teksAtauNull(f, "alamat"),
    no_telp: teksAtauNull(f, "no_telp"),
    homepage: teksAtauNull(f, "homepage"),
    afiliasi_group: teksAtauNull(f, "afiliasi_group"),
  };

  let id = Number(f.get("id") ?? 0);
  if (id) {
    const { error } = await klien.from("partner").update(baris).eq("id", id);
    if (error) balik("mitra", { galat: pesanGalat(error) });
  } else {
    const { data, error } = await klien.from("partner").insert(baris).select("id").single();
    if (error || !data) balik("mitra", { galat: pesanGalat(error ?? { message: "Mitra gagal disimpan." }) });
    id = data.id;
  }

  // The primary contact: edited in place when there is one, created when
  // the admin fills in a name for a partner without one.
  const kontak = {
    nama: teks(f, "kontak_nama"),
    jabatan: teksAtauNull(f, "kontak_jabatan"),
    email: teksAtauNull(f, "kontak_email"),
    no_telp: teksAtauNull(f, "kontak_telp"),
  };
  const idKontak = Number(f.get("id_partner_contact") ?? 0);
  if (idKontak && kontak.nama) {
    const { error } = await klien.from("partner_contact").update(kontak).eq("id", idKontak).eq("id_partner", id);
    if (error) balik("mitra", { galat: pesanGalat(error) });
  } else if (!idKontak && kontak.nama) {
    const { data, error } = await klien
      .from("partner_contact")
      .insert({ ...kontak, id_partner: id })
      .select("id")
      .single();
    if (error || !data) balik("mitra", { galat: pesanGalat(error ?? { message: "Kontak gagal disimpan." }) });
    await klien.from("partner").update({ id_partner_contact: data.id }).eq("id", id);
  }
  balik("mitra", { info: "Mitra disimpan." });
}

export async function gabungMitra(f: FormData) {
  const klien = await klienAdmin();
  const { error } = await klien.rpc("gabung_partner", {
    p_dari: Number(f.get("dari")),
    p_ke: Number(f.get("ke")),
  });
  balik("mitra", error ? { galat: pesanGalat(error) } : { info: "Mitra digabungkan." });
}

// ---- Jabatan / Pegawai ---------------------------------------------------

export async function simpanJabatan(f: FormData) {
  const nama = teks(f, "nama");
  const idUnit = Number(f.get("id_unit") ?? 0);
  if (!nama || !idUnit) balik("jabatan", { galat: "Nama jabatan dan unit wajib diisi." });
  const tier = Number(f.get("tier_disposisi") ?? 0);
  const baris = {
    nama,
    id_unit: idUnit,
    tier_disposisi: tier >= 1 && tier <= 3 ? tier : null,
    id_pegawai: Number(f.get("id_pegawai") ?? 0) || null,
  };
  const klien = await klienAdmin();
  const id = Number(f.get("id") ?? 0);
  const { error } = id
    ? await klien.from("jabatan").update(baris).eq("id", id)
    : await klien.from("jabatan").insert(baris);
  balik("jabatan", error ? { galat: pesanGalat(error) } : { info: "Jabatan disimpan." });
}

export async function simpanPegawai(f: FormData) {
  const nama = teks(f, "nama");
  if (!nama) balik("pegawai", { galat: "Nama pegawai wajib diisi." });
  const baris = { nama, email: teksAtauNull(f, "email"), no_hp: teksAtauNull(f, "no_hp") };
  const klien = await klienAdmin();
  const id = Number(f.get("id") ?? 0);
  const { error } = id
    ? await klien.from("pegawai").update(baris).eq("id", id)
    : await klien.from("pegawai").insert(baris);
  balik("pegawai", error ? { galat: pesanGalat(error) } : { info: "Pegawai disimpan." });
}

// ---- Unit ----------------------------------------------------------------

export async function simpanUnit(f: FormData) {
  const nama = teks(f, "nama");
  const idJenis = Number(f.get("id_jenis_unit") ?? 0);
  if (!nama || !idJenis) balik("unit", { galat: "Nama unit dan jenis unit wajib diisi." });
  const id = Number(f.get("id") ?? 0);
  const idInduk = Number(f.get("id_parent_unit") ?? 0) || null;
  const klien = await klienAdmin();

  // The Lingkup cascade walks this tree recursively, so a unit may never end
  // up under itself: walk up from the chosen parent and refuse if we meet it.
  if (id && idInduk) {
    const { data: semua } = await klien.from("unit").select("id, id_parent_unit");
    const induk = new Map((semua ?? []).map((u) => [u.id, u.id_parent_unit]));
    for (let p: number | null = idInduk, n = 0; p != null && n < 100; p = induk.get(p) ?? null, n++) {
      if (p === id) balik("unit", { galat: "Unit induk tidak boleh unit itu sendiri atau turunannya." });
    }
  }

  const baris = { nama, id_parent_unit: idInduk, id_jenis_unit: idJenis };
  const { error } = id
    ? await klien.from("unit").update(baris).eq("id", id)
    : await klien.from("unit").insert(baris);
  balik("unit", error ? { galat: pesanGalat(error) } : { info: "Unit disimpan." });
}

// ---- Negara --------------------------------------------------------------

export async function simpanNegara(f: FormData) {
  const kode = teks(f, "kode").toUpperCase();
  const nama = teks(f, "nama");
  if (!kode || !nama) balik("negara", { galat: "Kode dan nama negara wajib diisi." });
  const isDomestic = f.get("is_domestic") === "on";
  // Blank coordinates take the country off Peta Mitra Global rather than
  // pinning it at 0°,0°.
  const baris = {
    kode,
    nama,
    is_domestic: isDomestic,
    latitude: angkaAtauNull(f, "latitude"),
    longitude: angkaAtauNull(f, "longitude"),
  };
  const klien = await klienAdmin();
  const id = Number(f.get("id") ?? 0);
  const { error } = id
    ? await klien.from("negara").update(baris).eq("id", id)
    : await klien.from("negara").insert(baris);
  if (error) balik("negara", { galat: pesanGalat(error) });

  // partner.is_international is stored from the country (DR-07); keep the
  // partners of a re-classified country in step so the KPIs stay right.
  if (id) {
    await klien.from("partner").update({ is_international: !isDomestic }).eq("id_negara", id);
  }
  revalidatePath("/dashboard");
  balik("negara", { info: "Negara disimpan." });
}
