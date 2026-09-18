import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { Tabs } from "@/components/tabs";

/**
 * Pengaturan — the system rules (PRD §11, Design §5.12), one tab per segment:
 * approval tiers, SLA thresholds & cadence, and the growing option lists.
 * The entities themselves (mitra, unit, negara, …) live in Master Data, so
 * nothing is edited in two places.
 *
 * Everything here is data the workflow reads and must not guess; getting it
 * wrong is how a system starts producing confidently wrong numbers, so each
 * tab says what depends on it.
 *
 * Authorization is RLS's, not this page's: every write below goes through a
 * policy or a function that checks `io_admin` itself. The role check here only
 * decides whether to render controls that would be refused anyway (AR-02).
 */
export const dynamic = "force-dynamic";

const TAB = {
  tier: "Tier Approval",
  ambang: "Ambang & Cadence",
  daftar: "Daftar Bertumbuh",
} as const;
type TabKey = keyof typeof TAB;

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
    <section className="rounded-xl border bg-white p-4" style={gaya}>
      <h2 className="text-sm font-semibold">{judul}</h2>
      <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
        {keterangan}
      </p>
      {children}
    </section>
  );
}

const TABEL_OPSI = ["tujuan_kerjasama", "manfaat_petra", "manfaat_mitra"] as const;

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const akun = await akunSaatIni();
  if (akun?.role !== "io_admin") {
    // A viewer reaching this by URL lands back in the app, not on a refusal.
    redirect("/dashboard");
  }

  const { tab } = await searchParams;
  const aktif: TabKey = tab && Object.hasOwn(TAB, tab) ? (tab as TabKey) : "tier";
  const supabase = await supabaseServer();

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

  async function nonaktifkanOpsi(formData: FormData) {
    "use server";
    const tabel = formData.get("tabel");
    if (!TABEL_OPSI.includes(tabel as any)) return;
    const klien = await supabaseServer();
    // Deactivated, never deleted while something still references it (BR-23).
    await klien
      .from(tabel as string)
      .update({ is_active: false })
      .eq("id", Number(formData.get("id")));
    revalidatePath("/admin");
  }

  let isi: React.ReactNode;

  if (aktif === "tier") {
    const { data: jabatan } = await supabase
      .from("jabatan")
      .select("id, nama, tier_disposisi")
      .order("nama");
    isi = (
      <Bagian
        judul="Jabatan & Tier Approval"
        keterangan="Tier menentukan urutan approval. Disimpan eksplisit, tidak pernah disimpulkan dari nama — 'Kepala Bagian Sekretariat Rektorat' tier 1 sedangkan 'Kepala' lainnya tier 2. Kosong berarti jabatan ini bukan approver."
      >
        <ul className="divide-y" style={gaya}>
          {(jabatan ?? []).map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 text-sm">{j.nama}</span>
              <form action={simpanTier} className="flex items-center gap-2">
                <input type="hidden" name="id" value={j.id} />
                <select
                  name="tier"
                  aria-label={`Tier approval ${j.nama}`}
                  defaultValue={j.tier_disposisi ?? ""}
                  className="rounded-lg border px-2 py-1 text-sm"
                  style={gaya}
                >
                  <option value="">Bukan approver</option>
                  <option value="1">Tier 1</option>
                  <option value="2">Tier 2</option>
                  <option value="3">Tier 3</option>
                </select>
                <SubmitButton labelMenunggu="Menyimpan…" className="text-xs underline">
                  Simpan
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </Bagian>
    );
  } else if (aktif === "ambang") {
    const { data: pengaturan } = await supabase.from("settings").select("key, value").order("key");
    isi = (
      <Bagian
        judul="Ambang & Cadence"
        keterangan="Seluruh ambang SLA, jendela akan-berakhir dan irama pengingat dibaca dari sini. Tidak ada angka 2/4/6/30/60/90 yang ditulis di dalam kode."
      >
        <ul className="divide-y" style={gaya}>
          {(pengaturan ?? []).map((s) => (
            <li key={s.key} className="flex flex-wrap items-center gap-2 py-2">
              <span className="no-dokumen min-w-0 flex-1 text-xs">{s.key}</span>
              <form action={simpanPengaturan} className="flex items-center gap-2">
                <input type="hidden" name="key" value={s.key} />
                <input
                  name="value"
                  aria-label={`Nilai ${s.key}`}
                  defaultValue={s.value}
                  className="w-56 rounded-lg border px-2 py-1 text-sm"
                  style={gaya}
                />
                <SubmitButton labelMenunggu="Menyimpan…" className="text-xs underline">
                  Simpan
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </Bagian>
    );
  } else {
    const [{ data: tujuan }, { data: manfaatPetra }, { data: manfaatMitra }] = await Promise.all(
      TABEL_OPSI.map((t) => supabase.from(t).select("id, nilai, is_active").order("nilai")),
    );
    const opsi = [
      ...(tujuan ?? []).map((o) => ({ ...o, tabel: "tujuan_kerjasama", label: "tujuan" })),
      ...(manfaatPetra ?? []).map((o) => ({ ...o, tabel: "manfaat_petra", label: "manfaat_petra" })),
      ...(manfaatMitra ?? []).map((o) => ({ ...o, tabel: "manfaat_mitra", label: "manfaat_mitra" })),
    ];
    isi = (
      <Bagian
        judul="Daftar Bertumbuh"
        keterangan="Nilai baru dari formulir proposal terbit langsung tanpa moderasi. Pembersihan dilakukan di sini: dinonaktifkan atau digabungkan, tidak pernah dihapus selama masih dirujuk."
      >
        <ul className="divide-y text-sm" style={gaya}>
          {opsi.map((o) => (
            <li key={`${o.tabel}-${o.id}`} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {o.label}
              </span>
              <span className="min-w-0 flex-1">{o.nilai}</span>
              {o.is_active ? (
                <form action={nonaktifkanOpsi}>
                  <input type="hidden" name="tabel" value={o.tabel} />
                  <input type="hidden" name="id" value={o.id} />
                  <SubmitButton labelMenunggu="Menonaktifkan…" className="text-xs underline">
                    Nonaktifkan
                  </SubmitButton>
                </form>
              ) : (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  nonaktif
                </span>
              )}
            </li>
          ))}
          {!opsi.length ? (
            <li style={{ color: "var(--text-muted)" }}>Belum ada nilai tersimpan.</li>
          ) : null}
        </ul>
      </Bagian>
    );
  }

  return (
    <div className="max-w-4xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
          Pengaturan
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Aturan sistem. Nilai di halaman ini menentukan perilaku alur kerja, bukan sekadar
          tampilan. Data mitra, unit, negara dan pegawai ada di Master Data.
        </p>
      </header>
      <Tabs basePath="/admin" tabs={TAB} aktif={aktif} />
      {isi}
    </div>
  );
}
