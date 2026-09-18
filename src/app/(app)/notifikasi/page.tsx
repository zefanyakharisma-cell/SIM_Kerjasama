import Link from "next/link";
import { revalidatePath } from "next/cache";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";

/**
 * In-app notifications (Design §7).
 *
 * Grouped by document and each opening the document the notice is about — an
 * approval request opens the document, an SLA reminder opens the same document
 * on the same screen the approver needs. A notification that does not lead
 * anywhere is just noise.
 *
 * Notifications are addressed to a POSITION, not a person, so the current
 * holder of the office receives them with no migration when the office changes
 * hands (DR-06). RLS already scopes this list to the reader's own position.
 */
export const dynamic = "force-dynamic";

const JUDUL: Record<string, string> = {
  disposition_assigned: "Dokumen menunggu persetujuan Anda",
  renewal_request_assigned: "Permintaan pembaruan untuk unit Anda",
  approved: "Disetujui",
  rejected: "Ditolak",
  pending: "Dokumen ditangguhkan",
  revision_requested: "Permintaan revisi",
  reactivated: "Diaktifkan kembali — approval diulang dari Tier 1",
  expiring_soon: "Dokumen akan berakhir",
  sla_yellow: "Melewati batas SLA",
  sla_red: "Jauh melewati batas SLA",
  sla_eskalasi: "Eskalasi: approver belum menindak",
  renewal_request_sla: "SLA permintaan pembaruan",
  evaluation_submitted: "Evaluasi masuk",
  split_decision: "Evaluasi berbeda — perlu keputusan",
};

// Colour carries no meaning alone; each of these also reads as a word above.
const WARNA: Record<string, string> = {
  sla_red: "var(--sla-red)",
  sla_eskalasi: "var(--sla-red)",
  sla_yellow: "var(--sla-yellow)",
  pending: "var(--status-pending)",
  rejected: "var(--action-danger)",
  split_decision: "var(--action-danger)",
  expiring_soon: "var(--sla-yellow)",
  renewal_request_assigned: "var(--renewal-request)",
};

async function tandaiTerbaca() {
  "use server";
  const akun = await akunSaatIni();
  if (!akun) return;
  const supabase = await supabaseServer();
  // Only the recipient position may mark its own inbox read; the RLS update
  // policy says so, and this call simply relies on it (EC-05).
  await supabase
    .from("notifikasi")
    .update({ status: "read", waktu_dibaca: new Date().toISOString() })
    .eq("id_jabatan_penerima", akun.id_jabatan)
    .is("waktu_dibaca", null);
  revalidatePath("/notifikasi");
}

export default async function Notifikasi() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("notifikasi")
    .select(
      "id, jenis_notifikasi, isi, waktu_kirim, waktu_dibaca, id_proposal_dokumen, no_dokumen_kerjasama",
    )
    .order("waktu_kirim", { ascending: false })
    .limit(100);

  const daftar = data ?? [];
  const belumDibaca = daftar.filter((n) => !n.waktu_dibaca).length;

  return (
    <div className="max-w-3xl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
            Notifikasi
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Ditujukan ke jabatan Anda, bukan ke perorangan.
          </p>
        </div>
        {belumDibaca > 0 ? (
          <form action={tandaiTerbaca}>
            <SubmitButton
              labelMenunggu="Menandai…"
              className="rounded-lg border px-3 py-1.5 text-xs"
              style={{ borderColor: "var(--border)", background: "white" }}
            >
              Tandai semua terbaca ({belumDibaca})
            </SubmitButton>
          </form>
        ) : null}
      </header>

      {daftar.length === 0 ? (
        <div
          className="rounded-xl border bg-white p-10 text-center text-sm"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Belum ada notifikasi.
        </div>
      ) : (
        <ul className="space-y-2">
          {daftar.map((n) => {
            const isi = (
              <>
                <span className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background: n.waktu_dibaca
                        ? "transparent"
                        : (WARNA[n.jenis_notifikasi] ?? "var(--status-progress)"),
                    }}
                  />
                  <span className="text-sm font-medium">
                    {JUDUL[n.jenis_notifikasi] ?? n.jenis_notifikasi}
                  </span>
                </span>
                {/* First line: [Jabatan] [aksi] [No. Dokumen] [Jenis] [Mitra]
                    [— Agenda], so the reader knows which document it was;
                    any further line is the writer's own detail. */}
                {n.isi ? (
                  <span
                    className="mt-0.5 block whitespace-pre-line pl-3.5 text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {n.isi}
                  </span>
                ) : null}
                <span
                  className="mt-0.5 block pl-3.5 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {new Date(n.waktu_kirim).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </>
            );

            const kelas = "block rounded-xl border bg-white p-3";
            const gaya = {
              borderColor: n.waktu_dibaca ? "var(--border)" : "var(--midnight)",
            };

            return (
              <li key={n.id}>
                {n.id_proposal_dokumen || n.no_dokumen_kerjasama ? (
                  <Link
                    href={
                      // Renewal notices carry only the document number;
                      // /pembaruan/[no] redirects to its Pembaruan tab.
                      (n.id_proposal_dokumen
                        ? `/kerja-sama/${n.id_proposal_dokumen}`
                        : `/pembaruan/${n.no_dokumen_kerjasama}`) as any
                    }
                    className={kelas}
                    style={gaya}
                  >
                    {isi}
                  </Link>
                ) : (
                  <div className={kelas} style={gaya}>
                    {isi}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
