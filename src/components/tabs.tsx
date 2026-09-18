import Link from "next/link";

/**
 * The underline tab bar used across the app. The active tab lives in the URL
 * (`?tab=`), read by the page on the server, so a tab is linkable and
 * survives a reload — no client state.
 */
export function Tabs<K extends string>({
  basePath,
  tabs,
  aktif,
}: {
  basePath: string;
  tabs: Partial<Record<K, string>>;
  aktif: K;
}) {
  return (
    <nav className="mb-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border)" }}>
      {(Object.keys(tabs) as K[]).map((k) => (
        <Link
          key={k}
          href={`${basePath}?tab=${k}` as any}
          aria-current={k === aktif ? "page" : undefined}
          className="border-b-2 px-3 py-2 text-sm"
          style={{
            borderColor: k === aktif ? "var(--midnight)" : "transparent",
            color: k === aktif ? "var(--midnight)" : "var(--text-secondary)",
            fontWeight: k === aktif ? 600 : 400,
          }}
        >
          {tabs[k]}
        </Link>
      ))}
    </nav>
  );
}
