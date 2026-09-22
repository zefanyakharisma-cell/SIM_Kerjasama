import Link from "next/link";
import type { Route } from "next";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { SlaFlag } from "@/components/sla-flag";
import { RingkasanAntrean, type RingkasanData } from "@/components/ringkasan-antrean";

/**
 * Antrean Saya — every step waiting on this account (PRD §8.4, Design §5.2,
 * client revision 2026-09-21).
 *
 * Approvals, the PETRA evaluation, open revision requests, drafts, the renewal
 * upload and — for KUI — disposition, activation, split decisions, partner
 * links and expiring documents. Which steps apply is decided in one database
 * function, `antrean_saya()`, so the rules sit next to the ones they mirror.
 *
 * Ordered red, then yellow, then the rest: the point of the queue is to make
 * the overdue item the first thing seen.
 */
export const dynamic = "force-dynamic";

const URUTAN: Record<string, number> = { red: 0, yellow: 1, normal: 2 };

type Langkah = {
  jenis: string;
  aksi: string;
  id_proposal: number;
  keterangan: string | null;
  status_sla: string | null;
  durasi_hari_kerja: number | null;
  tautan: string;
  no_dokumen: string | null;
  nama_mitra: string | null;
};

export default async function Antrean() {
  const supabase = await supabaseServer();
  const [akun, { data, error }] = await Promise.all([
    akunSaatIni(),
    supabase.rpc("antrean_saya"),
  ]);
  if (error) console.error("[simks] antrean_saya gagal:", error.message);

  const urut = ((data ?? []) as Langkah[]).sort(
    (a, b) => (URUTAN[a.status_sla ?? "normal"] ?? 2) - (URUTAN[b.status_sla ?? "normal"] ?? 2),
  );

  // Personal summary (Revisi V8 §5): task-type breakdown and the batas waktu
  // exposure both come straight out of the same queue rows already fetched
  // above — no separate aggregation RPC needed. The completion percentage is
  // this account's own approval-target history, which the queue alone
  // cannot show (it only lists what is still pending).
  const perJenisMap = new Map<string, number>();
  const batasWaktu = { merah: 0, kuning: 0, normal: 0 };
  for (const t of urut) {
    perJenisMap.set(t.aksi, (perJenisMap.get(t.aksi) ?? 0) + 1);
    if (t.jenis === "approval") {
      if (t.status_sla === "red") batasWaktu.merah++;
      else if (t.status_sla === "yellow") batasWaktu.kuning++;
      else batasWaktu.normal++;
    }
  }

  const { count: approvalTotal } = akun
    ? await supabase
        .from("disposisi_target")
        .select("*", { count: "exact", head: true })
        .eq("id_jabatan", akun.id_jabatan)
        .neq("status", "removed")
    : { count: 0 };
  const { count: approvalSelesai } = akun
    ? await supabase
        .from("disposisi_target")
        .select("*", { count: "exact", head: true })
        .eq("id_jabatan", akun.id_jabatan)
        .in("status", ["approved", "rejected"])
    : { count: 0 };

  const ringkasan: RingkasanData = {
    perJenis: [...perJenisMap.entries()].map(([label, nilai]) => ({ label, nilai })),
    batasWaktu,
    approvalSelesai: approvalSelesai ?? 0,
    approvalTotal: approvalTotal ?? 0,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)]">
      <div className="max-w-3xl">
        <header className="mb-5">
          <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
            Antrean Saya
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Semua langkah yang menunggu tindakan Anda.
          </p>
        </header>

        {urut.length === 0 ? (
          <div
            className="rounded-xl border bg-white p-10 text-center"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Tidak ada langkah yang menunggu tindakan Anda.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {urut.map((t) => (
              <li key={`${t.jenis}-${t.id_proposal}-${t.keterangan}`}>
                <Link
                  href={t.tautan as Route}
                  className="flex items-center justify-between gap-4 rounded-xl border bg-white p-4"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="min-w-0">
                    <span
                      className="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ background: "var(--surface-sunk)", color: "var(--midnight)" }}
                    >
                      {t.aksi}
                    </span>
                    <span className="block truncate text-sm font-medium">
                      {t.nama_mitra ?? `Proposal #${t.id_proposal}`}
                    </span>
                    {/* A proposal has no document number until IO types one at
                        activation (BR-22), so the proposal id stands in until then. */}
                    <span className="no-dokumen block text-xs" style={{ color: "var(--text-secondary)" }}>
                      {t.no_dokumen ? `No. Dokumen ${t.no_dokumen}` : `No. Proposal #${t.id_proposal}`}
                    </span>
                    {t.keterangan ? (
                      <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
                        {t.keterangan}
                      </span>
                    ) : null}
                  </span>
                  {t.jenis === "approval" ? (
                    <SlaFlag hari={t.durasi_hari_kerja} bendera={t.status_sla} />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RingkasanAntrean data={ringkasan} />
    </div>
  );
}
