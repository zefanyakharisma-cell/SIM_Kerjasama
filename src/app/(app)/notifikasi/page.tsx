import Link from "next/link";
import type { Route } from "next";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { tandaiSemuaTerbaca } from "@/lib/actions/notifikasi";
import {
  JUDUL_NOTIFIKASI,
  KOLOM_NOTIFIKASI,
  WARNA_NOTIFIKASI,
  tautanNotifikasi,
  waktuNotifikasi,
  type Notifikasi,
} from "@/lib/notifikasi";

/**
 * In-app notifications (Design §7).
 *
 * The floating bell opens this same inbox as a popup, which is how it is
 * normally read (Revisi V8 mobile pass); this page stays for a direct link and
 * renders the identical rows from lib/notifikasi.ts, so the two cannot drift.
 *
 * Grouped by document and each opening the document the notice is about — an
 * approval request opens the document, a batas-waktu reminder opens the same
 * document on the screen the approver needs.
 *
 * Notifications are addressed to a POSITION, not a person, so the current
 * holder of the office receives them with no migration when the office changes
 * hands (DR-06). RLS already scopes this list to the reader's own position.
 */
export const dynamic = "force-dynamic";

export default async function Notifikasi() {
  const akun = await akunSaatIni();
  const supabase = await supabaseServer();
  // RLS lets IO read every position's inbox (for oversight), so without this
  // filter IO would see each event once per recipient. The inbox is its own.
  const { data } = await supabase
    .from("notifikasi")
    .select(KOLOM_NOTIFIKASI)
    .eq("id_jabatan_penerima", akun?.id_jabatan ?? -1)
    .order("waktu_kirim", { ascending: false })
    .limit(100);

  const daftar = (data ?? []) as Notifikasi[];
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
          <form action={tandaiSemuaTerbaca}>
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
            const tautan = tautanNotifikasi(n);
            const isi = (
              <>
                <span className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background: n.waktu_dibaca
                        ? "transparent"
                        : (WARNA_NOTIFIKASI[n.jenis_notifikasi] ?? "var(--status-progress)"),
                    }}
                  />
                  <span className="text-sm font-medium">
                    {JUDUL_NOTIFIKASI[n.jenis_notifikasi] ?? n.jenis_notifikasi}
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
                  {waktuNotifikasi(n.waktu_kirim)}
                </span>
              </>
            );

            const kelas = "block rounded-xl border bg-white p-3";
            const gaya = {
              borderColor: n.waktu_dibaca ? "var(--border)" : "var(--midnight)",
            };

            return (
              <li key={n.id}>
                {tautan ? (
                  <Link href={tautan as Route} className={kelas} style={gaya}>
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
