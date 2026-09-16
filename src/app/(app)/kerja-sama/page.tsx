import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { StatusPill } from "@/components/status-pill";

/**
 * Cari Kerja Sama — the lifecycle as tabs (PRD §8.1).
 *
 * Status is a filter on the list, not a global archive switch: the archive is
 * one tab among the others, so an archived document is always one click away
 * and never hidden behind a mode (PRD §8.2).
 */
export const dynamic = "force-dynamic";

const TAB = {
  aktif: "Kerja Sama Aktif",
  proposal: "Proposal Kerja Sama",
  disetujui: "Disetujui",
  berakhir: "Akan Berakhir",
  arsip: "Arsip",
} as const;

type TabKey = keyof typeof TAB;

const STATUS_PROPOSAL = [
  "Draft",
  "Diajukan",
  "Diproses",
  "Disposisi - Tier 1",
  "Disposisi - Tier 2",
  "Disposisi - Tier 3",
  "Pending",
];

function Tanggal({ nilai }: { nilai: string | null }) {
  if (!nilai) return <>—</>;
  return <>{new Date(nilai).toLocaleDateString("id-ID", { dateStyle: "medium" })}</>;
}

export default async function CariKerjaSama({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const aktifTab: TabKey = (tab as TabKey) in TAB ? (tab as TabKey) : "aktif";
  const supabase = await supabaseServer();

  // Every row below comes back through RLS, so this reads what the account is
  // entitled to see and nothing is filtered in the component (AR-02, AR-03).
  const proposalQuery = supabase
    .from("proposal_dokumen")
    .select(
      `id, jenis_kerjasama, status_proposal, waktu_proposal_dokumen,
       partner_pengusul ( partner ( nama, is_international ) ),
       dokumen_kerja_sama ( no, no_dokumen, status, alasan_arsip,
                            tanggal_mulai, tanggal_berakhir )`,
    )
    .order("id", { ascending: false })
    .limit(100);

  if (aktifTab === "proposal") proposalQuery.in("status_proposal", STATUS_PROPOSAL);
  if (aktifTab === "disetujui") proposalQuery.eq("status_proposal", "Disetujui");

  const { data: baris } = await proposalQuery;

  const terpilih = (baris ?? []).filter((b: any) => {
    const dok = b.dokumen_kerja_sama?.[0] ?? b.dokumen_kerja_sama;
    switch (aktifTab) {
      case "aktif":
        return dok?.status === "Aktif";
      case "arsip":
        return dok?.status === "Diarsipkan" || dok?.status === "Kedaluarsa";
      case "berakhir":
        // Auto Renewed documents carry no end date and never appear here (BR-11).
        return dok?.status === "Aktif" && dok?.tanggal_berakhir;
      case "disetujui":
        return b.status_proposal === "Disetujui";
      default:
        return true;
    }
  });

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
          Cari Kerja Sama
        </h1>
      </header>

      <nav
        className="mb-4 flex flex-wrap gap-1 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        {(Object.keys(TAB) as TabKey[]).map((k) => (
          <Link
            key={k}
            href={`/kerja-sama?tab=${k}`}
            className="border-b-2 px-3 py-2 text-sm"
            style={{
              borderColor: k === aktifTab ? "var(--midnight)" : "transparent",
              color: k === aktifTab ? "var(--midnight)" : "var(--text-secondary)",
              fontWeight: k === aktifTab ? 600 : 400,
            }}
          >
            {TAB[k]}
          </Link>
        ))}
      </nav>

      <div
        className="overflow-x-auto rounded-xl border bg-white"
        style={{ borderColor: "var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--text-secondary)" }}>
              <th className="px-4 py-3 font-medium">No. Dokumen</th>
              <th className="px-4 py-3 font-medium">Mitra</th>
              <th className="px-4 py-3 font-medium">Jenis</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">
                {aktifTab === "berakhir" ? "Berakhir" : "Diajukan"}
              </th>
            </tr>
          </thead>
          <tbody>
            {terpilih.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center"
                  style={{ color: "var(--text-muted)" }}
                >
                  Belum ada dokumen pada tab ini.
                </td>
              </tr>
            ) : (
              terpilih.map((b: any) => {
                const dok = b.dokumen_kerja_sama?.[0] ?? b.dokumen_kerja_sama;
                const mitra = b.partner_pengusul?.[0]?.partner?.nama;
                return (
                  <tr key={b.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3">
                      <Link href={`/kerja-sama/${b.id}`} className="no-dokumen underline">
                        {dok?.no_dokumen ?? `draf-${b.id}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{mitra ?? "—"}</td>
                    <td className="px-4 py-3">{b.jenis_kerjasama}</td>
                    <td className="px-4 py-3">
                      <StatusPill
                        status={dok?.status ?? b.status_proposal}
                        alasanArsip={dok?.alasan_arsip}
                      />
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      <Tanggal
                        nilai={
                          aktifTab === "berakhir"
                            ? dok?.tanggal_berakhir
                            : b.waktu_proposal_dokumen
                        }
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        Filter per kolom, paginasi sisi server, dan Unduh Laporan menyusul pada
        Fase 2 bersama ketiga ekspor Excel.
      </p>
    </div>
  );
}
