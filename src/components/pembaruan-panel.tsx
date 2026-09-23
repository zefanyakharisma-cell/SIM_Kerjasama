import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import {
  BlokRekomendasi,
  DIMENSI,
  GridLikert,
  bacaJawaban,
} from "@/components/likert";
import {
  arsipkanDokumen,
  bukaUlangEvaluasi,
  buatProposalPerpanjangan,
  buatTautanEvaluasiMitra,
  kirimEvaluasiFakultas,
  kirimPermintaanPembaruan,
  mulaiProsesPembaruan,
  putuskanPembaruan,
  type Hasil,
} from "@/lib/actions/pembaruan";
import { unggahBerkas, TERIMA_PDF_WORD } from "@/lib/unggah";
import { TujuanEvaluasi } from "@/components/tujuan-evaluasi";
import { bacaTujuanEvaluasi, opsiJabatanEvaluasi } from "@/lib/tujuan-evaluasi";

/**
 * One renewal, end to end (PRD §9.3–§9.6, Design §5.3, §5.9, §5.11) — the
 * Pembaruan tab of the document report.
 *
 * Everything the renewal needs is in one place because it is one task with two
 * halves that have to be read together: the faculty answer, the partner answer,
 * what the two of them add up to, and the one action the gate currently
 * permits. The gate banner states its own reasoning — an upload control that is
 * simply absent, with no explanation, is what generates support tickets.
 */

const KOLOM_EVAL =
  "no, respondent_type, status, id_jabatan_pengusul, jabatan ( nama ), rekomendasi, continuation_mode, catatan_evaluasi, " +
  "respondent_nama, respondent_jabatan, respondent_email, respondent_hp, waktu_evaluasi, form_revision, id_supersedes, " +
  "exp_quality, exp_relevance, exp_productivity, exp_sustainability, exp_communication, " +
  "sat_quality, sat_relevance, sat_productivity, sat_sustainability, sat_communication";

export const GERBANG: Record<string, { label: string; warna: string; jelas: string }> = {
  menunggu: {
    label: "Menunggu evaluasi",
    warna: "var(--text-muted)",
    jelas:
      "Proposal perpanjangan belum bisa dibuat. Kedua evaluasi harus masuk lebih dahulu.",
  },
  // "Gerbang Terbuka" renamed to "Proses Pembaruan" (Revisi V8 §15); the
  // internal key stays `terbuka` — it is what "the process is actually
  // running" still means, now reached only after Admin starts it (§16).
  siap: {
    label: "Siap Memulai Pembaruan",
    warna: "var(--status-active)",
    jelas:
      "PETRA dan mitra melanjutkan (atau KUI memutuskan lanjut). Admin dapat memulai Proses Pembaruan.",
  },
  terbuka: {
    label: "Proses Pembaruan",
    warna: "var(--status-active)",
    jelas:
      "Proses pembaruan telah dimulai. Unit pengusul mengunggah dokumen perpanjangan.",
  },
  terminate: {
    label: "Tidak dilanjutkan",
    warna: "var(--status-archived)",
    jelas:
      "Tidak dilanjutkan. Dokumen berjalan sampai tanggal berakhir, lalu diarsipkan sebagai tidak diperbarui. KUI masih dapat meng-override.",
  },
  split: {
    label: "Evaluasi berbeda",
    warna: "var(--action-danger)",
    jelas:
      "PETRA dan mitra tidak sepakat. Setelah diskusi, KUI meng-override (lanjut/hentikan, dengan alasan tercatat) atau mengarsipkan dokumen.",
  },
};

/**
 * Renewal-request age on the 30/60/90 CALENDAR-day scale (PRD §13.1) — never
 * the 2/4 business-day approval scale; a renewal request is a task, not a gate
 * (BR-24, BR-32).
 */
function BenderaPembaruan({ hari }: { hari: number | null }) {
  if (hari === null) return null;
  const warna =
    hari > 90 ? "var(--sla-red)" : hari > 60 ? "var(--sla-yellow-text)" : "var(--text-secondary)";
  return (
    <span className="text-xs font-medium" style={{ color: warna }}>
      {hari > 60 ? "▲ " : ""}
      {hari} hari sejak diminta
    </span>
  );
}

function RingkasEvaluasi({ e }: { e: any }) {
  return (
    <div className="text-sm">
      <p className="mb-2" style={{ color: "var(--text-secondary)" }}>
        {e.respondent_nama ?? "—"}
        {e.respondent_jabatan ? ` · ${e.respondent_jabatan}` : ""}
        {e.respondent_email ? ` · ${e.respondent_email}` : ""}
        {e.respondent_hp ? ` · ${e.respondent_hp}` : ""} ·{" "}
        {e.waktu_evaluasi
          ? new Date(e.waktu_evaluasi).toLocaleDateString("id-ID", { dateStyle: "medium" })
          : "—"}{" "}
        · {e.form_revision}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: "var(--text-secondary)" }}>
              <th className="py-1 text-left font-medium">Aspek</th>
              <th className="px-2 py-1 text-center font-medium">Harapan</th>
              <th className="px-2 py-1 text-center font-medium">Kepuasan</th>
              <th className="px-2 py-1 text-center font-medium">Selisih</th>
            </tr>
          </thead>
          <tbody>
            {DIMENSI.map((d) => {
              const h = e[`exp_${d.kunci}`];
              const k = e[`sat_${d.kunci}`];
              const gap = h != null && k != null ? k - h : null;
              return (
                <tr key={d.kunci} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1">{d.id}</td>
                  <td className="px-2 py-1 text-center">{h ?? "—"}</td>
                  <td className="px-2 py-1 text-center">{k ?? "—"}</td>
                  {/* Satisfaction below expectation is the finding worth seeing,
                      so the sign is what carries the colour (Design §2.1). */}
                  <td
                    className="px-2 py-1 text-center font-medium"
                    style={{
                      color:
                        gap === null
                          ? "var(--text-muted)"
                          : gap < 0
                            ? "#ec008c"
                            : "var(--status-approved)",
                    }}
                  >
                    {gap === null ? "—" : gap > 0 ? `+${gap}` : gap}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2">
        <strong>
          {e.rekomendasi === "continue" ? "Rekomendasi: lanjutkan" : "Rekomendasi: akhiri"}
        </strong>
        {e.continuation_mode
          ? ` · ${e.continuation_mode === "same_program" ? "program yang sama" : "menambah program"}`
          : ""}
      </p>
      {e.catatan_evaluasi ? (
        <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
          {e.catatan_evaluasi}
        </p>
      ) : null}
    </div>
  );
}

const kartu = "mb-6 rounded-xl border bg-white p-4";

// Module scope on purpose: an inline "use server" action may only close over
// serializable values. A local helper captured by the actions below made every
// submit on this tab throw before it reached the database.
function cek(halaman: string, hasil: Hasil) {
  if (!hasil.ok) redirect(`${halaman}&galat=${encodeURIComponent(hasil.pesan)}` as any);
}

export async function PembaruanPanel({
  noDokumen,
  idProposal,
  io,
  idJabatan,
  galat,
}: {
  noDokumen: number;
  io: boolean;
  idJabatan: number | null;
  galat?: string;
  idProposal: number;
}) {
  const supabase = await supabaseServer();

  const { data: r } = await supabase
    .from("v_pembaruan")
    .select("*")
    .eq("no_dokumen_kerjasama", noDokumen)
    .maybeSingle();

  // Not yet requested: IO can send it from here too, not only from the list.
  if (!r) {
    // A refused renewal request used to leave this card saying "Belum ada
    // permintaan pembaruan" with no explanation anywhere.
    async function minta(formData: FormData) {
      "use server";
      const halamanMinta = `/kerja-sama/${idProposal}/laporan?tab=pembaruan`;
      const tujuan = bacaTujuanEvaluasi(formData);
      if ("galat" in tujuan) return cek(halamanMinta, { ok: false, pesan: tujuan.galat });
      cek(
        halamanMinta,
        await kirimPermintaanPembaruan(
          noDokumen,
          String(formData.get("pesan") ?? ""),
          tujuan.jabatan,
        ),
      );
    }
    const opsiJabatan = io ? await opsiJabatanEvaluasi(supabase) : [];
    return (
      <section className={kartu} style={{ borderColor: "var(--border)" }}>
        <h2 className="mb-1 text-sm font-semibold">Pembaruan</h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Belum ada permintaan pembaruan untuk dokumen ini.
        </p>
        {galat ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--action-danger)", color: "var(--action-danger)" }}
          >
            {galat}
          </p>
        ) : null}
        {io ? (
          <form action={minta} className="mt-3 space-y-3">
            <TujuanEvaluasi opsi={opsiJabatan} />
            <div className="flex flex-wrap gap-2">
              <input
                name="pesan"
                placeholder="Pesan untuk unit tujuan…"
                className="min-w-[14rem] flex-1 rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border)" }}
              />
              <SubmitButton
                labelMenunggu="Mengirim…"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ background: "var(--renewal-request)" }}
              >
                Kirim Disposisi Evaluasi
              </SubmitButton>
            </div>
          </form>
        ) : null}
      </section>
    );
  }

  // The files §8.1 hands to the unit: the signed PDF and the last revision
  // from disposition (catat_revisi keeps file_draft current).
  const [{ data: evaluasi }, { data: berkas }, h] = await Promise.all([
    supabase
      .from("evaluasi")
      .select(KOLOM_EVAL)
      .eq("id_dokumen_kerjasama", noDokumen)
      .order("no"),
    supabase
      .from("dokumen_kerja_sama")
      .select("upload_dokumen, proposal_dokumen ( file_draft )")
      .eq("no", noDokumen)
      .maybeSingle(),
    headers(),
  ]);

  const hidup = (evaluasi ?? []).filter((e: any) => e.status !== "superseded");
  // One PETRA answer per lingkup head (Revisi V7 §5).
  const fakultas: any[] = hidup.filter((e: any) => e.respondent_type === "faculty");
  const mitra: any = hidup.find((e: any) => e.respondent_type === "partner");
  const lampau = (evaluasi ?? []).filter((e: any) => e.status === "superseded");

  const g = GERBANG[r.gerbang] ?? GERBANG.menunggu;

  // The partner's link, as the unit will actually paste it into an email.
  const asal =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost:3000"}`;
  const tautanMitra = r.token_partner ? `${asal}/evaluasi/${r.token_partner}` : null;

  const pathBerkas = [
    { label: "Dokumen bertanda tangan", path: (berkas as any)?.upload_dokumen },
    { label: "Revisi terakhir dari disposisi", path: (berkas as any)?.proposal_dokumen?.file_draft },
  ].filter((b): b is { label: string; path: string } => Boolean(b.path));
  const { data: berkasSigned } = pathBerkas.length
    ? await supabase.storage
        .from("dokumen-kerjasama")
        .createSignedUrls(pathBerkas.map((b) => b.path), 3600)
    : { data: [] };

  // A refused action comes back to this tab with the database's own reason.
  const halaman = `/kerja-sama/${r.id_proposal}/laporan?tab=pembaruan`;
  async function isiEvaluasiFakultas(formData: FormData) {
    "use server";
    cek(halaman, await kirimEvaluasiFakultas(Number(formData.get("no_evaluasi")), bacaJawaban(formData)));
  }

  async function putuskan(formData: FormData) {
    "use server";
    cek(
      halaman,
      await putuskanPembaruan(
        noDokumen,
        formData.get("keputusan") as "continue" | "terminate",
        String(formData.get("alasan") ?? ""),
      ),
    );
  }

  async function arsipkan() {
    "use server";
    cek(halaman, await arsipkanDokumen(noDokumen, "not_renewed", r.id_proposal));
  }

  async function buatTautan() {
    "use server";
    cek(halaman, await buatTautanEvaluasiMitra(noDokumen));
  }

  async function bukaUlang(formData: FormData) {
    "use server";
    cek(halaman, await bukaUlangEvaluasi(Number(formData.get("no_evaluasi"))));
  }

  async function mulaiPembaruan() {
    "use server";
    cek(halaman, await mulaiProsesPembaruan(noDokumen));
  }

  async function unggahDokumen(formData: FormData) {
    "use server";
    const file = formData.get("berkas") as File | null;
    if (!file || file.size === 0) return cek(halaman, { ok: false, pesan: "Pilih dokumen perpanjangan." });
    const unggah = await unggahBerkas(await supabaseServer(), `perpanjangan/${r.id_proposal}`, file);
    if ("pesan" in unggah) return cek(halaman, { ok: false, pesan: unggah.pesan });
    cek(halaman, await buatProposalPerpanjangan(noDokumen, unggah.path));
  }

  return (
    <div>
      {/* The gate, and why it says what it says. */}
      <section className="mb-6 rounded-xl border-2 p-4" style={{ borderColor: g.warna }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold" style={{ color: g.warna }}>
            {g.label}
          </h2>
          <BenderaPembaruan hari={r.usia_permintaan_hari} />
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {g.jelas}
        </p>
      </section>

      {galat ? (
        <p
          role="alert"
          className="mb-6 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--action-danger)", color: "var(--action-danger)" }}
        >
          {galat}
        </p>
      ) : null}

      {/* Split review: the two grids adjacent, so the disagreement is legible
          (Design §5.11). */}
      {r.gerbang !== "menunggu" && io && !r.id_proposal_penerus ? (
        <section
          className={kartu}
          style={{ borderColor: r.gerbang === "split" ? "var(--action-danger)" : "var(--border)" }}
        >
          <h2 className="mb-1 text-sm font-semibold">
            {r.gerbang === "split" ? "Tinjau keputusan berbeda" : "Override keputusan evaluasi"}
          </h2>
          <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
            Keputusan KUI menggantikan hasil evaluasi di bawah. Membuka ulang evaluasi
            membatalkan keputusan ini.
          </p>

          <form action={putuskan} className="mt-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Alasan keputusan (wajib)</span>
              <textarea
                name="alasan"
                required
                rows={2}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
                placeholder="Mengapa kerja sama ini dilanjutkan atau dihentikan?"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <SubmitButton
                labelMenunggu="Menyimpan…"
                name="keputusan"
                value="continue"
                className="rounded-lg px-3 py-2 text-sm font-medium text-white"
                style={{ background: "var(--status-active)" }}
              >
                Lanjutkan
              </SubmitButton>
              <SubmitButton
                labelMenunggu="Menyimpan…"
                name="keputusan"
                value="terminate"
                className="rounded-lg px-3 py-2 text-sm font-medium text-white"
                style={{ background: "var(--action-danger)" }}
              >
                Hentikan
              </SubmitButton>
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Keputusan ini tercatat bersama alasannya dan tidak dapat dihapus.
            </p>
          </form>

          {r.gerbang === "split" ? (
            <form action={arsipkan} className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <SubmitButton
                labelMenunggu="Mengarsipkan…"
                className="rounded-lg border px-3 py-2 text-sm font-medium"
                style={{ borderColor: "var(--action-danger)", color: "var(--action-danger)" }}
              >
                Arsipkan
              </SubmitButton>
              <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                Tidak dilanjutkan — dokumen langsung diarsipkan.
              </span>
            </form>
          ) : null}
        </section>
      ) : null}

      {/* PETRA side: one answer per lingkup head (Revisi V7 §5). Only the
          head a row is addressed to fills it in. */}
      <section className={kartu} style={{ borderColor: "var(--border)" }}>
        <h2 className="mb-3 text-sm font-semibold">Evaluasi PETRA</h2>
        {fakultas.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Belum ada evaluasi PETRA untuk dokumen ini.
          </p>
        ) : (
          <ul className="space-y-5">
            {fakultas.map((fak: any) => (
              <li key={fak.no}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    {fak.jabatan?.nama ?? "Unit pemilik"}
                    <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                      {fak.status === "submitted" ? "sudah mengisi" : "menunggu"}
                    </span>
                  </h3>
                  {fak.status === "submitted" && io ? (
                    <form action={bukaUlang}>
                      <input type="hidden" name="no_evaluasi" value={fak.no} />
                      <SubmitButton labelMenunggu="Memproses…" className="text-xs underline">
                        Buka ulang
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>

                {fak.status === "submitted" ? (
                  <RingkasEvaluasi e={fak} />
                ) : fak.id_jabatan_pengusul === idJabatan || (!fak.id_jabatan_pengusul && !io) ? (
                  <form action={isiEvaluasiFakultas}>
                    <input type="hidden" name="no_evaluasi" value={fak.no} />
                    <GridLikert
                      awalan="exp"
                      judul="1. Harapan unit"
                      keterangan="Seberapa tinggi harapan unit terhadap kerja sama ini pada tiap aspek?"
                    />
                    <GridLikert
                      awalan="sat"
                      judul="2. Kepuasan unit"
                      keterangan="Seberapa puas unit dengan pelaksanaannya pada tiap aspek?"
                    />
                    <BlokRekomendasi />
                    <SubmitButton
                      labelMenunggu="Mengirim…"
                      className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                      style={{ background: "var(--midnight)" }}
                    >
                      Kirim Evaluasi PETRA
                    </SubmitButton>
                    <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      Setelah dikirim, jawaban terkunci. KUI dapat membukanya kembali bila perlu.
                    </p>
                  </form>
                ) : (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Menunggu jawaban dari {fak.jabatan?.nama ?? "unit pemilik"}.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Partner side */}
      <section className={kartu} style={{ borderColor: "var(--border)" }}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Evaluasi Mitra</h2>
          {mitra?.status === "submitted" && io ? (
            <form action={bukaUlang}>
              <input type="hidden" name="no_evaluasi" value={mitra.no} />
              <SubmitButton labelMenunggu="Memproses…" className="text-xs underline">
                Buka ulang & terbitkan tautan baru
              </SubmitButton>
            </form>
          ) : null}
        </div>

        {mitra?.status === "submitted" ? (
          <RingkasEvaluasi e={mitra} />
        ) : !mitra ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Belum ada evaluasi mitra untuk dokumen ini.
          </p>
        ) : !io ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Menunggu jawaban mitra. Tautan evaluasi mitra dikirim oleh KUI.
          </p>
        ) : (
          <>
            {tautanMitra ? (
              <>
                <p className="mb-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                  Kirim tautan ini ke narahubung mitra. Mitra tidak perlu akun; cukup
                  buka tautan, isi identitas dan formulir, lalu kirim. Tautan berlaku
                  sampai diisi, lalu tertutup.
                </p>
                {/* Selectable text, not a link to click: opening it is not
                    harmful, but KUI needs to copy it into an email. */}
                <input
                  readOnly
                  defaultValue={tautanMitra}
                  className="w-full rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: "var(--border)", background: "var(--surface-sunk)" }}
                />
              </>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Tautan evaluasi mitra belum diaktifkan.
              </p>
            )}
            <form action={buatTautan} className="mt-3 flex flex-wrap items-center gap-2">
              <SubmitButton
                labelMenunggu="Memproses…"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ background: "var(--midnight)" }}
              >
                {tautanMitra ? "Buat ulang tautan" : "Aktifkan & buat tautan"}
              </SubmitButton>
              {tautanMitra ? (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Tautan lama tidak berlaku lagi setelah dibuat ulang.
                </span>
              ) : null}
            </form>
          </>
        )}
      </section>

      {/* Both evaluations agree, but the process has not started (V8 §16) —
          Admin previews the files that will go to the unit pengusul, then
          starts it explicitly. */}
      {r.gerbang === "siap" && io && !r.id_proposal_penerus ? (
        <section className={`${kartu} border-2`} style={{ borderColor: "var(--status-active)" }}>
          <h2 className="mb-2 text-sm font-semibold">Mulai Proses Pembaruan</h2>
          <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            PETRA dan mitra melanjutkan. Memulai akan mengirim berkas berikut ke
            notifikasi dan Antrean Saya unit pengusul sebagai tanda mulainya
            Pembaruan.
          </p>
          {berkasSigned?.length ? (
            <ul className="mb-3 space-y-1 text-sm">
              {pathBerkas.map((b, i) =>
                berkasSigned[i]?.signedUrl ? (
                  <li key={b.path}>
                    <a href={berkasSigned[i].signedUrl} className="underline" target="_blank" rel="noreferrer">
                      {b.label}
                    </a>
                  </li>
                ) : null,
              )}
            </ul>
          ) : null}
          <form action={mulaiPembaruan}>
            <SubmitButton
              labelMenunggu="Memulai…"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ background: "var(--midnight)" }}
            >
              Mulai Proses Pembaruan
            </SubmitButton>
          </form>
        </section>
      ) : null}

      {/* Renewal draft — only once the gate actually permits it. The control is
          absent rather than disabled, and the banner above says why. */}
      {r.gerbang === "terbuka" && !r.id_proposal_penerus ? (
        <section className={`${kartu} border-2`} style={{ borderColor: "var(--status-active)" }}>
          <h2 className="mb-2 text-sm font-semibold">Unggah Dokumen Perpanjangan</h2>
          <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            Proposal baru akan dibuat sebagai Perpanjangan dan tertaut ke dokumen
            ini. Data mitra, agenda, bidang dan lingkup disalin dari dokumen
            sebelumnya; hanya approval yang diulang.
          </p>
          {berkasSigned?.length ? (
            <ul className="mb-3 space-y-1 text-sm">
              {pathBerkas.map((b, i) =>
                berkasSigned[i]?.signedUrl ? (
                  <li key={b.path}>
                    <a href={berkasSigned[i].signedUrl} className="underline" target="_blank" rel="noreferrer">
                      {b.label}
                    </a>
                  </li>
                ) : null,
              )}
            </ul>
          ) : null}
          <form action={unggahDokumen} className="flex flex-wrap items-center gap-2">
            <input type="file" name="berkas" accept={TERIMA_PDF_WORD} required className="text-sm" />
            <SubmitButton
              labelMenunggu="Memproses…"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ background: "var(--midnight)" }}
            >
              Buat Proposal Perpanjangan
            </SubmitButton>
          </form>
        </section>
      ) : null}

      {r.id_proposal_penerus ? (
        <p className="mb-6 text-sm">
          Proposal perpanjangan sudah dibuat:{" "}
          <Link href={`/kerja-sama/${r.id_proposal_penerus}/laporan` as any} className="underline">
            buka proposal
          </Link>
        </p>
      ) : null}

      {/* A reopened evaluation leaves its predecessor intact; this is where the
          old answer stays readable (DR-08). */}
      {lampau.length > 0 ? (
        <section className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-3 text-sm font-semibold">Jawaban yang digantikan</h2>
          <ul className="space-y-4">
            {lampau.map((e: any) => (
              <li key={e.no}>
                <p className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {e.respondent_type === "faculty" ? "Fakultas" : "Mitra"} · digantikan
                </p>
                <RingkasEvaluasi e={e} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
