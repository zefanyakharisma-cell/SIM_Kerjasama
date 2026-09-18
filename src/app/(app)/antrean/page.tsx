import Link from "next/link";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { SlaFlag } from "@/components/sla-flag";

/**
 * Antrean Saya — the personal approval queue (PRD §8.4, Design §5.2).
 *
 * Ordered red, then yellow, then the rest: the point of the queue is to make
 * the overdue item the first thing seen. Each row opens the document on its
 * approval view, not a read-only one, because acting is why the approver
 * logged in.
 */
export const dynamic = "force-dynamic";

const URUTAN: Record<string, number> = { red: 0, yellow: 1, normal: 2 };

export default async function Antrean() {
  const akun = await akunSaatIni();
  const supabase = await supabaseServer();

  // "Approver" is derived: it is whatever open target points at my position.
  // There is no stored approver role to look up (AR-01).
  const { data: antrean } = await supabase
    .from("disposisi_target")
    .select(
      `no, tier, status, durasi_hari_kerja, status_sla, batas_waktu_sla,
       disposisi:no_disposisi (
         no, pesan_disposisi, jenis_disposisi,
         proposal_dokumen:id_proposal_dokumen (
           id, jenis_kerjasama, status_proposal,
           partner_pengusul ( partner ( nama ) ),
           dokumen_kerja_sama ( no_dokumen ),
           sebelumnya:id_dokumen_sebelumnya ( dokumen_kerja_sama ( no_dokumen ) )
         )
       )`,
    )
    .eq("id_jabatan", akun?.id_jabatan ?? -1)
    .eq("status", "pending_action");

  // A renewal request is a task, not a gate, and never shows up as an approval
  // to grant (BR-24). Branch on the kind before anything else.
  const approval = (antrean ?? []).filter(
    (t: any) => t.disposisi?.jenis_disposisi === "approval",
  );

  const urut = approval.sort(
    (a: any, b: any) =>
      (URUTAN[a.status_sla ?? "normal"] ?? 2) - (URUTAN[b.status_sla ?? "normal"] ?? 2),
  );

  return (
    <div className="max-w-3xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
          Antrean Saya
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Dokumen yang menunggu tindakan jabatan Anda.
        </p>
      </header>

      {urut.length === 0 ? (
        <div
          className="rounded-xl border bg-white p-10 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Tidak ada dokumen yang menunggu tindakan Anda.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {urut.map((t: any) => {
            const proposal = t.disposisi?.proposal_dokumen;
            const mitra = proposal?.partner_pengusul?.[0]?.partner?.nama;
            // A proposal has no document number until IO types one at
            // activation (BR-22), so the proposal id stands in until then.
            // dokumen_kerja_sama.id_proposal_dokumen is unique: an object, not an array.
            const noDokumen = proposal?.dokumen_kerja_sama?.no_dokumen;
            const noSebelumnya = proposal?.sebelumnya?.dokumen_kerja_sama?.no_dokumen;
            return (
              <li key={t.no}>
                <Link
                  href={`/kerja-sama/${proposal?.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border bg-white p-4"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {mitra ?? `Proposal #${proposal?.id}`}
                    </span>
                    <span className="no-dokumen block text-xs" style={{ color: "var(--text-secondary)" }}>
                      {noDokumen ? `No. Dokumen ${noDokumen}` : `No. Proposal #${proposal?.id}`}
                      {noSebelumnya ? ` · Perpanjangan dari ${noSebelumnya}` : ""}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
                      {proposal?.jenis_kerjasama} · Tier {t.tier}
                      {t.disposisi?.pesan_disposisi
                        ? ` · ${t.disposisi.pesan_disposisi}`
                        : ""}
                    </span>
                  </span>
                  <SlaFlag hari={t.durasi_hari_kerja} bendera={t.status_sla} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
