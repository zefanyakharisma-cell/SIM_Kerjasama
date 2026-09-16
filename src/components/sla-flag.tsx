/**
 * The SLA flag (Design §4.2).
 *
 * A frozen document shows a PAUSED indicator, never a ticking count -- the
 * clock really is stopped (BR-08), and a ticking number would read as overdue
 * to the IO staffer scanning the list.
 */
export function SlaFlag({
  hari,
  bendera,
  beku,
}: {
  hari: number | null;
  bendera: string | null;
  beku?: boolean;
}) {
  if (beku) {
    return (
      <span className="text-xs" style={{ color: "var(--status-pending)" }}>
        ⏸ Jam berhenti
      </span>
    );
  }
  if (hari === null) return <span className="text-xs text-[var(--text-muted)]">—</span>;

  const warna =
    bendera === "red"
      ? "var(--sla-red)"
      : bendera === "yellow"
        ? "var(--sla-yellow)"
        : "var(--text-secondary)";

  return (
    <span className="text-xs font-medium" style={{ color: warna }}>
      {bendera === "red" ? "▲ " : bendera === "yellow" ? "▲ " : ""}
      {hari} hari kerja
    </span>
  );
}
