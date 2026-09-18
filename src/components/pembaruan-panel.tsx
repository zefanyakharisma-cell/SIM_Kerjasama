import Link from "next/link";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import {
  BlokRekomendasi,
  DIMENSI,
  GridLikert,
  bacaJawaban,
} from "@/components/likert";
import {
  bukaUlangEvaluasi,
  buatProposalPerpanjangan,
  kirimEvaluasiFakultas,
  kirimPermintaanPembaruan,
  putuskanPembaruan,
} from "@/lib/actions/pembaruan";

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
  "no, respondent_type, status, rekomendasi, continuation_mode, catatan_evaluasi, " +
  "respondent_nama, respondent_email, waktu_evaluasi, form_revision, id_supersedes, " +
  "exp_quality, exp_relevance, exp_productivity, exp_sustainability, exp_communication, " +
  "sat_quality, sat_relevance, sat_productivity, sat_sustainability, sat_communication";

export const GERBANG: Record<string, { label: string; warna: string; jelas: string }> = {
  menunggu: {
    label: "Menunggu evaluasi",
    warna: "var(--text-muted)",
    jelas:
      "Proposal perpanjangan belum bisa dibuat. Kedua evaluasi harus masuk lebih dahulu.",
  },
  terbuka: {
    label: "Gerbang terbuka",
    warna: "var(--status-active)",
    jelas:
      "Kedua pihak merekomendasikan lanjut. Unit pemilik dapat mengunggah draf perpanjangan.",
  },
  terminate: {
    label: "Tidak dilanjutkan",
    warna: "var(--status-archived)",
    jelas:
      "Kedua pihak merekomendasikan berhenti. Dokumen berjalan sampai tanggal berakhir, lalu diarsipkan sebagai kedaluwarsa tanpa pembaruan.",
  },
  split: {
    label: "Evaluasi berbeda",
    warna: "var(--action-danger)",
    jelas:
      "Fakultas dan mitra tidak sepakat. Tidak ada yang berjalan otomatis: KUI harus memilih lanjut atau hentikan, dengan alasan yang tercatat.",
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
        {e.respondent_email ? ` · ${e.respondent_email}` : ""} ·{" "}
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

export async function PembaruanPanel({ noDokumen, io }: { noDokumen: number; io: boolean }) {
  const supabase = await supabaseServer();

  const { data: r } = await supabase
    .from("v_pembaruan")
    .select("*")
    .eq("no_dokumen_kerjasama", noDokumen)
    .maybeSingle();

  // Not yet requested: IO can send it from here too, not only from the list.
  if (!r) {
    async function minta(formData: FormData) {
      "use server";
      await kirimPermintaanPembaruan(noDokumen, String(formData.get("pesan") ?? ""));
    }
    return (
      <section className={kartu} style={{ borderColor: "var(--border)" }}>
        <h2 className="mb-1 text-sm font-semibold">Pembaruan</h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Belum ada permintaan pembaruan untuk dokumen ini.
        </p>
        {io ? (
          <form action={minta} className="mt-3 flex flex-wrap gap-2">
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
              Kirim Disposisi Evaluasi
            </SubmitButton>
          </form>
        ) : null}
      </section>
    );
  }

  const { data: evaluasi } = await supabase
    .from("evaluasi")
    .select(KOLOM_EVAL)
    .eq("id_dokumen_kerjasama", noDokumen)
    .order("no");

  const hidup = (evaluasi ?? []).filter((e: any) => e.status !== "superseded");
  const fak: any = hidup.find((e: any) => e.respondent_type === "faculty");
  const mitra: any = hidup.find((e: any) => e.respondent_type === "partner");
  const lampau = (evaluasi ?? []).filter((e: any) => e.status === "superseded");

  const g = GERBANG[r.gerbang] ?? GERBANG.menunggu;

  // The partner's link, as the unit will actually paste it into an email.
  const h = await headers();
  const asal =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost:3000"}`;
  const tautanMitra = r.token_partner ? `${asal}/evaluasi/${r.token_partner}` : null;

  async function isiEvaluasiFakultas(formData: FormData) {
    "use server";
    await kirimEvaluasiFakultas(Number(formData.get("no_evaluasi")), bacaJawaban(formData));
  }

  async function putuskan(formData: FormData) {
    "use server";
    await putuskanPembaruan(
      noDokumen,
      formData.get("keputusan") as "continue" | "terminate",
      String(formData.get("alasan") ?? ""),
    );
  }

  async function bukaUlang(formData: FormData) {
    "use server";
    await bukaUlangEvaluasi(Number(formData.get("no_evaluasi")));
  }

  async function unggahDraf(formData: FormData) {
    "use server";
    await buatProposalPerpanjangan(noDokumen, String(formData.get("file") ?? "") || null);
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

      {/* Split review: the two grids adjacent, so the disagreement is legible
          (Design §5.11). */}
      {r.gerbang === "split" && io ? (
        <section className={kartu} style={{ borderColor: "var(--action-danger)" }}>
          <h2 className="mb-3 text-sm font-semibold">Tinjau keputusan berbeda</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-1 text-xs font-semibold">Fakultas</h3>
              {fak ? <RingkasEvaluasi e={fak} /> : null}
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold">Mitra</h3>
              {mitra ? <RingkasEvaluasi e={mitra} /> : null}
            </div>
          </div>

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
        </section>
      ) : null}

      {/* Faculty side */}
      <section className={kartu} style={{ borderColor: "var(--border)" }}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Evaluasi Fakultas</h2>
          {fak?.status === "submitted" && io ? (
            <form action={bukaUlang}>
              <input type="hidden" name="no_evaluasi" value={fak.no} />
              <SubmitButton labelMenunggu="Memproses…" className="text-xs underline">
                Buka ulang
              </SubmitButton>
            </form>
          ) : null}
        </div>

        {fak?.status === "submitted" ? (
          <RingkasEvaluasi e={fak} />
        ) : fak ? (
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
              Kirim Evaluasi Fakultas
            </SubmitButton>
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Setelah dikirim, jawaban terkunci. KUI dapat membukanya kembali bila perlu.
            </p>
          </form>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Belum ada evaluasi fakultas untuk dokumen ini.
          </p>
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
        ) : tautanMitra ? (
          <>
            <p className="mb-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              Kirim tautan ini ke narahubung mitra. Mitra tidak perlu akun; tautan
              berlaku sampai diisi, lalu tertutup.
            </p>
            {/* Selectable text, not a link to click: the unit needs to copy it
                into an email, not open it themselves — opening it is how a
                token gets spent by accident. */}
            <input
              readOnly
              defaultValue={tautanMitra}
              className="w-full rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface-sunk)" }}
            />
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Belum ada tautan evaluasi mitra yang aktif.
          </p>
        )}
      </section>

      {/* Renewal draft — only once the gate actually permits it. The control is
          absent rather than disabled, and the banner above says why. */}
      {r.gerbang === "terbuka" && !r.id_proposal_penerus ? (
        <section className={`${kartu} border-2`} style={{ borderColor: "var(--status-active)" }}>
          <h2 className="mb-2 text-sm font-semibold">Unggah Draf Perpanjangan</h2>
          <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            Proposal baru akan dibuat sebagai Perpanjangan dan tertaut ke dokumen
            ini. Data mitra, agenda, bidang dan lingkup disalin dari dokumen
            sebelumnya; hanya approval yang diulang.
          </p>
          <form action={unggahDraf} className="flex flex-wrap gap-2">
            <input
              name="file"
              placeholder="Nama berkas draf"
              className="min-w-[14rem] flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
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
