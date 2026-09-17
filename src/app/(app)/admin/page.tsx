import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";

/**
 * Settings — the master-data admin area (PRD §11, Design §5.12).
 *
 * Everything here is data the workflow reads and must not guess: the tier of
 * each position, the unit hierarchy the Lingkup cascade walks, the country flag
 * the domestic/international KPI reads, and the thresholds the SLA engine uses.
 * Getting these wrong is how a system starts producing confidently wrong
 * numbers, so each section says what depends on it.
 *
 * Authorization is RLS's, not this page's: every write below goes through a
 * policy or a function that checks `io_admin` itself. The role check here only
 * decides whether to render controls that would be refused anyway (AR-02).
 */
export const dynamic = "force-dynamic";

const inputKelas = "w-full rounded-lg border px-2 py-1 text-sm";
const gaya = { borderColor: "var(--border)" };

function Bagian({
  judul,
  keterangan,
  children,
}: {
  judul: string;
  keterangan: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mb-5 rounded-xl border bg-white p-4"
      style={{ borderColor: "var(--border)" }}
    >
      <h2 className="text-sm font-semibold">{judul}</h2>
      <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
        {keterangan}
      </p>
      {children}
    </section>
  );
}

export default async function Admin() {
  const akun = await akunSaatIni();
  if (akun?.role !== "io_admin") {
    // A viewer reaching this by URL lands back in the app, not on a refusal.
    redirect("/dashboard");
  }

  const supabase = await supabaseServer();

  const [
    { data: jabatan },
    { data: unit },
    { data: negara },
    { data: partner },
    { data: duplikat },
    { data: pengaturan },
    { data: grafik },
    { data: opsi },
  ] = await Promise.all([
    supabase.from("jabatan").select("id, nama, tier_disposisi, id_unit").order("nama"),
    supabase
      .from("unit")
      .select("id, nama, id_parent_unit, id_jenis_unit, is_active")
      .order("nama"),
    supabase.from("negara").select("id, kode, nama, is_domestic").order("nama"),
    supabase
      .from("partner")
      .select("id, nama, is_international, kota, latitude, longitude")
      .eq("is_active", true)
      .order("nama")
      .limit(500),
    supabase.from("v_partner_duplikat").select("*").limit(50),
    supabase.from("settings").select("key, value").order("key"),
    supabase
      .from("dashboard_chart")
      .select("id, judul, jenis_grafik, config, urutan")
      .order("urutan"),
    supabase
      .from("managed_options")
      .select("id, option_group, value, usage_count, is_active")
      .order("option_group")
      .limit(200),
  ]);

  // Depth for the tree display, computed from the parent links themselves so it
  // works at any depth (BR-37).
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

  async function simpanTier(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const nilai = String(formData.get("tier") ?? "");
    // NULL means "not an approver at all" — a real value, not a missing one.
    await klien
      .from("jabatan")
      .update({ tier_disposisi: nilai === "" ? null : Number(nilai) })
      .eq("id", Number(formData.get("id")));
    revalidatePath("/admin");
  }

  async function simpanPengaturan(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const akunKini = await akunSaatIni();
    await klien
      .from("settings")
      .update({
        value: String(formData.get("value") ?? ""),
        updated_by: akunKini?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("key", String(formData.get("key")));
    revalidatePath("/admin");
  }

  async function gabungMitra(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const { error } = await klien.rpc("gabung_partner", {
      p_dari: Number(formData.get("dari")),
      p_ke: Number(formData.get("ke")),
    });
    if (error) console.error("[simks] gabung_partner ditolak:", error.message);
    revalidatePath("/admin");
  }

  async function simpanKoordinat(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const lat = String(formData.get("latitude") ?? "");
    const lon = String(formData.get("longitude") ?? "");
    await klien
      .from("partner")
      .update({
        latitude: lat === "" ? null : Number(lat),
        longitude: lon === "" ? null : Number(lon),
      })
      .eq("id", Number(formData.get("id")));
    revalidatePath("/admin");
    revalidatePath("/dashboard");
  }

  async function simpanGrafik(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const akunKini = await akunSaatIni();
    const config = {
      grouping: String(formData.get("grouping") ?? "negara"),
      sumber_data: String(formData.get("sumber_data") ?? "dokumen"),
      maks: Number(formData.get("maks") ?? 10),
      filter: {
        region: String(formData.get("f_region") ?? ""),
        status: String(formData.get("f_status") ?? ""),
        dokumen: String(formData.get("f_dokumen") ?? ""),
        fakultas: String(formData.get("f_fakultas") ?? ""),
      },
    };
    const baris = {
      judul: String(formData.get("judul") ?? "Grafik"),
      jenis_grafik: String(formData.get("jenis_grafik") ?? "batang_vertikal"),
      urutan: Number(formData.get("urutan") ?? 1),
      config,
      id_akun_pembuat: akunKini?.id ?? null,
    };

    const { error } = await klien.from("dashboard_chart").insert(baris);
    if (error) console.error("[simks] simpan grafik ditolak:", error.message);
    revalidatePath("/admin");
    revalidatePath("/dashboard");
  }

  async function nonaktifkanOpsi(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    // Deactivated, never deleted while something still references it (BR-23).
    await klien
      .from("managed_options")
      .update({ is_active: false })
      .eq("id", Number(formData.get("id")));
    revalidatePath("/admin");
  }

  return (
    <div className="max-w-4xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
          Settings
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Master data dan konfigurasi. Nilai di halaman ini menentukan perilaku
          alur kerja, bukan sekadar tampilan.
        </p>
      </header>

      <Bagian
        judul="Jabatan & Tier Approval"
        keterangan="Tier menentukan urutan approval. Disimpan eksplisit, tidak pernah disimpulkan dari nama — 'Kepala Bagian Sekretariat Rektorat' tier 1 sedangkan 'Kepala' lainnya tier 2. Kosong berarti jabatan ini bukan approver."
      >
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {(jabatan ?? []).map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 text-sm">{j.nama}</span>
              <form action={simpanTier} className="flex items-center gap-2">
                <input type="hidden" name="id" value={j.id} />
                <select
                  name="tier"
                  defaultValue={j.tier_disposisi ?? ""}
                  className="rounded-lg border px-2 py-1 text-sm"
                  style={gaya}
                >
                  <option value="">Bukan approver</option>
                  <option value="1">Tier 1</option>
                  <option value="2">Tier 2</option>
                  <option value="3">Tier 3</option>
                </select>
                <button type="submit" className="text-xs underline">
                  Simpan
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Bagian>

      <Bagian
        judul="Unit & Hierarki"
        keterangan="Pohon unit yang ditelusuri cascade Lingkup Kerja Sama secara rekursif. Hierarki yang salah membuat cascade salah, jadi data impor ini divalidasi sebelum dipakai."
      >
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
        <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          Penyuntingan pohon dilakukan lewat impor sampai data hierarki penuh
          (~379 unit) stabil — ditampilkan di sini agar kesalahan terlihat lebih
          dahulu (pertanyaan desain D8).
        </p>
      </Bagian>

      <Bagian
        judul="Negara"
        keterangan="Satu-satunya sumber status dalam negeri / luar negeri. KPI 1 membaca boolean ini, tidak pernah membandingkan nama negara."
      >
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {(negara ?? []).map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-2 py-0.5">
              <span>
                <span className="no-dokumen text-xs" style={{ color: "var(--text-muted)" }}>
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
            </li>
          ))}
        </ul>
      </Bagian>

      <Bagian
        judul="Mitra — gabung duplikat"
        keterangan="Deteksi bersifat saran; keputusan tetap manual. Penggabungan mengarahkan ulang seluruh referensi dalam satu transaksi dan tidak pernah menghapus — catatan lama tetap ada, ditandai tergabung."
      >
        {(duplikat ?? []).length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Tidak ada dugaan duplikat saat ini.
          </p>
        ) : (
          <ul className="space-y-2">
            {(duplikat ?? []).map((d: any) => (
              <li
                key={`${d.id_a}-${d.id_b}`}
                className="rounded-lg border p-2 text-sm"
                style={gaya}
              >
                <div className="mb-2">
                  <strong>{d.nama_a}</strong> ↔ <strong>{d.nama_b}</strong>{" "}
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    kemiripan {d.kemiripan}
                    {d.homepage_sama ? " · homepage sama" : ""}
                  </span>
                </div>
                <form action={gabungMitra} className="flex flex-wrap items-center gap-2">
                  <select name="dari" className="rounded-lg border px-2 py-1 text-xs" style={gaya}>
                    <option value={d.id_a}>{d.nama_a} (digabungkan)</option>
                    <option value={d.id_b}>{d.nama_b} (digabungkan)</option>
                  </select>
                  <select name="ke" className="rounded-lg border px-2 py-1 text-xs" style={gaya}>
                    <option value={d.id_b}>{d.nama_b} (dipertahankan)</option>
                    <option value={d.id_a}>{d.nama_a} (dipertahankan)</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg px-2 py-1 text-xs font-medium text-white"
                    style={{ background: "var(--action-danger)" }}
                  >
                    Gabungkan
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Bagian>

      <Bagian
        judul="Koordinat Mitra"
        keterangan="Dibutuhkan Peta Mitra Global. Mitra tanpa koordinat tidak muncul di peta — lebih baik absen daripada disematkan di titik nol (butir terbuka O4)."
      >
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {(partner ?? []).slice(0, 50).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 text-sm">
                {p.nama}
                <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                  {p.kota ?? "kota belum diisi"}
                </span>
              </span>
              <form action={simpanKoordinat} className="flex items-center gap-1">
                <input type="hidden" name="id" value={p.id} />
                <input
                  name="latitude"
                  defaultValue={p.latitude ?? ""}
                  placeholder="lat"
                  className="w-24 rounded-lg border px-2 py-1 text-xs"
                  style={gaya}
                />
                <input
                  name="longitude"
                  defaultValue={p.longitude ?? ""}
                  placeholder="lon"
                  className="w-24 rounded-lg border px-2 py-1 text-xs"
                  style={gaya}
                />
                <button type="submit" className="text-xs underline">
                  Simpan
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Bagian>

      <Bagian
        judul="Ambang & Cadence"
        keterangan="Seluruh ambang SLA, jendela akan-berakhir dan irama pengingat dibaca dari sini. Tidak ada angka 2/4/6/30/60/90 yang ditulis di dalam kode."
      >
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {(pengaturan ?? []).map((s) => (
            <li key={s.key} className="flex flex-wrap items-center gap-2 py-2">
              <span className="no-dokumen min-w-0 flex-1 text-xs">{s.key}</span>
              <form action={simpanPengaturan} className="flex items-center gap-2">
                <input type="hidden" name="key" value={s.key} />
                <input
                  name="value"
                  defaultValue={s.value}
                  className="w-56 rounded-lg border px-2 py-1 text-sm"
                  style={gaya}
                />
                <button type="submit" className="text-xs underline">
                  Simpan
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Bagian>

      <Bagian
        judul="Studio Grafik — konfigurasi"
        keterangan="Maksimal lima grafik tersimpan; pengguna lain melihatnya read-only. Pengelompokan dan metrik dipilih dari daftar tetap, sehingga konfigurasi tidak pernah menjadi SQL."
      >
        <ul className="mb-4 space-y-1 text-sm">
          {(grafik ?? []).map((g: any) => (
            <li key={g.id}>
              <span className="font-medium">
                {g.urutan}. {g.judul}
              </span>{" "}
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {g.jenis_grafik} · {g.config?.grouping} · {g.config?.sumber_data}
              </span>
            </li>
          ))}
          {!grafik?.length ? (
            <li style={{ color: "var(--text-muted)" }}>Belum ada grafik tersimpan.</li>
          ) : null}
        </ul>

        <form action={simpanGrafik} className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">Judul</span>
            <input name="judul" required className={inputKelas} style={gaya} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">Jenis</span>
            <select name="jenis_grafik" className={inputKelas} style={gaya}>
              <option value="batang_vertikal">Batang vertikal</option>
              <option value="batang_horizontal">Batang horizontal</option>
              <option value="donut">Donut</option>
              <option value="garis">Garis</option>
              <option value="area">Area</option>
              <option value="radar">Radar</option>
              <option value="treemap">Treemap</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">Dikelompokkan menurut</span>
            <select name="grouping" className={inputKelas} style={gaya}>
              <option value="negara">Negara</option>
              <option value="jenis">Jenis dokumen</option>
              <option value="status">Status</option>
              <option value="fakultas">Fakultas / unit</option>
              <option value="bulan">Bulan</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">Metrik</span>
            <select name="sumber_data" className={inputKelas} style={gaya}>
              <option value="dokumen">Jumlah dokumen</option>
              <option value="mitra">Jumlah mitra</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">Filter — region</span>
            <select name="f_region" className={inputKelas} style={gaya}>
              <option value="">Semua</option>
              <option value="Internasional">Internasional</option>
              <option value="Domestik">Domestik</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">Filter — status</span>
            <select name="f_status" className={inputKelas} style={gaya}>
              <option value="">Aktif (bawaan)</option>
              <option value="Aktif">Aktif</option>
              <option value="Akan Berakhir">Akan Berakhir</option>
              <option value="Kedaluarsa">Kedaluarsa</option>
              <option value="Diarsipkan">Diarsipkan</option>
              <option value="Draft">Draft</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">Filter — dokumen</span>
            <select name="f_dokumen" className={inputKelas} style={gaya}>
              <option value="">Semua</option>
              <option value="MoU">MoU</option>
              <option value="MoA">MoA</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">Filter — fakultas</span>
            <input name="f_fakultas" className={inputKelas} style={gaya} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">Urutan tampil (1–5)</span>
            <input
              name="urutan"
              type="number"
              min={1}
              max={5}
              defaultValue={(grafik?.length ?? 0) + 1}
              className={inputKelas}
              style={gaya}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">Maksimal kategori</span>
            <input
              name="maks"
              type="number"
              min={1}
              max={50}
              defaultValue={10}
              className={inputKelas}
              style={gaya}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ background: "var(--midnight)" }}
            >
              Simpan Grafik
            </button>
          </div>
        </form>
      </Bagian>

      <Bagian
        judul="Daftar Bertumbuh"
        keterangan="Nilai baru dari formulir proposal terbit langsung tanpa moderasi. Pembersihan dilakukan di sini: dinonaktifkan atau digabungkan, tidak pernah dihapus selama masih dirujuk."
      >
        <ul className="divide-y text-sm" style={{ borderColor: "var(--border)" }}>
          {(opsi ?? []).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {o.option_group}
              </span>
              <span className="min-w-0 flex-1">{o.value}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                dipakai {o.usage_count}×
              </span>
              {o.is_active ? (
                <form action={nonaktifkanOpsi}>
                  <input type="hidden" name="id" value={o.id} />
                  <button type="submit" className="text-xs underline">
                    Nonaktifkan
                  </button>
                </form>
              ) : (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  nonaktif
                </span>
              )}
            </li>
          ))}
          {!opsi?.length ? (
            <li style={{ color: "var(--text-muted)" }}>Belum ada nilai tersimpan.</li>
          ) : null}
        </ul>
      </Bagian>
    </div>
  );
}
