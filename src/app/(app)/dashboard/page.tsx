import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Dashboard — the KPI summary cards (PRD §8.1).
 *
 * Two of these are the team KPIs the system exists to produce (PRD §3.2):
 * MoU/MoA counts split domestic vs international, and the proportion of
 * documents completed within one month.
 *
 * The map and the chart studio are Phase 2; the cards and the queue are what
 * Phase 1 owes.
 */
export const dynamic = "force-dynamic";

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
}: {
  label: string;
  nilai: string | number;
  catatan?: string;
  warna?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
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
        <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {catatan}
        </div>
      ) : null}
    </div>
  );
}

export default async function Dashboard() {
  const supabase = await supabaseServer();

  const hitung = async (
    tabel: string,
    bangun: (q: any) => any,
  ): Promise<number> => {
    const { count } = await bangun(
      supabase.from(tabel).select("*", { count: "exact", head: true }),
    );
    return count ?? 0;
  };

  const [aktif, mitraIntl, mitraDomestik, dalamProses] = await Promise.all([
    hitung("dokumen_kerja_sama", (q) => q.eq("status", "Aktif")),
    // Read from the boolean, never from a country name (DR-07, BR-16).
    hitung("partner", (q) => q.eq("is_international", true).eq("is_active", true)),
    hitung("partner", (q) => q.eq("is_international", false).eq("is_active", true)),
    hitung("proposal_dokumen", (q) => q.in("status_proposal", DALAM_PROSES)),
  ]);

  // Expiring soon: the window comes from settings, never a hardcoded 6 (DR-04).
  const { data: pengaturan } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["expiring_soon_months"]);
  const bulan = Number(
    pengaturan?.find((p) => p.key === "expiring_soon_months")?.value ?? 6,
  );
  const batas = new Date();
  batas.setMonth(batas.getMonth() + bulan);

  const { count: akanBerakhir } = await supabase
    .from("dokumen_kerja_sama")
    .select("*", { count: "exact", head: true })
    .eq("status", "Aktif")
    .not("tanggal_berakhir", "is", null) // Auto Renewed never expires (BR-11)
    .lte("tanggal_berakhir", batas.toISOString().slice(0, 10));

  // Approval SLA: how many approvers are currently flagged.
  const { count: lewatSla } = await supabase
    .from("disposisi_target")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending_action")
    .in("status_sla", ["yellow", "red"]);

  // KPI 2 — submission to final approval, deliberately excluding the offline
  // signing gap, which is outside the team control (Q2, DR-05).
  const { data: selesai } = await supabase
    .from("proposal_dokumen")
    .select("waktu_proposal_dokumen, waktu_disetujui")
    .not("waktu_disetujui", "is", null)
    .not("waktu_proposal_dokumen", "is", null);

  const total = selesai?.length ?? 0;
  const dibawahSebulan =
    selesai?.filter((d) => {
      const mulai = new Date(d.waktu_proposal_dokumen as string).getTime();
      const selesaiMs = new Date(d.waktu_disetujui as string).getTime();
      return selesaiMs - mulai <= 30 * 24 * 60 * 60 * 1000;
    }).length ?? 0;
  const persen = total ? Math.round((dibawahSebulan / total) * 100) : null;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
          Dashboard
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Ringkasan kerja sama Universitas Kristen Petra.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kartu
          label="Jumlah Kerja Sama Aktif"
          nilai={aktif}
          warna="var(--status-active)"
        />
        <Kartu label="Jumlah Mitra Internasional" nilai={mitraIntl} />
        <Kartu label="Jumlah Mitra Domestik" nilai={mitraDomestik} />
        <Kartu
          label="Dokumen Akan Kadaluarsa"
          nilai={akanBerakhir ?? 0}
          catatan={`Dalam ${bulan} bulan ke depan`}
          warna="var(--sla-yellow)"
        />
        <Kartu label="Jumlah Dokumen Dalam Proses" nilai={dalamProses} />
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

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold">Berikutnya</h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Peta Mitra Global dan Studio Grafik Mitra menyusul pada Fase 2,
          bersama sapuan SLA terjadwal dan ekspor Excel.{" "}
          <Link href="/antrean" className="underline">
            Antrean approval Anda
          </Link>{" "}
          sudah tersedia.
        </p>
      </section>
    </div>
  );
}
