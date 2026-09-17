import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { StatusPill } from "@/components/status-pill";
import { SlaFlag } from "@/components/sla-flag";
import {
  KOLOM,
  PER_HALAMAN,
  TAB,
  adalahTab,
  ambilHalaman,
  bacaFilter,
  kueriDariFilter,
  type TabKey,
} from "@/lib/laporan";

/**
 * Cari Kerja Sama — the lifecycle as tabs, each a filterable, paginated table
 * with its export (PRD §8.1, §8.2, Design §4.5).
 *
 * Status is a filter on every list, never a global archive switch: the archive
 * is one tab among the others, so an archived document is always one click away
 * and never hidden behind a mode.
 *
 * The filter row is a plain GET form. That is not minimalism for its own sake —
 * it puts the filter state in the URL, which is what makes a filtered view
 * shareable, reloadable, and exportable by handing the same query string to the
 * export endpoint.
 */
export const dynamic = "force-dynamic";

function Tanggal({ nilai }: { nilai: string | null }) {
  if (!nilai) return <>—</>;
  return <>{new Date(nilai).toLocaleDateString("id-ID", { dateStyle: "medium" })}</>;
}

const inputKelas = "w-full rounded border px-2 py-1 text-xs";

export default async function CariKerjaSama({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tab: TabKey = adalahTab(sp.tab as string) ? (sp.tab as TabKey) : "aktif";
  const filter = bacaFilter(sp);
  const halaman = Math.max(1, Number(sp.hal ?? 1) || 1);

  const supabase = await supabaseServer();
  const { baris, total } = await ambilHalaman(supabase, tab, filter, halaman);

  const halamanTerakhir = Math.max(1, Math.ceil(total / PER_HALAMAN));
  const kueri = kueriDariFilter(filter);
  // A UrlObject rather than a template string: typed routes cannot check a
  // string a function returns, and the query is built from the filter anyway.
  const tautan = (h: number) => ({
    pathname: "/kerja-sama" as const,
    query: {
      tab,
      hal: String(h),
      ...Object.fromEntries(Object.entries(filter).map(([k, v]) => [`f_${k}`, v])),
    },
  });
  const unduh = (jenis: string) =>
    `/api/ekspor/${jenis}?tab=${tab}${kueri ? `&${kueri}` : ""}`;

  const adaFilter = Object.keys(filter).length > 0;

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
              borderColor: k === tab ? "var(--midnight)" : "transparent",
              color: k === tab ? "var(--midnight)" : "var(--text-secondary)",
              fontWeight: k === tab ? 600 : 400,
            }}
          >
            {TAB[k]}
          </Link>
        ))}
      </nav>

      {/* The export buttons sit with the filters, so it is visible that they
          export what is on screen (Design §4.5). */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {total} dokumen{adaFilter ? " sesuai filter" : ""} · halaman {halaman} dari{" "}
          {halamanTerakhir}
        </span>
        <span className="flex flex-wrap gap-2">
          <a
            href={unduh("aktif")}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--border)", background: "white" }}
          >
            Unduh Laporan
          </a>
          <a
            href={unduh("sla")}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--border)", background: "white" }}
          >
            Unduh SLA per Dokumen
          </a>
          <a
            href={unduh("proses")}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--border)", background: "white" }}
          >
            Unduh Dokumen Berjalan
          </a>
        </span>
      </div>

      {tab === "proposal" ? (
        <div
          className="overflow-x-auto rounded-xl border bg-white"
          style={{ borderColor: "var(--border)" }}
        >
          {/* The spec-fixed column set for Proposal Kerja Sama (revision V3
              §2): its own table, distinct from the generic filterable one
              below, because its columns and its two actions (view report,
              edit while still a draft) are fixed by spec rather than
              user-chosen. */}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: "var(--text-secondary)" }}>
                {[
                  "No",
                  "Nama Mitra",
                  "Jenis",
                  "Agenda Kerja Sama",
                  "Pengusul",
                  "Tanggal Diajukan",
                  "Status Dokumen",
                  "Action",
                ].map((label) => (
                  <th key={label} className="px-3 py-2 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baris.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center" style={{ color: "var(--text-muted)" }}>
                    Belum ada dokumen pada tab ini.
                  </td>
                </tr>
              ) : (
                baris.map((b: any, i: number) => (
                  <tr
                    key={b.id_proposal}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {(halaman - 1) * PER_HALAMAN + i + 1}
                    </td>
                    <td className="px-3 py-2">{b.nama_mitra ?? "—"}</td>
                    <td className="px-3 py-2">{b.jenis_kerjasama}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {b.agenda ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {b.jabatan_pengusul ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      <Tanggal nilai={b.waktu_proposal_dokumen} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={b.status_tampil} alasanArsip={b.alasan_arsip} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center justify-center gap-1">
                        <Link
                          href={`/kerja-sama/${b.id_proposal}/laporan` as any}
                          aria-label="Lihat laporan dokumen"
                          className="inline-flex rounded p-1 hover:bg-black/5"
                          style={{ color: "var(--midnight)" }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            className="h-4 w-4"
                          >
                            <circle cx="11" cy="11" r="7" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                        </Link>
                        {b.status_proposal === "Draft" ? (
                          <Link
                            href={`/buat?id=${b.id_proposal}` as any}
                            aria-label="Edit draf"
                            className="inline-flex rounded p-1 hover:bg-black/5"
                            style={{ color: "var(--midnight)" }}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              className="h-4 w-4"
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </Link>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : tab === "aktif" ? (
        <div
          className="overflow-x-auto rounded-xl border bg-white"
          style={{ borderColor: "var(--border)" }}
        >
          {/* The spec-fixed column set for Kerja Sama Aktif (revision V2 §1) —
              distinct from the shared filterable table below, which the other
              tabs still use unchanged. */}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: "var(--text-secondary)" }}>
                {[
                  "No",
                  "Nama Mitra",
                  "Jenis Dokumen",
                  "Agenda Kerja Sama",
                  "Pengusul",
                  "Lingkup",
                  "Tanggal Mulai",
                  "Tanggal Berakhir",
                  "No. Dokumen",
                  "Action",
                ].map((label) => (
                  <th key={label} className="px-3 py-2 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baris.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center" style={{ color: "var(--text-muted)" }}>
                    Belum ada dokumen pada tab ini.
                  </td>
                </tr>
              ) : (
                baris.map((b: any, i: number) => (
                  <tr
                    key={b.id_proposal}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {(halaman - 1) * PER_HALAMAN + i + 1}
                    </td>
                    <td className="px-3 py-2">{b.nama_mitra ?? "—"}</td>
                    <td className="px-3 py-2">{b.jenis_kerjasama}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {b.agenda ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {b.jabatan_pengusul ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {b.lingkup ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      <Tanggal nilai={b.tanggal_mulai} />
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      <Tanggal nilai={b.tanggal_berakhir} />
                    </td>
                    <td className="px-3 py-2 no-dokumen">
                      {b.no_dokumen ?? `draf-${b.id_proposal}`}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Link
                        href={`/kerja-sama/${b.id_proposal}/laporan` as any}
                        aria-label="Lihat laporan dokumen"
                        className="inline-flex rounded p-1 hover:bg-black/5"
                        style={{ color: "var(--midnight)" }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          className="h-4 w-4"
                        >
                          <circle cx="11" cy="11" r="7" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
      <form method="get" action="/kerja-sama">
        <input type="hidden" name="tab" value={tab} />
        <div
          className="overflow-x-auto rounded-xl border bg-white"
          style={{ borderColor: "var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: "var(--text-secondary)" }}>
                {KOLOM.map((k) => (
                  <th key={k.kunci} className="px-3 py-2 font-medium">
                    {k.label}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">
                  {tab === "berakhir" ? "Berakhir" : "Diajukan"}
                </th>
                <th className="px-3 py-2 font-medium">
                  {tab === "berakhir" ? "Countdown" : ""}
                </th>
              </tr>
              {/* Every field gets a column filter control (Design §4.5). */}
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {KOLOM.map((k) => (
                  <th key={k.kunci} className="px-3 pb-2">
                    {k.jenis === "pilih" ? (
                      <select
                        name={`f_${k.kunci}`}
                        defaultValue={filter[k.kunci] ?? ""}
                        className={inputKelas}
                        style={{ borderColor: "var(--border)" }}
                      >
                        <option value="">Semua</option>
                        {"opsi" in k
                          ? k.opsi.map((o: string) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))
                          : null}
                      </select>
                    ) : (
                      <input
                        name={`f_${k.kunci}`}
                        defaultValue={filter[k.kunci] ?? ""}
                        placeholder="Saring…"
                        className={inputKelas}
                        style={{ borderColor: "var(--border)" }}
                      />
                    )}
                  </th>
                ))}
                <th className="px-3 pb-2">
                  <span className="flex gap-1">
                    <input
                      type="date"
                      name="f_dari"
                      defaultValue={filter.dari ?? ""}
                      className={inputKelas}
                      style={{ borderColor: "var(--border)" }}
                    />
                    <input
                      type="date"
                      name="f_sampai"
                      defaultValue={filter.sampai ?? ""}
                      className={inputKelas}
                      style={{ borderColor: "var(--border)" }}
                    />
                  </span>
                </th>
                <th className="px-3 pb-2">
                  <span className="flex gap-1">
                    <button
                      type="submit"
                      className="rounded px-2 py-1 text-xs font-medium text-white"
                      style={{ background: "var(--midnight)" }}
                    >
                      Saring
                    </button>
                    {adaFilter ? (
                      <Link
                        href={`/kerja-sama?tab=${tab}`}
                        className="rounded border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--border)" }}
                      >
                        Reset
                      </Link>
                    ) : null}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {baris.length === 0 ? (
                <tr>
                  <td
                    colSpan={KOLOM.length + 2}
                    className="px-4 py-10 text-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {/* An empty filtered list reads differently from an empty
                        one; users mistake the first for a broken system
                        (Design §6). */}
                    {adaFilter
                      ? "Tidak ada dokumen yang cocok dengan filter ini. Ubah atau reset filternya."
                      : "Belum ada dokumen pada tab ini."}
                  </td>
                </tr>
              ) : (
                baris.map((b: any) => (
                  <tr
                    key={b.id_proposal}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/kerja-sama/${b.id_proposal}`}
                        className="no-dokumen underline"
                      >
                        {b.no_dokumen ?? `draf-${b.id_proposal}`}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{b.nama_mitra ?? "—"}</td>
                    <td className="px-3 py-2">{b.jenis_kerjasama}</td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          status={b.status_tampil}
                          alasanArsip={b.alasan_arsip}
                        />
                        {/* A faculty submitter sees the SLA flag on their own
                            submissions (resolved D2); RLS has already decided
                            which rows those are. */}
                        {b.status_sla && b.status_sla !== "normal" ? (
                          <SlaFlag hari={null} bendera={b.status_sla} />
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {b.unit_pengusul ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {b.negara ?? "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      <Tanggal
                        nilai={
                          tab === "berakhir"
                            ? b.tanggal_berakhir
                            : b.waktu_proposal_dokumen
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      {tab === "berakhir" ? (
                        <span
                          className="text-xs font-medium"
                          style={{
                            color:
                              b.sisa_hari !== null && b.sisa_hari <= 60
                                ? "var(--sla-red)"
                                : "var(--text-secondary)",
                          }}
                        >
                          {b.sisa_hari === null ? "—" : `${b.sisa_hari} hari`}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </form>
      )}

      {halamanTerakhir > 1 ? (
        <nav className="mt-3 flex items-center gap-2 text-sm">
          {halaman > 1 ? (
            <Link href={tautan(halaman - 1)} className="underline">
              ← Sebelumnya
            </Link>
          ) : null}
          {halaman < halamanTerakhir ? (
            <Link href={tautan(halaman + 1)} className="underline">
              Berikutnya →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
