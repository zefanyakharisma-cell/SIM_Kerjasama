/**
 * The status pill, on every document, everywhere (Design §4.1).
 *
 * Dot plus text label: the label is what carries the meaning, the colour only
 * reinforces it, so the pill still reads correctly in monochrome or to someone
 * who cannot distinguish the hues.
 */
const WARNA: Record<string, string> = {
  Draft: "var(--status-draft)",
  Diajukan: "var(--status-progress)",
  Diproses: "var(--status-progress)",
  "Disposisi - Tier 1": "var(--status-progress)",
  "Disposisi - Tier 2": "var(--status-progress)",
  "Disposisi - Tier 3": "var(--status-progress)",
  Pending: "var(--status-pending)",
  Disetujui: "var(--status-approved)",
  Ditolak: "var(--action-danger)",
  Aktif: "var(--status-active)",
  "Akan Berakhir": "var(--sla-yellow)",
  "Disposisi Evaluasi": "var(--status-progress)",
  Kedaluarsa: "var(--status-archived)",
  Diarsipkan: "var(--status-archived)",
};

/**
 * A frozen document reads "Ditangguhkan", never a bare "Pending" (Design §4.1).
 * "Kedaluarsa" is the stored DB value; users see the KBBI spelling.
 */
const LABEL: Record<string, string> = {
  Pending: "Ditangguhkan",
  Kedaluarsa: "Kedaluwarsa",
};

const ALASAN: Record<string, string> = {
  rejected: "Ditolak",
  expired_without_renewal: "Kedaluwarsa",
  not_renewed: "Tidak Diperpanjang",
  superseded_by_renewal: "Diperpanjang",
  terminated_early: "Diakhiri lebih awal",
};

export function StatusPill({
  status,
  alasanArsip,
}: {
  status: string;
  alasanArsip?: string | null;
}) {
  const warna = WARNA[status] ?? "var(--status-draft)";
  const label = LABEL[status] ?? status;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ borderColor: warna, color: "var(--text-primary)" }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: warna }}
      />
      {label}
      {/* An archived pill always names its reason (Design §4.1, BR-10). */}
      {alasanArsip ? (
        <span style={{ color: "var(--text-secondary)" }}>
          · {ALASAN[alasanArsip] ?? alasanArsip}
        </span>
      ) : null}
    </span>
  );
}
