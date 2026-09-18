import Link from "next/link";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { Tabs } from "@/components/tabs";

/**
 * Master Data — the entities the dashboard and workflow depend on (mitra,
 * jabatan, pegawai, unit, negara) and the lookup lists the proposal form picks
 * from (tujuan, manfaat, bidang, agenda), one tab each. Settings (`/admin`)
 * holds only system rules (approval tiers, thresholds), so nothing is edited
 * in two places.
 */
export const dynamic = "force-dynamic";

/**
 * The lookup lists, as a whitelist: a form names a key from here, never a
 * table. `aktif` is whether the table has is_active — bidang_kerjasama does
 * not, so its values can be renamed but not retired.
 */
const DAFTAR = {
  tujuan: { tabel: "tujuan_kerjasama", kolom: "nilai", label: "Tujuan", aktif: true },
  manfaat_mitra: { tabel: "manfaat_mitra", kolom: "nilai", label: "Manfaat Mitra", aktif: true },
  manfaat_petra: { tabel: "manfaat_petra", kolom: "nilai", label: "Manfaat Petra", aktif: true },
  bidang: { tabel: "bidang_kerjasama", kolom: "nama", label: "Bidang Kerja Sama", aktif: false },
  agenda: { tabel: "agenda", kolom: "nama", label: "Agenda Kerja Sama", aktif: true },
} as const;
type DaftarKey = keyof typeof DAFTAR;
const daftarDari = (v: FormDataEntryValue | null) =>
  typeof v === "string" && Object.hasOwn(DAFTAR, v) ? DAFTAR[v as DaftarKey] : null;

const TAB = {
  mitra: "Mitra",
  jabatan: "Jabatan",
  pegawai: "Pegawai",
  unit: "Unit",
  negara: "Negara",
  ...Object.fromEntries(Object.entries(DAFTAR).map(([k, d]) => [k, d.label])),
} as Record<"mitra" | "jabatan" | "pegawai" | "unit" | "negara" | DaftarKey, string>;
type TabKey = keyof typeof TAB;

const gaya = { borderColor: "var(--border)" };

export default async function MasterData({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; jenis?: string }>;
}) {
  const akun = await akunSaatIni();
  if (akun?.role !== "io_admin") {
    redirect("/dashboard");
  }

  const { tab, jenis } = await searchParams;
  const aktif: TabKey = (tab as TabKey) in TAB ? (tab as TabKey) : "mitra";

  const supabase = await supabaseServer();

  // Peta Mitra Global places each country by these; blank clears them and
  // takes the country off the map rather than pinning it at 0°,0°.
  async function simpanKoordinat(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const lat = String(formData.get("latitude") ?? "").trim().replace(",", ".");
    const lon = String(formData.get("longitude") ?? "").trim().replace(",", ".");
    await klien
      .from("negara")
      .update({
        latitude: lat === "" ? null : Number(lat),
        longitude: lon === "" ? null : Number(lon),
      })
      .eq("id", Number(formData.get("id")));
    revalidatePath("/master-data");
    revalidatePath("/dashboard");
  }

  async function simpanPegawaiJabatan(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const idPegawai = String(formData.get("id_pegawai") ?? "");
    await klien
      .from("jabatan")
      .update({ id_pegawai: idPegawai === "" ? null : Number(idPegawai) })
      .eq("id", Number(formData.get("id")));
    revalidatePath("/master-data");
  }

  async function tambahPegawai(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const email = String(formData.get("email") ?? "").trim();
    const noHp = String(formData.get("no_hp") ?? "").trim();
    await klien.from("pegawai").insert({
      nama: String(formData.get("nama") ?? "").trim(),
      email: email === "" ? null : email,
      no_hp: noHp === "" ? null : noHp,
    });
    revalidatePath("/master-data");
  }

  async function gabungMitra(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const { error } = await klien.rpc("gabung_partner", {
      p_dari: Number(formData.get("dari")),
      p_ke: Number(formData.get("ke")),
    });
    if (error) console.error("[simks] gabung_partner ditolak:", error.message);
    revalidatePath("/master-data");
  }

  // ---- Lookup lists. New values publish at once; cleanup deactivates rather
  // than deletes while anything still references the value (BR-23).
  async function tambahNilai(formData: FormData) {
    "use server";
    const d = daftarDari(formData.get("daftar"));
    const nilai = String(formData.get("nilai") ?? "").trim();
    if (!d || !nilai) return;
    const klien = await supabaseServer();
    const baris: Record<string, unknown> = { [d.kolom]: nilai };
    const { error } = await klien.from(d.tabel).insert(baris as any);
    if (error) console.error(`[simks] tambah ${d.tabel} ditolak:`, error.message);
    revalidatePath("/master-data");
  }

  async function ubahNilai(formData: FormData) {
    "use server";
    const d = daftarDari(formData.get("daftar"));
    const nilai = String(formData.get("nilai") ?? "").trim();
    if (!d || !nilai) return;
    const klien = await supabaseServer();
    const baris: Record<string, unknown> = { [d.kolom]: nilai };
    // Only the agenda form carries the checkbox; unchecked sends nothing.
    if (d.tabel === "agenda") baris.is_amendment = formData.get("is_amendment") === "on";
    const { error } = await klien.from(d.tabel).update(baris).eq("id", Number(formData.get("id")));
    if (error) console.error(`[simks] ubah ${d.tabel} ditolak:`, error.message);
    revalidatePath("/master-data");
  }

  async function aturAktif(formData: FormData) {
    "use server";
    const d = daftarDari(formData.get("daftar"));
    if (!d?.aktif) return;
    const klien = await supabaseServer();
    const { error } = await klien
      .from(d.tabel)
      .update({ is_active: formData.get("aktif") === "1" })
      .eq("id", Number(formData.get("id")));
    if (error) console.error(`[simks] status ${d.tabel} ditolak:`, error.message);
    revalidatePath("/master-data");
  }

  const nav = <Tabs basePath="/master-data" tabs={TAB} aktif={aktif} />;

  const Keterangan = ({ children }: { children: React.ReactNode }) => (
    <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
      {children}
    </p>
  );

  const judul = (
    <header className="mb-5">
      <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
        Master Data
      </h1>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Data acuan yang dipakai dashboard dan alur kerja kerja sama.
      </p>
    </header>
  );

  if (Object.hasOwn(DAFTAR, aktif)) {
    const kunci = aktif as DaftarKey;
    const d = DAFTAR[kunci];
    const kolomPilih = ["id", d.kolom, d.aktif ? "is_active" : null, kunci === "agenda" ? "is_amendment" : null]
      .filter(Boolean)
      .join(", ");
    const { data } = await supabase.from(d.tabel).select(kolomPilih).order(d.kolom);
    const baris = (data ?? []) as any[];
    const input = "min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm";

    return (
      <div className="max-w-4xl">
        {judul}
        {nav}
        <div className="mb-4 rounded-xl border bg-white p-4" style={gaya}>
          <Keterangan>
            Pilihan untuk formulir Buat Kerja Sama.
            {d.aktif
              ? " Nilai yang dinonaktifkan hilang dari formulir, tetapi tetap tersimpan pada proposal yang sudah memakainya — tidak pernah dihapus."
              : " Nilai tidak dapat dihapus karena dirujuk proposal; ubah namanya bila perlu."}
          </Keterangan>
          <ul className="divide-y text-sm" style={gaya}>
            {baris.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
                <form action={ubahNilai} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="daftar" value={kunci} />
                  <input type="hidden" name="id" value={o.id} />
                  <input
                    name="nilai"
                    required
                    aria-label={`${d.label} ${o.id}`}
                    defaultValue={o[d.kolom]}
                    className={input}
                    style={{ ...gaya, color: o.is_active === false ? "var(--text-muted)" : undefined }}
                  />
                  {kunci === "agenda" ? (
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="is_amendment" defaultChecked={o.is_amendment} />
                      adendum
                    </label>
                  ) : null}
                  <SubmitButton labelMenunggu="Menyimpan…" className="text-xs underline">
                    Simpan
                  </SubmitButton>
                </form>
                {d.aktif ? (
                  <form action={aturAktif}>
                    <input type="hidden" name="daftar" value={kunci} />
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="aktif" value={o.is_active ? "0" : "1"} />
                    <SubmitButton
                      labelMenunggu="Memproses…"
                      className="text-xs underline"
                      style={{ color: o.is_active ? "var(--action-danger)" : "var(--status-active)" }}
                    >
                      {o.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
            {!baris.length ? (
              <li className="py-6 text-center" style={{ color: "var(--text-muted)" }}>
                Belum ada nilai tersimpan.
              </li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-xl border bg-white p-4" style={gaya}>
          <h2 className="mb-3 text-sm font-semibold">Tambah {d.label}</h2>
          <form action={tambahNilai} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="daftar" value={kunci} />
            <input name="nilai" required aria-label={`${d.label} baru`} className={input} style={gaya} />
            <SubmitButton
              labelMenunggu="Menyimpan…"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ background: "var(--midnight)" }}
            >
              Tambah
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  if (aktif === "mitra") {
    let query = supabase
      .from("partner")
      .select("id, nama, is_international, kota")
      .eq("is_active", true)
      .order("nama")
      .limit(500);
    if (jenis === "internasional") query = query.eq("is_international", true);
    if (jenis === "domestik") query = query.eq("is_international", false);
    const [{ data: partner }, { data: duplikat }] = await Promise.all([
      query,
      supabase.from("v_partner_duplikat").select("*").limit(50),
    ]);

    return (
      <div className="max-w-4xl">
        {judul}
        {nav}
        <div className="mb-3 flex flex-wrap gap-1 text-xs">
          {[
            { key: undefined, label: "Semua" },
            { key: "internasional", label: "Internasional" },
            { key: "domestik", label: "Domestik" },
          ].map((f) => (
            <Link
              key={f.label}
              href={`/master-data?tab=mitra${f.key ? `&jenis=${f.key}` : ""}` as Route}
              className="rounded-full border px-3 py-1"
              style={{
                ...gaya,
                background: jenis === f.key || (!jenis && !f.key) ? "var(--midnight)" : "white",
                color: jenis === f.key || (!jenis && !f.key) ? "white" : "var(--text-secondary)",
              }}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="mb-4 rounded-xl border bg-white p-4" style={gaya}>
          <h2 className="text-sm font-semibold">Daftar Mitra</h2>
          <Keterangan>
            Peta Mitra Global menempatkan mitra menurut negaranya; koordinat negara diatur di
            tab Negara.
          </Keterangan>
          <ul className="divide-y" style={gaya}>
            {(partner ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">{p.nama}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {p.is_international ? "Internasional" : "Domestik"} · {p.kota ?? "kota belum diisi"}
                </span>
              </li>
            ))}
            {!partner?.length ? (
              <li className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                Tidak ada mitra untuk filter ini.
              </li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-xl border bg-white p-4" style={gaya}>
          <h2 className="text-sm font-semibold">Gabung Duplikat</h2>
          <Keterangan>
            Deteksi bersifat saran; keputusan tetap manual. Penggabungan mengarahkan ulang
            seluruh referensi dalam satu transaksi dan tidak pernah menghapus — catatan lama
            tetap ada, ditandai tergabung.
          </Keterangan>
          {(duplikat ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Tidak ada dugaan duplikat saat ini.
            </p>
          ) : (
            <ul className="space-y-2">
              {(duplikat ?? []).map((d: any) => (
                <li key={`${d.id_a}-${d.id_b}`} className="rounded-lg border p-2 text-sm" style={gaya}>
                  <div className="mb-2">
                    <strong>{d.nama_a}</strong> ↔ <strong>{d.nama_b}</strong>{" "}
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
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
        </div>
      </div>
    );
  }

  if (aktif === "jabatan") {
    const [{ data: jabatan }, { data: pegawai }] = await Promise.all([
      supabase.from("jabatan").select("id, nama, tier_disposisi, id_pegawai").order("nama"),
      supabase.from("pegawai").select("id, nama").eq("is_active", true).order("nama"),
    ]);
    return (
      <div className="max-w-4xl">
        {judul}
        {nav}
        <div className="rounded-xl border bg-white p-4" style={gaya}>
          <ul className="divide-y text-sm" style={gaya}>
            {(jabatan ?? []).map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">{j.nama}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {j.tier_disposisi ? `Tier ${j.tier_disposisi}` : "Bukan approver"}
                </span>
                <form action={simpanPegawaiJabatan} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={j.id} />
                  <select
                    name="id_pegawai"
                    aria-label={`Kontak pegawai ${j.nama}`}
                    defaultValue={j.id_pegawai ?? ""}
                    className="rounded-lg border px-2 py-1 text-xs"
                    style={gaya}
                  >
                    <option value="">Belum ada kontak</option>
                    {(pegawai ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nama}
                      </option>
                    ))}
                  </select>
                  <SubmitButton labelMenunggu="Menyimpan…" className="text-xs underline">
                    Simpan
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Ubah tier approval di Pengaturan › Tier Approval. Pegawai yang dipilih di sini
            otomatis menjadi Nama Kontak/No.HP jabatan ini di laporan Kerja
            Sama Aktif.
          </p>
        </div>
      </div>
    );
  }

  if (aktif === "pegawai") {
    const { data: pegawai } = await supabase
      .from("pegawai")
      .select("id, nama, email, no_hp, is_active")
      .order("nama");
    return (
      <div className="max-w-4xl">
        {judul}
        {nav}
        <div className="mb-4 rounded-xl border bg-white p-4" style={gaya}>
          <ul className="divide-y text-sm" style={gaya}>
            {(pegawai ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">{p.nama}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {p.email ?? "—"} · {p.no_hp ?? "—"}
                </span>
              </li>
            ))}
            {!pegawai?.length ? (
              <li className="py-6 text-center" style={{ color: "var(--text-muted)" }}>
                Belum ada pegawai tersimpan.
              </li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-xl border bg-white p-4" style={gaya}>
          <h2 className="mb-3 text-sm font-semibold">Tambah Pegawai</h2>
          <form action={tambahPegawai} className="grid gap-2 sm:grid-cols-3">
            <input name="nama" required placeholder="Nama" aria-label="Nama" className="rounded-lg border px-2 py-1 text-sm" style={gaya} />
            <input name="email" type="email" placeholder="Email" aria-label="Email" className="rounded-lg border px-2 py-1 text-sm" style={gaya} />
            <input name="no_hp" placeholder="No. HP" aria-label="No. HP" className="rounded-lg border px-2 py-1 text-sm" style={gaya} />
            <div className="sm:col-span-3">
              <SubmitButton
                labelMenunggu="Menyimpan…"
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ background: "var(--midnight)" }}
              >
                Simpan
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (aktif === "unit") {
    const { data: unit } = await supabase
      .from("unit")
      .select("id, nama, id_parent_unit, is_active")
      .order("nama");
    const indukDari = new Map((unit ?? []).map((u) => [u.id, u.id_parent_unit]));
    const kedalaman = (id: number) => {
      let d = 0;
      let p = indukDari.get(id);
      while (p != null && d < 20) {
        d += 1;
        p = indukDari.get(p);
      }
      return d;
    };
    return (
      <div className="max-w-4xl">
        {judul}
        {nav}
        <div className="rounded-xl border bg-white p-4" style={gaya}>
          <Keterangan>
            Pohon unit yang ditelusuri cascade Lingkup Kerja Sama secara rekursif. Hierarki
            yang salah membuat cascade salah; penyuntingan pohon dilakukan lewat impor.
          </Keterangan>
          <ul className="text-sm">
            {(unit ?? []).map((u) => (
              <li
                key={u.id}
                className="py-1"
                style={{ paddingLeft: `${kedalaman(u.id) * 16}px` }}
              >
                {kedalaman(u.id) > 0 ? "└ " : ""}
                {u.nama}
                {!u.is_active ? (
                  <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    nonaktif
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // negara
  const { data: negara } = await supabase
    .from("negara")
    .select("id, kode, nama, is_domestic, latitude, longitude")
    .order("nama");
  return (
    <div className="max-w-4xl">
      {judul}
      {nav}
      <div className="rounded-xl border bg-white p-4" style={gaya}>
        <Keterangan>
          Satu-satunya sumber status dalam negeri / luar negeri. KPI mitra membaca boolean
          ini, tidak pernah membandingkan nama negara. Koordinat menempatkan negara di Peta
          Mitra Global; negara tanpa koordinat tidak tampil di peta.
        </Keterangan>
        <ul className="divide-y text-sm" style={gaya}>
          {(negara ?? []).map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {n.kode}
                </span>{" "}
                {n.nama}
              </span>
              <span
                className="text-xs"
                style={{
                  color: n.is_domestic ? "var(--status-active)" : "var(--text-secondary)",
                }}
              >
                {n.is_domestic ? "Dalam Negeri" : "Luar Negeri"}
              </span>
              <form action={simpanKoordinat} className="flex items-center gap-1">
                <input type="hidden" name="id" value={n.id} />
                <input
                  name="latitude"
                  aria-label={`Latitude ${n.nama}`}
                  defaultValue={n.latitude ?? ""}
                  placeholder="lat"
                  className="w-24 rounded-lg border px-2 py-1 text-xs"
                  style={gaya}
                />
                <input
                  name="longitude"
                  aria-label={`Longitude ${n.nama}`}
                  defaultValue={n.longitude ?? ""}
                  placeholder="lon"
                  className="w-24 rounded-lg border px-2 py-1 text-xs"
                  style={gaya}
                />
                <SubmitButton labelMenunggu="Menyimpan…" className="text-xs underline">
                  Simpan
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
