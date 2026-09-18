/**
 * Shown while an app page streams in. Deliberately quiet: a title bar and a
 * few grey rows, so the layout does not jump when the real content lands.
 */
export default function Memuat() {
  return (
    <div role="status" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Memuat…</span>
      <div aria-hidden className="mb-6 h-6 w-48 rounded bg-gray-200" />
      <div
        aria-hidden
        className="space-y-3 rounded-xl border bg-white p-4"
        style={{ borderColor: "var(--border)" }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 rounded bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
