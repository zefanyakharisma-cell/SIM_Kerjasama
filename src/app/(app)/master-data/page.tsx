import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { Tabs } from "@/components/tabs";
import { TombolHapus } from "@/components/tombol-hapus";
import { DAFTAR, TABEL, adalahDaftar, type TabelKey } from "@/lib/master-data";
import {
  aturAktif,
  gabungMitra,
  simpanJabatan,
  simpanMitra,
  simpanNegara,
  simpanNilai,
  simpanPegawai,
  simpanUnit,
} from "@/lib/actions/master-data";

/**
 * Master Data — the entities the dashboard and workflow depend on (mitra,
 * jabatan, pegawai, unit, negara) and the lookup lists the proposal form picks
 * from, one tab each, each with full create / edit / delete (Revisi V6 §2).
 * Settings (`/admin`) holds only system rules, so nothing is edited in two
 * places.
 *
 * Each entity tab has one form card on top: "Tambah" by default, "Ubah" for
 * the row picked with `?ubah=id`. One form per page rather than one per row
 * keeps a 500-partner list from rendering 500 country dropdowns.
 */
export const dynamic = "force-dynamic";

const TAB = Object.fromEntries(
  (Object.keys(TABEL) as TabelKey[]).map((k) => [
    k,
    adalahDaftar(k)
      ? DAFTAR[k].label
      : { mitra: "Mitra", jabatan: "Jabatan", pegawai: "Pegawai", unit: "Unit", negara: "Negara" }[k],
  ]),
) as Record<TabelKey, string>;

const gaya = { borderColor: "var(--border)" };
const input = "w-full rounded-lg border px-2 py-1.5 text-sm";
const redup = { color: "var(--text-muted)" };

function Kartu({ judul, children }: { judul?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-xl border bg-white p-4" style={gaya}>
      {judul ? <h2 className="mb-3 text-sm font-semibold">{judul}</h2> : null}
      {children}
    </div>
  );
}

function Keterangan({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs" style={redup}>
      {children}
    </p>
  );
}

function Isian({ label, children, lebar }: { label: string; children: React.ReactNode; lebar?: boolean }) {
  return (
    <label className={`block text-xs ${lebar ? "sm:col-span-2" : ""}`}>
      <span className="mb-0.5 block" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Simpan({ ubah, batal }: { ubah: boolean; batal: Route }) {
  return (
    <div className="flex items-center gap-3 sm:col-span-2">
      <SubmitButton
        labelMenunggu="Menyimpan…"
        className="rounded-lg px-4 py-2 text-sm font-medium text-white"
        style={{ background: "var(--midnight)" }}
      >
        {ubah ? "Simpan Perubahan" : "Tambah"}
      </SubmitButton>
      {ubah ? (
        <Link href={batal} className="text-xs underline" style={{ color: "var(--text-secondary)" }}>
          Batal
        </Link>
      ) : null}
    </div>
  );
}

/** Row actions shared by every tab: edit link, (de)activate, delete. */
function Aksi({
  tab,
  id,
  nama,
  aktif,
  ubahHref,
}: {
  tab: TabelKey;
  id: number;
  nama: string;
  aktif: boolean;
  ubahHref?: Route;
}) {
  return (
    <span className="flex shrink-0 items-center gap-3">
      {ubahHref ? (
        <Link href={ubahHref} className="text-xs underline" style={{ color: "var(--midnight)" }}>
          Ubah
        </Link>
      ) : null}
      <form action={aturAktif}>
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="aktif" value={aktif ? "0" : "1"} />
        <SubmitButton
          labelMenunggu="Memproses…"
          className="text-xs underline"
          style={{ color: aktif ? "var(--text-secondary)" : "var(--status-active)" }}
        >
          {aktif ? "Nonaktifkan" : "Aktifkan"}
        </SubmitButton>
      </form>
      <TombolHapus tab={tab} id={id} nama={nama} />
    </span>
  );
}

function Nonaktif({ aktif }: { aktif: boolean }) {
  return aktif ? null : (
    <span className="ml-2 rounded-full border px-1.5 text-[10px]" style={{ ...gaya, ...redup }}>
      nonaktif
    </span>
  );
}

export default async function MasterData({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; jenis?: string; ubah?: string; q?: string; galat?: string; info?: string }>;
}) {
  const akun = await akunSaatIni();
  if (akun?.role !== "io_admin") {
    redirect("/dashboard");
  }

  const { tab, jenis, ubah: ubahMentah, q, galat, info } = await searchParams;
  const aktif: TabelKey = tab && Object.hasOwn(TAB, tab) ? (tab as TabelKey) : "mitra";
  const idUbah = Number(ubahMentah ?? 0) || null;
  const supabase = await supabaseServer();

  const halaman = (isi: React.ReactNode) => (
    <div className="max-w-4xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
          Master Data
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Data acuan yang dipakai dashboard, formulir Buat Kerja Sama dan alur kerja. Perubahan
          langsung berlaku di formulir.
        </p>
      </header>
      <Tabs basePath="/master-data" tabs={TAB} aktif={aktif} />
      {galat || info ? (
        <p
          role="status"
          className="mb-4 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: galat ? "var(--action-danger)" : "var(--status-active)",
            color: galat ? "var(--action-danger)" : "var(--text-primary)",
          }}
        >
          {galat ?? info}
        </p>
      ) : null}
      {isi}
    </div>
  );
  const tautanTab = `/master-data?tab=${aktif}` as Route;
  const tautanUbah = (id: number) => `/master-data?tab=${aktif}&ubah=${id}` as Route;

  // ---- Lookup lists: inline rename, since each is a single value. --------
  if (adalahDaftar(aktif)) {
    const d = DAFTAR[aktif];
    const kolomPilih = ["id", d.kolom, "is_active", aktif === "agenda" ? "is_amendment" : null]
      .filter(Boolean)
      .join(", ");
    const { data } = await supabase.from(d.tabel).select(kolomPilih).order(d.kolom);
    const baris = (data ?? []) as any[];

    return halaman(
      <>
        <Kartu judul={`Tambah ${d.label}`}>
          <form action={simpanNilai} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="tab" value={aktif} />
            <input name="nilai" required aria-label={`${d.label} baru`} className={`${input} min-w-0 flex-1`} style={gaya} />
            {aktif === "agenda" ? (
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" name="is_amendment" />
                adendum
              </label>
            ) : null}
            <SubmitButton
              labelMenunggu="Menyimpan…"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ background: "var(--midnight)" }}
            >
              Tambah
            </SubmitButton>
          </form>
        </Kartu>
        <Kartu>
          <Keterangan>
            Pilihan untuk formulir Buat Kerja Sama. Hapus menghapus nilai yang belum pernah dipakai;
            nilai yang sudah dipakai proposal dinonaktifkan — hilang dari formulir, tetap tersimpan
            pada proposal lama.
          </Keterangan>
          <ul className="divide-y text-sm" style={gaya}>
            {baris.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
                <form action={simpanNilai} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="tab" value={aktif} />
                  <input type="hidden" name="id" value={o.id} />
                  <input
                    name="nilai"
                    required
                    aria-label={`${d.label} ${o.id}`}
                    defaultValue={o[d.kolom]}
                    className={`${input} min-w-0 flex-1`}
                    style={{ ...gaya, color: o.is_active ? undefined : "var(--text-muted)" }}
                  />
                  {aktif === "agenda" ? (
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="is_amendment" defaultChecked={o.is_amendment} />
                      adendum
                    </label>
                  ) : null}
                  <SubmitButton labelMenunggu="Menyimpan…" className="text-xs underline">
                    Simpan
                  </SubmitButton>
                </form>
                <Nonaktif aktif={o.is_active} />
                <Aksi tab={aktif} id={o.id} nama={o[d.kolom]} aktif={o.is_active} />
              </li>
            ))}
            {!baris.length ? (
              <li className="py-6 text-center" style={redup}>
                Belum ada nilai tersimpan.
              </li>
            ) : null}
          </ul>
        </Kartu>
      </>,
    );
  }

  // ---- Mitra --------------------------------------------------------------
  if (aktif === "mitra") {
    let query = supabase
      .from("partner")
      .select("id, nama, is_international, kota, is_active, negara ( nama ), jenis_mitra ( nama )")
      .is("id_merged_into", null)
      .order("nama")
      .limit(200);
    if (jenis === "internasional") query = query.eq("is_international", true);
    if (jenis === "domestik") query = query.eq("is_international", false);
    const cari = (q ?? "").trim();
    if (cari) query = query.ilike("nama", `%${cari.replace(/[\\%_]/g, "\\$&")}%`);

    const [{ data: partner }, { data: duplikat }, { data: negara }, { data: jenisMitra }, { data: sasaran }] =
      await Promise.all([
        query,
        supabase.from("v_partner_duplikat").select("*").limit(50),
        supabase.from("negara").select("id, nama, is_active").order("nama"),
        supabase.from("jenis_mitra").select("id, nama, is_active").order("nama"),
        idUbah
          ? supabase.from("partner").select("*").eq("id", idUbah).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
    const p: any = sasaran;
    const { data: kontak } = p?.id_partner_contact
      ? await supabase.from("partner_contact").select("*").eq("id", p.id_partner_contact).maybeSingle()
      : { data: null };
    // Retired choices stay selectable only for the record already using them.
    const opsiNegara = (negara ?? []).filter((n) => n.is_active || n.id === p?.id_negara);
    const opsiJenis = (jenisMitra ?? []).filter((j) => j.is_active || j.id === p?.id_jenis_mitra);
    const filterHref = (k?: string) =>
      `/master-data?tab=mitra${k ? `&jenis=${k}` : ""}${cari ? `&q=${encodeURIComponent(cari)}` : ""}` as Route;

    return halaman(
      <>
        <Kartu judul={p ? `Ubah Mitra — ${p.nama}` : "Tambah Mitra"}>
          <form key={p?.id ?? "baru"} action={simpanMitra} className="grid gap-3 sm:grid-cols-2">
            {p ? <input type="hidden" name="id" value={p.id} /> : null}
            {kontak ? <input type="hidden" name="id_partner_contact" value={kontak.id} /> : null}
            <Isian label="Nama Mitra (*)" lebar>
              <input name="nama" required defaultValue={p?.nama ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="Negara (*) — menentukan Dalam/Luar Negeri">
              <select name="id_negara" required defaultValue={p?.id_negara ?? ""} className={input} style={gaya}>
                <option value="">Pilih negara…</option>
                {opsiNegara.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nama}
                  </option>
                ))}
              </select>
            </Isian>
            <Isian label="Jenis Mitra">
              <select name="id_jenis_mitra" defaultValue={p?.id_jenis_mitra ?? ""} className={input} style={gaya}>
                <option value="">—</option>
                {opsiJenis.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nama}
                  </option>
                ))}
              </select>
            </Isian>
            <Isian label="Kota">
              <input name="kota" defaultValue={p?.kota ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="No. Telp">
              <input name="no_telp" defaultValue={p?.no_telp ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="Alamat" lebar>
              <input name="alamat" defaultValue={p?.alamat ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="Homepage">
              <input name="homepage" type="url" defaultValue={p?.homepage ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="Afiliasi / Group">
              <input name="afiliasi_group" defaultValue={p?.afiliasi_group ?? ""} className={input} style={gaya} />
            </Isian>
            <p className="pt-1 text-xs font-semibold sm:col-span-2" style={{ color: "var(--text-secondary)" }}>
              Kontak utama
            </p>
            <Isian label="Nama Kontak">
              <input name="kontak_nama" defaultValue={kontak?.nama ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="Jabatan Kontak">
              <input name="kontak_jabatan" defaultValue={kontak?.jabatan ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="Email Kontak">
              <input name="kontak_email" type="email" defaultValue={kontak?.email ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="Telp Kontak">
              <input name="kontak_telp" defaultValue={kontak?.no_telp ?? ""} className={input} style={gaya} />
            </Isian>
            <Simpan ubah={Boolean(p)} batal={tautanTab} />
          </form>
        </Kartu>

        <Kartu judul="Daftar Mitra">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            {[
              { key: undefined, label: "Semua" },
              { key: "internasional", label: "Internasional" },
              { key: "domestik", label: "Domestik" },
            ].map((f) => {
              const pilih = jenis === f.key || (!jenis && !f.key);
              return (
                <Link
                  key={f.label}
                  href={filterHref(f.key)}
                  className="rounded-full border px-3 py-1"
                  style={{
                    ...gaya,
                    background: pilih ? "var(--midnight)" : "white",
                    color: pilih ? "white" : "var(--text-secondary)",
                  }}
                >
                  {f.label}
                </Link>
              );
            })}
            <form method="get" action="/master-data" className="ml-auto flex gap-1">
              <input type="hidden" name="tab" value="mitra" />
              {jenis ? <input type="hidden" name="jenis" value={jenis} /> : null}
              <input
                type="search"
                name="q"
                defaultValue={cari}
                placeholder="Cari nama mitra…"
                aria-label="Cari nama mitra"
                className="rounded-lg border px-2 py-1 text-xs"
                style={gaya}
              />
              <button type="submit" className="rounded-lg border px-2 py-1" style={gaya}>
                Cari
              </button>
            </form>
          </div>
          <ul className="divide-y" style={gaya}>
            {(partner ?? []).map((m: any) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {m.nama}
                  <Nonaktif aktif={m.is_active} />
                  <span className="block text-xs" style={redup}>
                    {m.negara?.nama ?? "—"} · {m.is_international ? "Internasional" : "Domestik"}
                    {m.jenis_mitra?.nama ? ` · ${m.jenis_mitra.nama}` : ""} · {m.kota ?? "kota belum diisi"}
                  </span>
                </span>
                <Aksi tab="mitra" id={m.id} nama={m.nama} aktif={m.is_active} ubahHref={tautanUbah(m.id)} />
              </li>
            ))}
            {!partner?.length ? (
              <li className="py-6 text-center text-sm" style={redup}>
                Tidak ada mitra untuk filter ini.
              </li>
            ) : null}
          </ul>
          {(partner?.length ?? 0) >= 200 ? (
            <p className="mt-2 text-xs" style={redup}>
              Menampilkan 200 mitra pertama — gunakan pencarian untuk mempersempit.
            </p>
          ) : null}
        </Kartu>

        <Kartu judul="Gabung Duplikat">
          <Keterangan>
            Deteksi bersifat saran; keputusan tetap manual. Penggabungan mengarahkan ulang seluruh
            referensi dalam satu transaksi dan tidak pernah menghapus — catatan lama tetap ada,
            ditandai tergabung.
          </Keterangan>
          {(duplikat ?? []).length === 0 ? (
            <p className="text-sm" style={redup}>
              Tidak ada dugaan duplikat saat ini.
            </p>
          ) : (
            <ul className="space-y-2">
              {(duplikat ?? []).map((d: any) => (
                <li key={`${d.id_a}-${d.id_b}`} className="rounded-lg border p-2 text-sm" style={gaya}>
                  <div className="mb-2">
                    <strong>{d.nama_a}</strong> ↔ <strong>{d.nama_b}</strong>{" "}
                    <span className="text-xs" style={redup}>
                      kemiripan {d.kemiripan}
                      {d.homepage_sama ? " · homepage sama" : ""}
                    </span>
                  </div>
                  <form action={gabungMitra} className="flex flex-wrap items-center gap-2">
                    <select name="dari" aria-label="Mitra yang digabungkan" className="rounded-lg border px-2 py-1 text-xs" style={gaya}>
                      <option value={d.id_a}>{d.nama_a} (digabungkan)</option>
                      <option value={d.id_b}>{d.nama_b} (digabungkan)</option>
                    </select>
                    <select name="ke" aria-label="Mitra yang dipertahankan" className="rounded-lg border px-2 py-1 text-xs" style={gaya}>
                      <option value={d.id_b}>{d.nama_b} (dipertahankan)</option>
                      <option value={d.id_a}>{d.nama_a} (dipertahankan)</option>
                    </select>
                    <SubmitButton
                      labelMenunggu="Menggabungkan…"
                      className="rounded-lg px-2 py-1 text-xs font-medium text-white"
                      style={{ background: "var(--action-danger)" }}
                    >
                      Gabungkan
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Kartu>
      </>,
    );
  }

  // ---- Jabatan ------------------------------------------------------------
  if (aktif === "jabatan") {
    const [{ data: jabatan }, { data: pegawai }, { data: unit }] = await Promise.all([
      supabase
        .from("jabatan")
        .select("id, nama, tier_disposisi, kepala_unit, id_unit, id_pegawai, is_active, unit ( nama ), pegawai ( nama )")
        .order("nama"),
      supabase.from("pegawai").select("id, nama, is_active").order("nama"),
      supabase.from("unit").select("id, nama, is_active").order("nama"),
    ]);
    const j: any = idUbah ? (jabatan ?? []).find((x) => x.id === idUbah) : null;

    return halaman(
      <>
        <Kartu judul={j ? `Ubah Jabatan — ${j.nama}` : "Tambah Jabatan"}>
          <form key={j?.id ?? "baru"} action={simpanJabatan} className="grid gap-3 sm:grid-cols-2">
            {j ? <input type="hidden" name="id" value={j.id} /> : null}
            <Isian label="Nama Jabatan (*)" lebar>
              <input name="nama" required defaultValue={j?.nama ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="Unit (*)">
              <select name="id_unit" required defaultValue={j?.id_unit ?? ""} className={input} style={gaya}>
                <option value="">Pilih unit…</option>
                {(unit ?? [])
                  .filter((u) => u.is_active || u.id === j?.id_unit)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nama}
                    </option>
                  ))}
              </select>
            </Isian>
            <Isian label="Tier Approval">
              <select name="tier_disposisi" defaultValue={j?.tier_disposisi ?? ""} className={input} style={gaya}>
                <option value="">Bukan approver</option>
                <option value="1">Tier 1</option>
                <option value="2">Tier 2</option>
                <option value="3">Tier 3</option>
              </select>
            </Isian>
            <Isian label="Kontak Pegawai (Nama Kontak/No.HP di laporan)" lebar>
              <select name="id_pegawai" defaultValue={j?.id_pegawai ?? ""} className={input} style={gaya}>
                <option value="">Belum ada kontak</option>
                {(pegawai ?? [])
                  .filter((p) => p.is_active || p.id === j?.id_pegawai)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama}
                    </option>
                  ))}
              </select>
            </Isian>
            {/* The head a Disposisi Evaluasi is routed to (Revisi V7 §5). */}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="kepala_unit" defaultChecked={j?.kepala_unit ?? false} />
              Kepala unit (Dekan / Kepala Unit Pendukung)
            </label>
            <Simpan ubah={Boolean(j)} batal={tautanTab} />
          </form>
        </Kartu>
        <Kartu>
          <ul className="divide-y text-sm" style={gaya}>
            {(jabatan ?? []).map((x: any) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  {x.nama}
                  <Nonaktif aktif={x.is_active} />
                  <span className="block text-xs" style={redup}>
                    {x.unit?.nama ?? "—"} · {x.tier_disposisi ? `Tier ${x.tier_disposisi}` : "Bukan approver"} ·{" "}
                    {x.kepala_unit ? "Kepala unit · " : ""}
                    {x.pegawai?.nama ?? "belum ada kontak"}
                  </span>
                </span>
                <Aksi tab="jabatan" id={x.id} nama={x.nama} aktif={x.is_active} ubahHref={tautanUbah(x.id)} />
              </li>
            ))}
          </ul>
        </Kartu>
      </>,
    );
  }

  // ---- Pegawai ------------------------------------------------------------
  if (aktif === "pegawai") {
    const { data: pegawai } = await supabase
      .from("pegawai")
      .select("id, nama, email, no_hp, is_active")
      .order("nama");
    const p: any = idUbah ? (pegawai ?? []).find((x) => x.id === idUbah) : null;

    return halaman(
      <>
        <Kartu judul={p ? `Ubah Pegawai — ${p.nama}` : "Tambah Pegawai"}>
          <form key={p?.id ?? "baru"} action={simpanPegawai} className="grid gap-3 sm:grid-cols-2">
            {p ? <input type="hidden" name="id" value={p.id} /> : null}
            <Isian label="Nama (*)" lebar>
              <input name="nama" required defaultValue={p?.nama ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="Email">
              <input name="email" type="email" defaultValue={p?.email ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="No. HP">
              <input name="no_hp" defaultValue={p?.no_hp ?? ""} className={input} style={gaya} />
            </Isian>
            <Simpan ubah={Boolean(p)} batal={tautanTab} />
          </form>
        </Kartu>
        <Kartu>
          <ul className="divide-y text-sm" style={gaya}>
            {(pegawai ?? []).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  {x.nama}
                  <Nonaktif aktif={x.is_active} />
                  <span className="block text-xs" style={redup}>
                    {x.email ?? "—"} · {x.no_hp ?? "—"}
                  </span>
                </span>
                <Aksi tab="pegawai" id={x.id} nama={x.nama} aktif={x.is_active} ubahHref={tautanUbah(x.id)} />
              </li>
            ))}
            {!pegawai?.length ? (
              <li className="py-6 text-center" style={redup}>
                Belum ada pegawai tersimpan.
              </li>
            ) : null}
          </ul>
        </Kartu>
      </>,
    );
  }

  // ---- Unit ---------------------------------------------------------------
  if (aktif === "unit") {
    const [{ data: unit }, { data: jenisUnit }] = await Promise.all([
      supabase.from("unit").select("id, nama, id_parent_unit, id_jenis_unit, is_active").order("nama"),
      supabase.from("jenis_unit").select("id, jenis").order("id"),
    ]);
    const semua = unit ?? [];
    // Tree order with depth, so the list reads as the Lingkup tree does.
    const anak = new Map<number | null, typeof semua>();
    for (const u of semua) anak.set(u.id_parent_unit, [...(anak.get(u.id_parent_unit) ?? []), u]);
    const pohon: { u: (typeof semua)[number]; d: number }[] = [];
    const telusur = (induk: number | null, d: number) => {
      if (d > 20) return;
      for (const u of anak.get(induk) ?? []) {
        pohon.push({ u, d });
        telusur(u.id, d + 1);
      }
    };
    telusur(null, 0);
    const jenisNama = new Map((jenisUnit ?? []).map((j) => [j.id, j.jenis]));
    const x: any = idUbah ? semua.find((u) => u.id === idUbah) : null;

    return halaman(
      <>
        <Kartu judul={x ? `Ubah Unit — ${x.nama}` : "Tambah Unit"}>
          <Keterangan>
            Pohon unit ditelusuri cascade Lingkup Kerja Sama secara rekursif — pastikan induknya benar.
          </Keterangan>
          <form key={x?.id ?? "baru"} action={simpanUnit} className="grid gap-3 sm:grid-cols-2">
            {x ? <input type="hidden" name="id" value={x.id} /> : null}
            <Isian label="Nama Unit (*)" lebar>
              <input name="nama" required defaultValue={x?.nama ?? ""} className={input} style={gaya} />
            </Isian>
            <Isian label="Unit Induk">
              <select name="id_parent_unit" defaultValue={x?.id_parent_unit ?? ""} className={input} style={gaya}>
                <option value="">— (unit teratas)</option>
                {pohon
                  .filter(({ u }) => u.id !== x?.id && (u.is_active || u.id === x?.id_parent_unit))
                  .map(({ u, d }) => (
                    <option key={u.id} value={u.id}>
                      {"  ".repeat(d)}
                      {u.nama}
                    </option>
                  ))}
              </select>
            </Isian>
            <Isian label="Jenis Unit (*)">
              <select name="id_jenis_unit" required defaultValue={x?.id_jenis_unit ?? ""} className={input} style={gaya}>
                <option value="">Pilih…</option>
                {(jenisUnit ?? []).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.jenis}
                  </option>
                ))}
              </select>
            </Isian>
            <Simpan ubah={Boolean(x)} batal={tautanTab} />
          </form>
        </Kartu>
        <Kartu>
          <ul className="divide-y text-sm" style={gaya}>
            {pohon.map(({ u, d }) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1" style={{ paddingLeft: `${d * 16}px` }}>
                  {d > 0 ? "└ " : ""}
                  {u.nama}
                  <span className="ml-2 text-xs" style={redup}>
                    {jenisNama.get(u.id_jenis_unit) ?? ""}
                  </span>
                  <Nonaktif aktif={u.is_active} />
                </span>
                <Aksi tab="unit" id={u.id} nama={u.nama} aktif={u.is_active} ubahHref={tautanUbah(u.id)} />
              </li>
            ))}
          </ul>
        </Kartu>
      </>,
    );
  }

  // ---- Negara -------------------------------------------------------------
  const { data: negara } = await supabase
    .from("negara")
    .select("id, kode, nama, is_domestic, latitude, longitude, is_active")
    .order("nama");
  const n: any = idUbah ? (negara ?? []).find((x) => x.id === idUbah) : null;

  return halaman(
    <>
      <Kartu judul={n ? `Ubah Negara — ${n.nama}` : "Tambah Negara"}>
        <Keterangan>
          Satu-satunya sumber status dalam negeri / luar negeri; mengubahnya ikut memperbarui mitra
          negara ini. Koordinat menempatkan negara di Peta Mitra Global; tanpa koordinat, negara
          tidak tampil di peta.
        </Keterangan>
        <form key={n?.id ?? "baru"} action={simpanNegara} className="grid gap-3 sm:grid-cols-2">
          {n ? <input type="hidden" name="id" value={n.id} /> : null}
          <Isian label="Kode (*)">
            <input name="kode" required maxLength={3} defaultValue={n?.kode ?? ""} className={input} style={gaya} />
          </Isian>
          <Isian label="Nama (*)">
            <input name="nama" required defaultValue={n?.nama ?? ""} className={input} style={gaya} />
          </Isian>
          <Isian label="Latitude">
            <input name="latitude" inputMode="decimal" defaultValue={n?.latitude ?? ""} className={input} style={gaya} />
          </Isian>
          <Isian label="Longitude">
            <input name="longitude" inputMode="decimal" defaultValue={n?.longitude ?? ""} className={input} style={gaya} />
          </Isian>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="is_domestic" defaultChecked={n?.is_domestic ?? false} />
            Dalam Negeri
          </label>
          <Simpan ubah={Boolean(n)} batal={tautanTab} />
        </form>
      </Kartu>
      <Kartu>
        <ul className="divide-y text-sm" style={gaya}>
          {(negara ?? []).map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="text-xs" style={redup}>
                  {x.kode}
                </span>{" "}
                {x.nama}
                <Nonaktif aktif={x.is_active} />
                <span className="block text-xs" style={redup}>
                  {x.is_domestic ? "Dalam Negeri" : "Luar Negeri"} ·{" "}
                  {x.latitude != null && x.longitude != null ? `${x.latitude}, ${x.longitude}` : "tanpa koordinat"}
                </span>
              </span>
              <Aksi tab="negara" id={x.id} nama={x.nama} aktif={x.is_active} ubahHref={tautanUbah(x.id)} />
            </li>
          ))}
        </ul>
      </Kartu>
    </>,
  );
}
