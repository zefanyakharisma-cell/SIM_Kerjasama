import Link from "next/link";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";

/**
 * Master Data — a focused view/edit surface for the entities the dashboard
 * and workflow depend on (partner, jabatan, unit, negara). Settings
 * (`/admin`) keeps the full config surface (thresholds, Studio Grafik,
 * managed options); this page exists so the international/domestic Mitra
 * split the dashboard KPI cards link to has somewhere to land, and so
 * "master data" reads as its own place in the nav, per the revision request.
 */
export const dynamic = "force-dynamic";

const TAB = {
  mitra: "Mitra",
  jabatan: "Jabatan",
  pegawai: "Pegawai",
  unit: "Unit",
  negara: "Negara",
} as const;
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

  const nav = (
    <nav className="mb-5 flex flex-wrap gap-1 border-b" style={gaya}>
      {(Object.keys(TAB) as TabKey[]).map((k) => (
        <Link
          key={k}
          href={`/master-data?tab=${k}` as Route}
          className="border-b-2 px-3 py-2 text-sm"
          style={{
            borderColor: k === aktif ? "var(--midnight)" : "transparent",
            color: k === aktif ? "var(--midnight)" : "var(--text-secondary)",
            fontWeight: k === aktif ? 600 : 400,
          }}
        >
          {TAB[k]}
        </Link>
      ))}
    </nav>
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

  if (aktif === "mitra") {
    let query = supabase
      .from("partner")
      .select("id, nama, is_international, kota, latitude, longitude")
      .eq("is_active", true)
      .order("nama")
      .limit(500);
    if (jenis === "internasional") query = query.eq("is_international", true);
    if (jenis === "domestik") query = query.eq("is_international", false);
    const { data: partner } = await query;

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

        <div className="rounded-xl border bg-white p-4" style={gaya}>
          <ul className="divide-y" style={gaya}>
            {(partner ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 text-sm">
                  {p.nama}
                  <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    {p.is_international ? "Internasional" : "Domestik"} ·{" "}
                    {p.kota ?? "kota belum diisi"}
                  </span>
                </span>
                <form action={simpanKoordinat} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={p.id} />
                  <input
                    name="latitude"
                    aria-label={`Latitude ${p.nama}`}
                    defaultValue={p.latitude ?? ""}
                    placeholder="lat"
                    className="w-24 rounded-lg border px-2 py-1 text-xs"
                    style={gaya}
                  />
                  <input
                    name="longitude"
                    aria-label={`Longitude ${p.nama}`}
                    defaultValue={p.longitude ?? ""}
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
            {!partner?.length ? (
              <li className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                Tidak ada mitra untuk filter ini.
              </li>
            ) : null}
          </ul>
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
            Ubah tier approval di Pengaturan. Pegawai yang dipilih di sini
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
    .select("id, kode, nama, is_domestic")
    .order("nama");
  return (
    <div className="max-w-4xl">
      {judul}
      {nav}
      <div className="rounded-xl border bg-white p-4" style={gaya}>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {(negara ?? []).map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-2 py-0.5">
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
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
