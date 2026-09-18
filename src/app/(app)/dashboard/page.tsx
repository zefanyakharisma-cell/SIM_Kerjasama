import Link from "next/link";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { PetaMitra, type Pin } from "@/components/peta-mitra";
import { StudioGrafik, type Grafik } from "@/components/studio-grafik";
import { GrafikForm, grafikDariForm, type NilaiGrafik } from "@/components/grafik-form";
import { Tabs } from "@/components/tabs";
import { STATUS_DOKUMEN_AKTIF, lolosIlike } from "@/lib/laporan";

/**
 * Dashboard — the control panel (PRD §8.1).
 *
 * Three tabs, exactly as the mockups have them: Dashboard, Discussion and
 * Activity Log. The latter two are read-only VIEWS over data the workflow
 * already writes — the append-only approval log and the revision log — not new
 * entities. In particular "Discussion" is a revision-requests view, not a chat;
 * the system has no discussion thread and is not getting one.
 *
 * Two of the KPI cards are the team KPIs the whole system exists to produce
 * (PRD §3.2): MoU/MoA counts split domestic vs international, and the
 * proportion of documents completed within one month.
 */
export const dynamic = "force-dynamic";

const TAB = {
  dashboard: "Dashboard",
  discussion: "Discussion",
  aktivitas: "Activity Log",
} as const;
type TabKey = keyof typeof TAB;

const DALAM_PROSES = [
  "Diajukan",
  "Diproses",
  "Disposisi - Tier 1",
  "Disposisi - Tier 2",
  "Disposisi - Tier 3",
  "Pending",
];

function Kartu({
  label,
  nilai,
  catatan,
  warna,
  href,
}: {
  label: string;
  nilai: string | number;
  catatan?: string;
  warna?: string;
  href?: string;
}) {
  const isi = (
    <>
      <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-semibold"
        style={{ color: warna ?? "var(--midnight)" }}
      >
        {nilai}
      </div>
      {catatan ? (
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {catatan}
        </div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href as Route}
        className="block rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm"
        style={{ borderColor: "var(--border)" }}
      >
        {isi}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
      {isi}
    </div>
  );
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { tab } = sp;
  const aktif: TabKey = (tab as TabKey) in TAB ? (tab as TabKey) : "dashboard";
  const supabase = await supabaseServer();

  const nav = <Tabs basePath="/dashboard" tabs={TAB} aktif={aktif} />;

  const judul = (
    <header className="mb-5">
      <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
        Dashboard
      </h1>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Ringkasan kerja sama Universitas Kristen Petra.
      </p>
    </header>
  );

  // ---------------------------------------------------------------- Discussion
  if (aktif === "discussion") {
    // Revision requests, read from the append-only approval log. No new table,
    // and deliberately not a thread.
    const { data: permintaan } = await supabase
      .from("riwayat_approval")
      .select(
        `id, catatan, tanggal, waktu, id_proposal_dokumen,
         disposisi_target:id_disposisi_target ( jabatan ( nama ) )`,
      )
      .eq("aksi", "revision_requested")
      .order("tanggal", { ascending: false })
      .order("waktu", { ascending: false })
      .limit(100);

    return (
      <div>
        {judul}
        {nav}
        <div
          className="overflow-x-auto rounded-xl border bg-white"
          style={{ borderColor: "var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: "var(--text-secondary)" }}>
                <th className="px-4 py-3 font-medium">Dokumen</th>
                <th className="px-4 py-3 font-medium">Pengirim Revisi</th>
                <th className="px-4 py-3 font-medium">Permintaan</th>
                <th className="px-4 py-3 font-medium">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {(permintaan ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Belum ada permintaan revisi.
                  </td>
                </tr>
              ) : (
                (permintaan ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/kerja-sama/${r.id_proposal_dokumen}`}
                        className="underline"
                      >
                        #{r.id_proposal_dokumen}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {r.disposisi_target?.jabatan?.nama ?? "—"}
                    </td>
                    <td className="px-4 py-3">{r.catatan ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      {r.tanggal} {String(r.waktu).slice(0, 5)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Tab ini adalah tampilan permintaan revisi, bukan ruang diskusi bebas.
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------- Activity Log
  // One row per event, REA-style: the document (resource), what was done
  // (event), who did it and who it went to (agents). v_log_aktivitas resolves
  // all of it from the append-only approval log.
  if (aktif === "aktivitas") {
    const KEGIATAN: Record<string, string> = {
      created: "Membuat proposal",
      submitted: "Mengajukan dokumen",
      dispositioned: "Mengirim disposisi approval",
      approve: "Menyetujui",
      reject: "Menolak",
      pending: "Menangguhkan",
      revision_requested: "Meminta revisi",
      reactivated: "Mengaktifkan kembali",
      disposition_added: "Menambah approver",
      disposition_removed: "Menghapus approver",
      activated: "Mengaktifkan dokumen",
      archived: "Mengarsipkan dokumen",
      renewal_requested: "Mengirim disposisi evaluasi",
      evaluation_submitted: "Mengirim evaluasi",
      renewal_decided: "Memutuskan pembaruan",
      evaluation_reopened: "Membuka ulang evaluasi",
    };
    const PER = 50;
    const tgl = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
    const f = {
      aksi: sp.aksi && Object.hasOwn(KEGIATAN, sp.aksi) ? sp.aksi : "",
      q: (sp.q ?? "").trim(),
      dari: tgl(sp.dari),
      sampai: tgl(sp.sampai),
    };
    const adaFilter = Boolean(f.aksi || f.q || f.dari || f.sampai);
    const hal = Math.max(1, Number(sp.hal ?? 1) || 1);

    let q: any = supabase.from("v_log_aktivitas").select("*", { count: "exact" });
    if (f.aksi) q = q.eq("aksi", f.aksi);
    if (f.q) q = q.ilike("cari", `%${lolosIlike(f.q)}%`);
    if (f.dari) q = q.gte("waktu", f.dari);
    // waktu is a timestamp: "until" a date includes that whole day.
    if (f.sampai) q = q.lte("waktu", `${f.sampai}T23:59:59.999`);
    const { data: aktivitas, count } = await q
      .order("waktu", { ascending: false })
      .order("id", { ascending: false })
      .range((hal - 1) * PER, hal * PER - 1);
    const halAkhir = Math.max(1, Math.ceil((count ?? 0) / PER));
    const tautan = (h: number) =>
      `/dashboard?${new URLSearchParams({
        tab: "aktivitas",
        ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)),
        hal: String(h),
      })}` as Route;

    const gaya = { borderColor: "var(--border)" };
    const input = "w-full rounded border px-2 py-1 text-xs";
    const labelGaya = { color: "var(--text-secondary)" };

    return (
      <div>
        {judul}
        {nav}
        <form
          method="get"
          action="/dashboard"
          className="mb-3 grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-5"
          style={gaya}
        >
          <input type="hidden" name="tab" value="aktivitas" />
          <label className="block text-xs sm:col-span-2">
            <span className="mb-0.5 block" style={labelGaya}>Dokumen / Mitra</span>
            <input
              name="q"
              defaultValue={f.q}
              placeholder="No. dokumen, #id, atau nama mitra…"
              className={input}
              style={gaya}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-0.5 block" style={labelGaya}>Aksi</span>
            <select name="aksi" defaultValue={f.aksi} className={input} style={gaya}>
              <option value="">Semua</option>
              {Object.entries(KEGIATAN).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-0.5 block" style={labelGaya}>Dari / sampai</span>
            <span className="flex gap-1">
              <input type="date" name="dari" aria-label="Dari tanggal" defaultValue={f.dari} className={input} style={gaya} />
              <input type="date" name="sampai" aria-label="Sampai tanggal" defaultValue={f.sampai} className={input} style={gaya} />
            </span>
          </label>
          <span className="flex items-end gap-1">
            <button
              type="submit"
              className="rounded px-3 py-1 text-xs font-medium text-white"
              style={{ background: "var(--midnight)" }}
            >
              Saring
            </button>
            {adaFilter ? (
              <Link href="/dashboard?tab=aktivitas" className="rounded border px-3 py-1 text-xs" style={gaya}>
                Reset
              </Link>
            ) : null}
          </span>
        </form>

        <div className="overflow-x-auto rounded-xl border bg-white" style={gaya}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={labelGaya}>
                {["Waktu", "Dokumen", "Dari", "Aksi", "Kepada", "Catatan"].map((l) => (
                  <th key={l} className="px-3 py-2 font-medium">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(aktivitas ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center" style={{ color: "var(--text-muted)" }}>
                    {adaFilter ? "Tidak ada aktivitas yang cocok dengan filter ini." : "Belum ada aktivitas."}
                  </td>
                </tr>
              ) : (
                (aktivitas ?? []).map((a: any) => (
                  <tr key={a.id} className="border-t align-top" style={gaya}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      {String(a.waktu).slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2">
                      {a.id_proposal ? (
                        <Link href={`/kerja-sama/${a.id_proposal}`} className="no-dokumen underline">
                          {a.no_dokumen ?? `#${a.id_proposal}`}
                        </Link>
                      ) : (
                        "—"
                      )}
                      <span className="block text-xs" style={labelGaya}>
                        {[a.jenis_kerjasama, a.nama_mitra].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    {/* The audit identifies positions, never individuals (§12.3). */}
                    <td className="px-3 py-2 font-medium">{a.dari}</td>
                    <td className="px-3 py-2">{KEGIATAN[a.aksi] ?? a.aksi}</td>
                    <td className="px-3 py-2" style={labelGaya}>
                      {a.kepada ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={labelGaya}>
                      {a.catatan ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {halAkhir > 1 ? (
          <nav className="mt-3 flex items-center gap-3 text-sm">
            {hal > 1 ? (
              <Link href={tautan(hal - 1)} className="underline">
                ← Sebelumnya
              </Link>
            ) : null}
            <span className="text-xs" style={labelGaya}>
              halaman {hal} dari {halAkhir}
            </span>
            {hal < halAkhir ? (
              <Link href={tautan(hal + 1)} className="underline">
                Berikutnya →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    );
  }

  // ----------------------------------------------------------------- Dashboard
  const hitung = async (tabel: string, bangun: (q: any) => any): Promise<number> => {
    const { count } = await bangun(
      supabase.from(tabel).select("*", { count: "exact", head: true }),
    );
    return count ?? 0;
  };

  const [aktifDok, mitraIntl, mitraDomestik, dalamProses] = await Promise.all([
    // 'Akan Berakhir' is still a live agreement, only nearing its end date.
    hitung("dokumen_kerja_sama", (q) => q.in("status", STATUS_DOKUMEN_AKTIF)),
    // Read from the boolean, never from a country name (DR-07, BR-16).
    hitung("partner", (q) => q.eq("is_international", true).eq("is_active", true)),
    hitung("partner", (q) => q.eq("is_international", false).eq("is_active", true)),
    hitung("proposal_dokumen", (q) => q.in("status_proposal", DALAM_PROSES)),
  ]);

  // The expiring-soon window comes from settings, never a hardcoded 6 (DR-04).
  const { data: pengaturan } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["expiring_soon_months"]);
  const bulan = Number(
    pengaturan?.find((p) => p.key === "expiring_soon_months")?.value ?? 6,
  );
  const batas = new Date();
  batas.setMonth(batas.getMonth() + bulan);
  // The cutoff is a plain date compared to a DATE column; formatting it in
  // UTC (toISOString) can land on the wrong side of midnight for Indonesia
  // (UTC+7), so it is read out in Asia/Jakarta instead.
  const batasStr = batas.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

  const { count: akanBerakhir } = await supabase
    .from("dokumen_kerja_sama")
    .select("*", { count: "exact", head: true })
    .in("status", STATUS_DOKUMEN_AKTIF)
    .not("tanggal_berakhir", "is", null) // Auto Renewed never expires (BR-11)
    .lte("tanggal_berakhir", batasStr);

  const { count: lewatSla } = await supabase
    .from("disposisi_target")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending_action")
    .in("status_sla", ["yellow", "red"]);

  // KPI 2 — submission to final approval, deliberately excluding the offline
  // signing gap, which is outside the team's control (Q2, DR-05).
  const { data: selesai } = await supabase
    .from("proposal_dokumen")
    .select("waktu_proposal_dokumen, waktu_disetujui")
    .not("waktu_disetujui", "is", null)
    .not("waktu_proposal_dokumen", "is", null);

  const total = selesai?.length ?? 0;
  const dibawahSebulan =
    selesai?.filter((d) => {
      const mulai = new Date(d.waktu_proposal_dokumen as string).getTime();
      const akhir = new Date(d.waktu_disetujui as string).getTime();
      return akhir - mulai <= 30 * 24 * 60 * 60 * 1000;
    }).length ?? 0;
  const persen = total ? Math.round((dibawahSebulan / total) * 100) : null;

  const { data: pin } = await supabase.from("v_peta_mitra").select("*").limit(2000);

  const akun = await akunSaatIni();

  // The account's own charts (RLS scopes dashboard_chart to its owner). On
  // the first visit the account gets its own copy of the five defaults; the
  // flag keeps a deliberately emptied Studio empty.
  if (akun) {
    const { data: status } = await supabase
      .from("akun")
      .select("grafik_default_disalin")
      .eq("id", akun.id)
      .maybeSingle();
    if (status && !status.grafik_default_disalin) {
      await supabase.rpc("salin_grafik_default");
    }
  }

  const { data: tersimpan } = await supabase
    .from("dashboard_chart")
    .select("id, judul, jenis_grafik, config, urutan")
    .order("urutan")
    .order("id");

  // Each chart aggregated by the database function that owns the whitelist of
  // groupings (see the charts migration) — in parallel, not one after another.
  const grafik: Grafik[] = await Promise.all(
    (tersimpan ?? []).map(async (g) => {
      const { data: deret } = await supabase.rpc("agregasi_grafik", { p_config: g.config });
      return {
        id: g.id,
        judul: g.judul,
        jenis_grafik: g.jenis_grafik,
        deret: (deret ?? []) as { label: string; nilai: number }[],
      };
    }),
  );

  const MAKS_GRAFIK = 12; // mirrors the batasi_grafik trigger

  async function tambahGrafik(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const { data: akhir } = await klien
      .from("dashboard_chart")
      .select("urutan")
      .order("urutan", { ascending: false })
      .limit(1)
      .maybeSingle();
    // id_akun defaults to the signed-in account in the database.
    const { error } = await klien
      .from("dashboard_chart")
      .insert({ ...grafikDariForm(formData), urutan: (akhir?.urutan ?? 0) + 1 });
    if (error) console.error("[simks] tambah grafik ditolak:", error.message);
    revalidatePath("/dashboard");
  }

  async function ubahGrafik(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const { error } = await klien
      .from("dashboard_chart")
      .update(grafikDariForm(formData))
      .eq("id", Number(formData.get("id")));
    if (error) console.error("[simks] ubah grafik ditolak:", error.message);
    revalidatePath("/dashboard");
  }

  async function hapusGrafik(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    await klien.from("dashboard_chart").delete().eq("id", Number(formData.get("id_chart")));
    revalidatePath("/dashboard");
  }

  async function resetGrafik() {
    "use server";
    const klien = await supabaseServer();
    await klien.rpc("salin_grafik_default");
    revalidatePath("/dashboard");
  }

  // Adjacent swap of urutan with the neighbour; RLS keeps it to own charts.
  async function pindahGrafik(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const idChart = Number(formData.get("id_chart"));
    const { data: charts } = await klien
      .from("dashboard_chart")
      .select("id, urutan")
      .order("urutan")
      .order("id");
    const daftar = charts ?? [];
    const idx = daftar.findIndex((c) => c.id === idChart);
    const tetangga = String(formData.get("arah")) === "naik" ? idx - 1 : idx + 1;
    if (idx < 0 || tetangga < 0 || tetangga >= daftar.length) return;

    // urutan values stay distinct (defaults 1–5, new charts max+1, swaps keep
    // them), so swapping the two values is enough.
    const a = daftar[idx];
    const b = daftar[tetangga];
    await Promise.all([
      klien.from("dashboard_chart").update({ urutan: b.urutan }).eq("id", a.id),
      klien.from("dashboard_chart").update({ urutan: a.urutan }).eq("id", b.id),
    ]);
    revalidatePath("/dashboard");
  }

  const editorGrafik = Object.fromEntries(
    (tersimpan ?? []).map((g) => [
      g.id,
      <GrafikForm key={g.id} action={ubahGrafik} awal={g as NilaiGrafik} labelSimpan="Simpan Perubahan" />,
    ]),
  );

  // Evaluation analytics. Aggregated here but never detached from the document:
  // every row still carries id_dokumen_kerjasama, which is what makes the
  // drill-down possible (Q8).
  const { data: gap } = await supabase
    .from("v_evaluasi_gap")
    .select("dimensi, harapan, kepuasan, gap, id_dokumen_kerjasama, respondent_type")
    .limit(5000);

  const ringkasGap = Object.values(
    (gap ?? []).reduce(
      (akumulasi: Record<string, any>, r: any) => {
        const k = r.dimensi;
        akumulasi[k] ??= { dimensi: k, n: 0, harapan: 0, kepuasan: 0, dokumen: new Set() };
        akumulasi[k].n += 1;
        akumulasi[k].harapan += r.harapan ?? 0;
        akumulasi[k].kepuasan += r.kepuasan ?? 0;
        akumulasi[k].dokumen.add(r.id_dokumen_kerjasama);
        return akumulasi;
      },
      {} as Record<string, any>,
    ),
  ) as any[];

  return (
    <div>
      {judul}
      {nav}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kartu
          label="Jumlah Kerja Sama Aktif"
          nilai={aktifDok}
          warna="var(--status-active)"
          href="/kerja-sama?tab=aktif"
        />
        <Kartu
          label="Jumlah Mitra Internasional"
          nilai={mitraIntl}
          href="/master-data?tab=mitra&jenis=internasional"
        />
        <Kartu
          label="Jumlah Mitra Domestik"
          nilai={mitraDomestik}
          href="/master-data?tab=mitra&jenis=domestik"
        />
        <Kartu
          label="Dokumen Akan Kedaluwarsa"
          nilai={akanBerakhir ?? 0}
          catatan={`Dalam ${bulan} bulan ke depan`}
          warna="var(--sla-yellow-text)"
          href="/kerja-sama?tab=berakhir"
        />
        <Kartu
          label="Jumlah Dokumen Dalam Proses"
          nilai={dalamProses}
          href="/kerja-sama?tab=proposal"
        />
        <Kartu
          label="Melewati SLA"
          nilai={lewatSla ?? 0}
          catatan="Approver yang tertahan"
          warna={lewatSla ? "var(--sla-red)" : undefined}
        />
        <Kartu
          label="Penyelesaian Dokumen < 1 Bulan"
          nilai={persen === null ? "—" : `${persen}%`}
          catatan={
            total
              ? `${dibawahSebulan} dari ${total} dokumen, pengajuan sampai disetujui`
              : "Belum ada dokumen yang selesai disetujui"
          }
        />
      </section>

      <section className="mb-6">
        <PetaMitra pin={(pin ?? []) as Pin[]} />
      </section>

      <div className="mb-6">
        <StudioGrafik
          grafik={grafik}
          onPindah={pindahGrafik}
          onHapus={hapusGrafik}
          onReset={resetGrafik}
          editor={editorGrafik}
          tambah={
            grafik.length < MAKS_GRAFIK ? (
              <GrafikForm action={tambahGrafik} labelSimpan="Tambah Grafik" />
            ) : undefined
          }
        />
      </div>

      {ringkasGap.length > 0 ? (
        <section
          className="rounded-xl border bg-white p-4"
          style={{ borderColor: "var(--border)" }}
        >
          <h2 className="mb-1 text-sm font-semibold">Rekap Evaluasi Kerja Sama</h2>
          <p className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
            Rata-rata dari evaluasi pembaruan. Selisih negatif berarti kepuasan di
            bawah harapan.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-secondary)" }}>
                  <th className="py-2 font-medium">Aspek</th>
                  <th className="px-2 py-2 text-center font-medium">Harapan</th>
                  <th className="px-2 py-2 text-center font-medium">Kepuasan</th>
                  <th className="px-2 py-2 text-center font-medium">Selisih</th>
                  <th className="px-2 py-2 text-right font-medium">Dokumen</th>
                </tr>
              </thead>
              <tbody>
                {ringkasGap.map((r: any) => {
                  const h = r.harapan / r.n;
                  const k = r.kepuasan / r.n;
                  const selisih = k - h;
                  return (
                    <tr key={r.dimensi} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2">{r.dimensi}</td>
                      <td className="px-2 py-2 text-center">{h.toFixed(2)}</td>
                      <td className="px-2 py-2 text-center">{k.toFixed(2)}</td>
                      <td
                        className="px-2 py-2 text-center font-medium"
                        style={{ color: selisih < 0 ? "#ec008c" : "var(--status-approved)" }}
                      >
                        {selisih > 0 ? "+" : ""}
                        {selisih.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {/* The drill-down: any figure leads to the partnerships
                            behind it (Q8). */}
                        <Link
                          href="/kerja-sama?tab=berakhir"
                          className="underline"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {r.dokumen.size} dokumen
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
