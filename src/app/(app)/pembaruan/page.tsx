import Link from "next/link";
import { akunSaatIni, isIO, supabaseServer } from "@/lib/supabase/server";
import { kirimPermintaanPembaruan } from "@/lib/actions/pembaruan";
import { SubmitButton } from "@/components/submit-button";

/**
 * Pembaruan — the renewal queue (PRD §9, Design §5.3, §5.8).
 *
 * Two audiences on one screen, because they are working the same list from
 * opposite ends: IO sees what is expiring and dispositions the request; the
 * owning unit sees the task it has been handed and the next action on the row.
 *
 * The renewal-request SLA shown here runs on the 30/60/90 CALENDAR-day scale.
 * It is deliberately not the 2/4 business-day approval scale, and the two are
 * never rendered by the same component — a renewal request is a task, not a
 * gate (BR-24, BR-32).
 */
export const dynamic = "force-dynamic";

const GERBANG: Record<string, { label: string; warna: string }> = {
  menunggu: { label: "Menunggu evaluasi", warna: "var(--text-muted)" },
  terbuka: { label: "Gerbang terbuka", warna: "var(--status-active)" },
  terminate: { label: "Tidak dilanjutkan", warna: "var(--status-archived)" },
  split: { label: "Evaluasi berbeda", warna: "var(--action-danger)" },
};

function BenderaPembaruan({ hari }: { hari: number | null }) {
  if (hari === null) return null;
  // 30 reminder / 60 yellow / 90 red, in days (PRD §13.1).
  const warna =
    hari > 90 ? "var(--sla-red)" : hari > 60 ? "var(--sla-yellow-text)" : "var(--text-secondary)";
  return (
    <span className="text-xs font-medium" style={{ color: warna }}>
      {hari > 60 ? "▲ " : ""}
      {hari} hari sejak diminta
    </span>
  );
}

export default async function Pembaruan() {
  const akun = await akunSaatIni();
  const io = isIO(akun);
  const supabase = await supabaseServer();

  const { data: antrean } = await supabase
    .from("v_pembaruan")
    .select("*")
    .order("tanggal_berakhir", { ascending: true })
    .limit(200);

  // Expiring documents that have not been dispositioned yet. Only IO can act on
  // these, so only IO is shown them.
  const { data: belumDiminta } = io
    ? await supabase
        .from("v_daftar_dokumen")
        .select("no_dokumen_kerjasama, no_dokumen, nama_mitra, tanggal_berakhir, sisa_hari")
        .eq("status_dokumen", "Akan Berakhir")
        .not("no_dokumen_kerjasama", "is", null)
        .order("tanggal_berakhir")
        .limit(100)
    : { data: [] };

  const sudah = new Set((antrean ?? []).map((r: any) => r.no_dokumen_kerjasama));
  const menungguDisposisi = (belumDiminta ?? []).filter(
    (d: any) => !sudah.has(d.no_dokumen_kerjasama),
  );

  async function minta(formData: FormData) {
    "use server";
    await kirimPermintaanPembaruan(
      Number(formData.get("no")),
      String(formData.get("pesan") ?? ""),
    );
  }

  return (
    <div className="max-w-5xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
          Pembaruan
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Perpanjangan berjalan lewat evaluasi dua sisi: fakultas dan mitra.
          Proposal perpanjangan baru bisa dibuat bila keduanya sudah masuk dan
          keduanya merekomendasikan lanjut.
        </p>
      </header>

      {io && menungguDisposisi.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">Akan berakhir, belum didisposisi</h2>
          <ul className="space-y-2">
            {menungguDisposisi.map((d: any) => (
              <li
                key={d.no_dokumen_kerjasama}
                className="rounded-xl border bg-white p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="no-dokumen text-sm font-medium">
                      {d.no_dokumen ?? "—"}
                    </span>{" "}
                    <span className="text-sm">{d.nama_mitra}</span>
                  </span>
                  <span className="text-xs" style={{ color: "var(--sla-yellow-text)" }}>
                    berakhir {d.tanggal_berakhir} · {d.sisa_hari} hari lagi
                  </span>
                </div>
                <form action={minta} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="no" value={d.no_dokumen_kerjasama} />
                  <input
                    name="pesan"
                    placeholder="Pesan untuk unit pemilik…"
                    className="min-w-[14rem] flex-1 rounded-lg border px-3 py-1.5 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <SubmitButton
                    labelMenunggu="Mengirim…"
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                    style={{ background: "var(--renewal-request)" }}
                  >
                    Kirim Permintaan Pembaruan
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="mb-2 text-sm font-semibold">Dalam proses pembaruan</h2>
      {(antrean ?? []).length === 0 ? (
        <div
          className="rounded-xl border bg-white p-10 text-center text-sm"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Tidak ada permintaan pembaruan yang sedang berjalan.
        </div>
      ) : (
        <ul className="space-y-2">
          {(antrean ?? []).map((r: any) => {
            const g = GERBANG[r.gerbang] ?? GERBANG.menunggu;
            return (
              <li key={r.no_dokumen_kerjasama}>
                <Link
                  href={`/pembaruan/${r.no_dokumen_kerjasama}`}
                  className="block rounded-xl border bg-white p-4"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="no-dokumen text-sm font-medium">
                        {r.no_dokumen ?? "—"}
                      </span>{" "}
                      <span className="text-sm">{r.nama_mitra}</span>
                      <span
                        className="block text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {r.unit_pengusul ?? "Unit tidak tercatat"} · berakhir{" "}
                        {r.tanggal_berakhir}
                      </span>
                    </span>
                    <BenderaPembaruan hari={r.usia_permintaan_hari} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    {/* The evaluation status pair, which is what the row is
                        really about (Design §5.3). */}
                    <span style={{ color: "var(--text-secondary)" }}>
                      Fakultas:{" "}
                      <strong>
                        {r.status_faculty === "submitted"
                          ? `masuk (${r.rekomendasi_faculty === "continue" ? "lanjut" : "akhiri"})`
                          : "belum"}
                      </strong>
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      Mitra:{" "}
                      <strong>
                        {r.status_partner === "submitted"
                          ? `masuk (${r.rekomendasi_partner === "continue" ? "lanjut" : "akhiri"})`
                          : "belum"}
                      </strong>
                    </span>
                    <span className="font-medium" style={{ color: g.warna }}>
                      ● {g.label}
                    </span>
                    {r.id_proposal_penerus ? (
                      <span style={{ color: "var(--status-active)" }}>
                        · proposal perpanjangan sudah dibuat
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
