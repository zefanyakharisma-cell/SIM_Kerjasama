import Link from "next/link";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { PetaMitra, type Pin } from "@/components/peta-mitra";
import { StudioGrafik, type Grafik } from "@/components/studio-grafik";
import { GrafikForm, grafikDariForm, type NilaiGrafik } from "@/components/grafik-form";
import { Tabs } from "@/components/tabs";
import { SlaFlag } from "@/components/sla-flag";
import { StatusPill } from "@/components/status-pill";
import { STATUS_DOKUMEN_AKTIF, lolosIlike } from "@/lib/laporan";
import { batasAkanBerakhir } from "@/lib/periode";

/**
 * Dashboard — the control panel (PRD §8.1).
 *
 * Tabs: Dashboard, Activity Log, Discussion and — Admin only — In Process.
 * Activity Log and Discussion are read-only VIEWS over data the workflow
 * already writes — the append-only approval log and the revision log — not new
 * entities. In particular "Discussion" is a revision-requests view, not a chat;
 * the system has no discussion thread and is not getting one. In Process is
 * every document not yet active, grouped by where it sits in the workflow.
 *
 * Two of the KPI cards are the team KPIs the whole system exists to produce
 * (PRD §3.2): MoU/MoA counts split domestic vs international, and the
 * proportion of documents completed within one month.
 */
export const dynamic = "force-dynamic";

const TAB = {
  dashboard: "Dashboard",
  aktivitas: "Activity Log",
  discussion: "Discussion",
  proses: "In Process",
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

// The In Process tab's groups, in workflow order: everything from submission
// until activation, so the two post-approval stages (printing and physical
// signing) are included on top of DALAM_PROSES.
const TAHAP_PROSES = [...DALAM_PROSES, "Disetujui", "Siap TTD"];

const URUTAN_SLA: Record<string, number> = { red: 0, yellow: 1, normal: 2 };

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
  const [supabase, akun] = await Promise.all([supabaseServer(), akunSaatIni()]);
  const admin = akun?.role === "admin";
  // In Process shows every document's progress, so it is Admin's alone; for
  // anyone else the tab does not exist and its URL falls back to Dashboard.
  const tabs: Partial<typeof TAB> = admin
    ? TAB
    : Object.fromEntries(Object.entries(TAB).filter(([k]) => k !== "proses"));
  const aktif: TabKey = Object.hasOwn(tabs, tab ?? "") ? (tab as TabKey) : "dashboard";

  const nav = <Tabs basePath="/dashboard" tabs={tabs} aktif={aktif} />;

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

  // ---------------------------------------------------------------- In Process
  // One card per document still on its way to activation, grouped by stage.
  // The SLA shown is the document's worst open approver — highest flag, then
  // most working days — since SLA is per target, never per document (BR-17).
  if (aktif === "proses") {
    const { data: dokumen } = await supabase
      .from("v_daftar_dokumen")
      .select(
        "id_proposal, no_dokumen, jenis_kerjasama, status_proposal, nama_mitra, unit_pengusul, waktu_proposal_dokumen",
      )
      .in("status_proposal", TAHAP_PROSES)
      // The proposal keeps "Disetujui" after activation, so "not yet a signed
      // document" is what actually marks it as still in process.
      .is("status_dokumen", null)
      .order("waktu_proposal_dokumen", { ascending: true })
      .limit(1000);
    const ids = (dokumen ?? []).map((d) => d.id_proposal);
    const { data: target } = ids.length
      ? await supabase
          .from("v_sla_dokumen")
          .select("id_proposal, jabatan, durasi_hari_kerja, status_sla")
          .eq("status", "pending_action")
          .in("id_proposal", ids)
      : { data: [] as any[] };

    type Target = { jabatan: string; durasi_hari_kerja: number | null; status_sla: string | null };
    const lebihBuruk = (a: Target, b: Target) =>
      (URUTAN_SLA[a.status_sla ?? "normal"] ?? 2) - (URUTAN_SLA[b.status_sla ?? "normal"] ?? 2) ||
      (b.durasi_hari_kerja ?? 0) - (a.durasi_hari_kerja ?? 0);
    const sla = new Map<number, { terburuk: Target; jumlah: number }>();
    for (const t of (target ?? []) as (Target & { id_proposal: number })[]) {
      const kini = sla.get(t.id_proposal);
      if (!kini) sla.set(t.id_proposal, { terburuk: t, jumlah: 1 });
      else {
        kini.jumlah += 1;
        if (lebihBuruk(t, kini.terburuk) < 0) kini.terburuk = t;
      }
    }
    const peringkat = (id: number) => {
      const s = sla.get(id)?.terburuk;
      return s ? (URUTAN_SLA[s.status_sla ?? "normal"] ?? 2) : 3;
    };

    const grup = TAHAP_PROSES.map((status) => ({
      status,
      dokumen: (dokumen ?? [])
        .filter((d) => d.status_proposal === status)
        // Red first, then yellow, then the rest; oldest submission within each.
        .sort((a, b) => peringkat(a.id_proposal) - peringkat(b.id_proposal)),
    })).filter((g) => g.dokumen.length > 0);

    return (
      <div>
        {judul}
        {nav}
        {grup.length === 0 ? (
          <div
            className="rounded-xl border bg-white p-10 text-center text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Tidak ada dokumen yang sedang dalam proses.
          </div>
        ) : (
          <div className="space-y-6">
            {grup.map((g) => (
              <section key={g.status}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <StatusPill status={g.status} />
                  <span style={{ color: "var(--text-muted)" }}>{g.dokumen.length} dokumen</span>
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {g.dokumen.map((d) => {
                    const s = sla.get(d.id_proposal);
                    return (
                      <li key={d.id_proposal}>
                        <Link
                          href={`/kerja-sama/${d.id_proposal}` as Route}
                          className="flex h-full flex-col gap-1 rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate text-sm font-medium">
                              {d.nama_mitra ?? `Proposal #${d.id_proposal}`}
                            </span>
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{ background: "var(--surface-sunk)", color: "var(--midnight)" }}
                            >
                              {d.jenis_kerjasama}
                            </span>
                          </span>
                          {/* No document number until activation (BR-22). */}
                          <span className="no-dokumen text-xs" style={{ color: "var(--text-secondary)" }}>
                            {d.no_dokumen ? `No. Dokumen ${d.no_dokumen}` : `No. Proposal #${d.id_proposal}`}
                          </span>
                          {d.unit_pengusul ? (
                            <span className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                              {d.unit_pengusul}
                            </span>
                          ) : null}
                          <span
                            className="mt-auto flex items-end justify-between gap-2 border-t pt-2 text-xs"
                            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                          >
                            <span className="min-w-0">
                              {d.waktu_proposal_dokumen
                                ? `Diajukan ${new Date(d.waktu_proposal_dokumen).toLocaleDateString("id-ID", {
                                    timeZone: "Asia/Jakarta",
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}`
                                : "Belum diajukan"}
                              {s ? (
                                <span className="block truncate">
                                  Menunggu {s.terburuk.jabatan}
                                  {s.jumlah > 1 ? ` +${s.jumlah - 1}` : ""}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0">
                              {/* Pending is frozen: the clock really is stopped (BR-08). */}
                              {d.status_proposal === "Pending" ? (
                                <SlaFlag hari={null} bendera={null} beku />
                              ) : s ? (
                                <SlaFlag hari={s.terburuk.durasi_hari_kerja} bendera={s.terburuk.status_sla} />
                              ) : (
                                <SlaFlag hari={null} bendera={null} />
                              )}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

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

  // Every independent read in one wave: one round trip instead of one each.
  const [
    aktifDok,
    mitraIntl,
    mitraDomestik,
    dalamProses,
    batas,
    { count: lewatSla },
    { data: selesai },
    { data: pin },
    { data: gap },
  ] = await Promise.all([
    // 'Akan Berakhir' is still a live agreement, only nearing its end date.
    hitung("dokumen_kerja_sama", (q) => q.in("status", STATUS_DOKUMEN_AKTIF)),
    // Read from the boolean, never from a country name (DR-07, BR-16).
    hitung("partner", (q) => q.eq("is_international", true).eq("is_active", true)),
    hitung("partner", (q) => q.eq("is_international", false).eq("is_active", true)),
    hitung("proposal_dokumen", (q) => q.in("status_proposal", DALAM_PROSES)),
    // The expiring-soon window comes from settings, never a hardcoded 6 (DR-04);
    // shared with Cari Kerja Sama so both mean the same thing.
    batasAkanBerakhir(supabase),
    supabase
      .from("disposisi_target")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_action")
      .in("status_sla", ["yellow", "red"]),
    // KPI 2 — submission to final approval, deliberately excluding the offline
    // signing gap, which is outside the team's control (Q2, DR-05).
    supabase
      .from("proposal_dokumen")
      .select("waktu_proposal_dokumen, waktu_disetujui")
      .not("waktu_disetujui", "is", null)
      .not("waktu_proposal_dokumen", "is", null),
    supabase.from("v_peta_mitra").select("*").limit(2000),
    // Evaluation analytics. Aggregated below but never detached from the
    // document: every row still carries id_dokumen_kerjasama, which is what
    // makes the drill-down possible (Q8).
    supabase
      .from("v_evaluasi_gap")
      .select("dimensi, harapan, kepuasan, gap, id_dokumen_kerjasama, respondent_type")
      .limit(5000),
  ]);
  // The card caption names the same window, read back off the cutoff so the
  // setting is fetched once.
  const kini = new Date();
  const bulan =
    (batas.getFullYear() - kini.getFullYear()) * 12 + batas.getMonth() - kini.getMonth();
  // The cutoff is a plain date compared to a DATE column; formatting it in
  // UTC (toISOString) can land on the wrong side of midnight for Indonesia
  // (UTC+7), so it is read out in Asia/Jakarta instead.
  const batasStr = batas.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

  const total = selesai?.length ?? 0;
  const dibawahSebulan =
    selesai?.filter((d) => {
      const mulai = new Date(d.waktu_proposal_dokumen as string).getTime();
      const akhir = new Date(d.waktu_disetujui as string).getTime();
      return akhir - mulai <= 30 * 24 * 60 * 60 * 1000;
    }).length ?? 0;
  const persen = total ? Math.round((dibawahSebulan / total) * 100) : null;

  // The account's own charts (RLS scopes dashboard_chart to its owner). On
  // the first visit the account gets its own copy of the five defaults; the
  // flag keeps a deliberately emptied Studio empty.
  const muatGrafik = async () => {
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
    return { tersimpan, grafik };
  };

  const [{ count: akanBerakhir }, { tersimpan, grafik }] = await Promise.all([
    supabase
      .from("dokumen_kerja_sama")
      .select("*", { count: "exact", head: true })
      .in("status", STATUS_DOKUMEN_AKTIF)
      .not("tanggal_berakhir", "is", null) // Auto Renewed never expires (BR-11)
      .lte("tanggal_berakhir", batasStr),
    muatGrafik(),
  ]);

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
          label="Melewati Batas Waktu"
          nilai={lewatSla ?? 0}
          catatan="Approver yang tertahan"
          warna={lewatSla ? "var(--sla-red)" : undefined}
          href="/dashboard/bottleneck"
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

      {ringkasGap.length > 0 && admin ? (
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
