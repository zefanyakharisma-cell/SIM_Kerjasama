import Link from "next/link";
import { akunSaatIni, isIO, supabaseServer } from "@/lib/supabase/server";
import { kirimPermintaanPembaruan } from "@/lib/actions/pembaruan";
import { StatusPill } from "@/components/status-pill";
import { SlaFlag } from "@/components/sla-flag";
import { SubmitButton } from "@/components/submit-button";
import { Tabs } from "@/components/tabs";
import { GERBANG } from "@/components/pembaruan-panel";
import {
  KOLOM,
  PER_HALAMAN,
  TAB,
  URUTAN,
  type Filter,
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

function IkonCari() {
  return (
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
  );
}

function IkonEdit() {
  return (
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
  );
}

/**
 * Filter + sort for every tab. A plain GET form above the table rather than a
 * header row inside it, because the tabs have different spec-fixed columns;
 * the state lands in the URL, so paging and the exports carry it.
 */
function BarFilter({ tab, filter }: { tab: TabKey; filter: Filter }) {
  const gaya = { borderColor: "var(--border)" };
  return (
    <form
      method="get"
      action="/kerja-sama"
      className="mb-3 grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-3 lg:grid-cols-5"
      style={gaya}
    >
      <input type="hidden" name="tab" value={tab} />
      {KOLOM.map((k) => (
        <label key={k.kunci} className="block text-xs">
          <span className="mb-0.5 block" style={{ color: "var(--text-secondary)" }}>
            {k.label}
          </span>
          {k.jenis === "pilih" ? (
            <select name={`f_${k.kunci}`} defaultValue={filter[k.kunci] ?? ""} className={inputKelas} style={gaya}>
              <option value="">Semua</option>
              {k.opsi.map((o: string) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={`f_${k.kunci}`}
              defaultValue={filter[k.kunci] ?? ""}
              placeholder="Saring…"
              className={inputKelas}
              style={gaya}
            />
          )}
        </label>
      ))}
      <label className="block text-xs">
        <span className="mb-0.5 block" style={{ color: "var(--text-secondary)" }}>
          {tab === "berakhir" ? "Berakhir dari / sampai" : "Diajukan dari / sampai"}
        </span>
        <span className="flex gap-1">
          <input type="date" name="f_dari" aria-label="Dari tanggal" defaultValue={filter.dari ?? ""} className={inputKelas} style={gaya} />
          <input type="date" name="f_sampai" aria-label="Sampai tanggal" defaultValue={filter.sampai ?? ""} className={inputKelas} style={gaya} />
        </span>
      </label>
      <label className="block text-xs">
        <span className="mb-0.5 block" style={{ color: "var(--text-secondary)" }}>
          Urutkan
        </span>
        <span className="flex gap-1">
          <select name="f_urut" aria-label="Urutkan menurut" defaultValue={filter.urut ?? ""} className={inputKelas} style={gaya}>
            <option value="">Terbaru dibuat</option>
            {Object.entries(URUTAN)
              .filter(([k]) => k !== "id_proposal")
              .map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
          </select>
          <select name="f_arah" aria-label="Arah urutan" defaultValue={filter.arah ?? ""} className={inputKelas} style={gaya}>
            <option value="">Otomatis</option>
            <option value="asc">A→Z / Lama→Baru</option>
            <option value="desc">Z→A / Baru→Lama</option>
          </select>
        </span>
      </label>
      <span className="flex items-end gap-1">
        <button
          type="submit"
          className="rounded px-3 py-1 text-xs font-medium text-white"
          style={{ background: "var(--midnight)" }}
        >
          Saring
        </button>
        {Object.keys(filter).length > 0 ? (
          <Link href={`/kerja-sama?tab=${tab}`} className="rounded border px-3 py-1 text-xs" style={gaya}>
            Reset
          </Link>
        ) : null}
      </span>
    </form>
  );
}

/**
 * The spec-fixed column set shared by Proposal Kerja Sama and Disetujui
 * (revision V3 §2, §Disetujui): same columns, only the Action target and the
 * draft-edit icon differ — a Disetujui row is never a draft, so it only ever
 * gets one action.
 */
function TabelProposal({
  baris,
  halaman,
  aksiHref,
  aksiLabel,
  editDraf,
}: {
  baris: any[];
  halaman: number;
  aksiHref: (idProposal: number) => string;
  aksiLabel: string;
  editDraf: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
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
              <tr key={b.id_proposal} className="border-t" style={{ borderColor: "var(--border)" }}>
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
                      href={aksiHref(b.id_proposal) as any}
                      aria-label={aksiLabel}
                      className="inline-flex rounded p-1 hover:bg-black/5"
                      style={{ color: "var(--midnight)" }}
                    >
                      <IkonCari />
                    </Link>
                    {editDraf && b.status_proposal === "Draft" ? (
                      <Link
                        href={`/buat?id=${b.id_proposal}` as any}
                        aria-label="Edit draf"
                        className="inline-flex rounded p-1 hover:bg-black/5"
                        style={{ color: "var(--midnight)" }}
                      >
                        <IkonEdit />
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
  );
}

/**
 * The spec-fixed column set for Kerja Sama Aktif (revision V2 §1), shared by
 * Akan Berakhir — an expiring document is still an active one. On Akan
 * Berakhir the table gains the countdown and the renewal state, and the row
 * is where IO sends the evaluation disposition to the unit and partner; the
 * tracking itself lives on the document's Pembaruan tab.
 */
function TabelDokumen({
  baris,
  halaman,
  pembaruan,
}: {
  baris: any[];
  halaman: number;
  pembaruan?: {
    gerbang: Map<number, string>;
    io: boolean;
    minta: (formData: FormData) => Promise<void>;
  };
}) {
  const kolom = [
    "No",
    "Nama Mitra",
    "Jenis Dokumen",
    "Agenda Kerja Sama",
    "Pengusul",
    "Lingkup",
    "Tanggal Mulai",
    "Tanggal Berakhir",
    ...(pembaruan ? ["Sisa Hari", "Status Pembaruan"] : []),
    "No. Dokumen",
    "Action",
  ];
  return (
    <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left" style={{ color: "var(--text-secondary)" }}>
            {kolom.map((label) => (
              <th key={label} className="px-3 py-2 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 ? (
            <tr>
              <td colSpan={kolom.length} className="px-4 py-10 text-center" style={{ color: "var(--text-muted)" }}>
                Belum ada dokumen pada tab ini.
              </td>
            </tr>
          ) : (
            baris.map((b: any, i: number) => {
              const laporan = `/kerja-sama/${b.id_proposal}/laporan`;
              const g = pembaruan?.gerbang.get(b.no_dokumen_kerjasama);
              return (
                <tr key={b.id_proposal} className="border-t" style={{ borderColor: "var(--border)" }}>
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
                  {pembaruan ? (
                    <>
                      <td className="px-3 py-2">
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
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {g ? (
                          <span className="font-medium" style={{ color: GERBANG[g]?.warna }}>
                            ● {GERBANG[g]?.label ?? g}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>Belum dikirim</span>
                        )}
                      </td>
                    </>
                  ) : null}
                  <td className="px-3 py-2 no-dokumen">{b.no_dokumen ?? `draf-${b.id_proposal}`}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center justify-center gap-1">
                      <Link
                        href={(g ? `${laporan}?tab=pembaruan` : laporan) as any}
                        aria-label="Lihat laporan dokumen"
                        className="inline-flex rounded p-1 hover:bg-black/5"
                        style={{ color: "var(--midnight)" }}
                      >
                        <IkonCari />
                      </Link>
                      {pembaruan && !g && pembaruan.io && b.no_dokumen_kerjasama ? (
                        // Native disclosure, no client JS: the optional message
                        // for the unit, then the send.
                        <details className="relative">
                          <summary
                            className="cursor-pointer list-none whitespace-nowrap rounded px-2 py-1 text-xs font-medium text-white"
                            style={{ background: "var(--renewal-request)" }}
                          >
                            Kirim Disposisi Evaluasi
                          </summary>
                          <form
                            action={pembaruan.minta}
                            className="absolute right-0 z-10 mt-1 w-64 space-y-2 rounded-lg border bg-white p-3 shadow"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <input type="hidden" name="no" value={b.no_dokumen_kerjasama} />
                            <textarea
                              name="pesan"
                              rows={2}
                              placeholder="Pesan untuk unit pemilik (opsional)…"
                              className="w-full rounded border px-2 py-1 text-xs"
                              style={{ borderColor: "var(--border)" }}
                            />
                            <SubmitButton
                              labelMenunggu="Mengirim…"
                              className="w-full rounded px-2 py-1 text-xs font-medium text-white"
                              style={{ background: "var(--renewal-request)" }}
                            >
                              Kirim ke Unit &amp; Mitra
                            </SubmitButton>
                          </form>
                        </details>
                      ) : null}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

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
  const io = isIO(await akunSaatIni());

  // Renewal state for the rows on this page of Akan Berakhir; no row = not sent.
  const nomor = baris.map((b: any) => b.no_dokumen_kerjasama).filter(Boolean);
  const { data: jalan } =
    tab === "berakhir" && nomor.length
      ? await supabase
          .from("v_pembaruan")
          .select("no_dokumen_kerjasama, gerbang")
          .in("no_dokumen_kerjasama", nomor)
      : { data: [] };
  const gerbang = new Map<number, string>(
    (jalan ?? []).map((r: any) => [r.no_dokumen_kerjasama, r.gerbang]),
  );

  async function minta(formData: FormData) {
    "use server";
    await kirimPermintaanPembaruan(Number(formData.get("no")), String(formData.get("pesan") ?? ""));
  }

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

      <Tabs basePath="/kerja-sama" tabs={TAB} aktif={tab} />

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

      <BarFilter tab={tab} filter={filter} />

      {tab === "proposal" ? (
        <TabelProposal
          baris={baris}
          halaman={halaman}
          aksiHref={(id) => `/kerja-sama/${id}/laporan`}
          aksiLabel="Lihat laporan dokumen"
          editDraf
        />
      ) : tab === "disetujui" ? (
        // Every row here has already cleared Tier 3 — the only action left is
        // typing in the signed-document details, so the magnifying glass goes
        // straight to that activation form instead of the report (per
        // revision).
        <TabelProposal
          baris={baris}
          halaman={halaman}
          aksiHref={(id) => `/kerja-sama/${id}/aktivasi`}
          aksiLabel="Aktivasi dokumen"
          editDraf={false}
        />
      ) : tab === "aktif" ? (
        <TabelDokumen baris={baris} halaman={halaman} />
      ) : tab === "berakhir" ? (
        <TabelDokumen baris={baris} halaman={halaman} pembaruan={{ gerbang, io, minta }} />
      ) : (
        <div
          className="overflow-x-auto rounded-xl border bg-white"
          style={{ borderColor: "var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: "var(--text-secondary)" }}>
                {["No. Dokumen", "Mitra", "Jenis", "Status", "Unit Pengusul", "Negara", "Diajukan"].map(
                  (label) => (
                    <th key={label} className="px-3 py-2 font-medium">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {baris.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
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
                      <Tanggal nilai={b.waktu_proposal_dokumen} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
