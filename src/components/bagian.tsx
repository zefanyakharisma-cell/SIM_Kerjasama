/**
 * The numbered section card the long forms are built from. Lifted out of
 * buat/page.tsx unchanged when /catat became a second caller — the proposal
 * form and the direct-entry form are the same sections, and two copies is how
 * they would stop looking alike.
 */
export function Bagian({
  judul,
  keterangan,
  children,
}: {
  judul: string;
  keterangan?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mb-5 rounded-xl border bg-white p-5"
      style={{ borderColor: "var(--border)" }}
    >
      <h2 className="text-sm font-semibold">{judul}</h2>
      {keterangan ? (
        <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {keterangan}
        </p>
      ) : (
        <div className="mb-3" />
      )}
      {children}
    </section>
  );
}
