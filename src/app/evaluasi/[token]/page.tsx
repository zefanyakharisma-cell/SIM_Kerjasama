import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { BlokRekomendasi, GridLikert, bacaJawaban } from "@/components/likert";
import { SubmitButton } from "@/components/submit-button";

/**
 * The partner evaluation page — the only unauthenticated surface in the system
 * (PRD §9.3, Design §5.10, Architecture §9).
 *
 * Priorities in order: clarity, trust, low friction.
 *
 * **Trust is a functional requirement here.** A partner receives a bare link by
 * email and has to decide in about two seconds whether it is genuinely from
 * Petra or a phishing attempt. That is why the header carries the full
 * university wordmark on brand Midnight (PRD §16.5) and why the first thing
 * below it is the partner's own institution, named back to them — a phisher
 * would not know which partnership this is about.
 *
 * The token is the credential and it never leaves the server: it resolves
 * through a Postgres function scoped to exactly one evaluation, which exposes
 * the prefilled header and the answer fields and nothing else — no document
 * internals, no lists, no other partner (AR-07).
 *
 * Bilingual and mobile-first, because this form more than any other is filled
 * on a phone, in another country, by someone who may not read Indonesian.
 */
export const dynamic = "force-dynamic";

function Kop() {
  return (
    <header className="px-5 py-6 text-white" style={{ background: "var(--midnight)" }}>
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        {/* The official logo file replaces this mark once MRD supplies the
            approved asset (open item O3); the wordmark beside it is the part
            that carries the trust signal. */}
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white text-lg font-semibold"
        >
          P
        </span>
        <span>
          <span className="block text-sm font-semibold uppercase tracking-wide">
            Petra Christian University
          </span>
          <span className="block text-xs opacity-80">
            Kantor Kerja Sama dan Urusan Internasional · International Office
          </span>
        </span>
      </div>
    </header>
  );
}

function Bingkai({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--surface-sunk)" }}>
      <Kop />
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      <footer
        className="mx-auto max-w-2xl px-4 pb-10 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Pertanyaan? Hubungi Kantor Kerja Sama dan Urusan Internasional di
        io@petra.ac.id · Questions? Contact the International Office.
      </footer>
    </div>
  );
}

function Pesan({ judul, isi }: { judul: string; isi: string }) {
  return (
    <div
      className="rounded-xl border bg-white p-6"
      style={{ borderColor: "var(--border)" }}
    >
      <h1 className="text-base font-semibold" style={{ color: "var(--midnight)" }}>
        {judul}
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        {isi}
      </p>
    </div>
  );
}

const KUNCI_DRAF = "simks-eval-draf";

/**
 * Hold a refused submission so the form can be shown filled in again.
 *
 * It is the respondent's own answers, kept in their own browser: httpOnly, and
 * scoped to this token's path so it cannot be read from any other page. It is
 * deliberately short-lived — this is a recovery aid for the seconds between a
 * refusal and the retry, not storage.
 */
async function simpanDraf(token: string, jawaban: Record<string, unknown>) {
  // The validation message is ours, not an answer — it is regenerated on the
  // next submit and must not come back as if it were typed.
  const bersih: Record<string, unknown> = { ...jawaban };
  delete bersih.galat;
  (await cookies()).set(KUNCI_DRAF, JSON.stringify({ token, jawaban: bersih }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/evaluasi/${token}`,
    maxAge: 900,
  });
}

/** The stashed answers, but only while an error is actually being shown. */
async function bacaDraf(
  token: string,
  adaGalat: boolean,
): Promise<Record<string, unknown> | undefined> {
  if (!adaGalat) return undefined;
  const mentah = (await cookies()).get(KUNCI_DRAF)?.value;
  if (!mentah) return undefined;
  try {
    const isi = JSON.parse(mentah) as { token?: string; jawaban?: Record<string, unknown> };
    // Belt and braces on top of the path scope: never prefill another token.
    return isi.token === token ? isi.jawaban : undefined;
  } catch {
    return undefined;
  }
}

export default async function EvaluasiMitra({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; galat?: string }>;
}) {
  const { token } = await params;
  const { ok, galat } = await searchParams;
  const supabase = await supabaseServer();

  // A refused submission used to come back as a completely blank form: ten
  // Likert radios, the recommendation, the note and the four identity fields,
  // all gone. This is the one public, unauthenticated, single-use surface in
  // the system, so a partner who loses their answers has no way back — they
  // start over or give up. The action stashes what was posted in a short-lived
  // cookie scoped to this token's path; it is read back only when we are
  // actually showing an error, so a stale one never prefills a fresh visit.
  const draf = await bacaDraf(token, Boolean(galat));

  // Resolved server-side. An unknown or spent token returns nothing at all —
  // not a hint, not a different message (AR-07).
  const { data } = await supabase.rpc("resolusi_token_evaluasi", { p_token: token });
  const ev = data as Record<string, any> | null;

  if (ok) {
    return (
      <Bingkai>
        <Pesan
          judul="Terima kasih · Thank you"
          isi="Evaluasi Anda sudah kami terima. Tautan ini kini tidak berlaku lagi. · Your evaluation has been received. This link is now closed."
        />
      </Bingkai>
    );
  }

  if (!ev) {
    // Covers three cases with one message on purpose: an unknown token, an
    // already-submitted one, and a revoked one. Distinguishing them would tell
    // someone guessing tokens which guesses were close.
    return (
      <Bingkai>
        <Pesan
          judul="Tautan tidak berlaku · Link not valid"
          isi="Tautan evaluasi ini sudah terisi atau tidak dikenali. Bila Anda perlu mengubah jawaban, hubungi Kantor Kerja Sama dan Urusan Internasional — tautan baru dapat diterbitkan. · This evaluation link has already been used or is not recognised. If you need to change your answer, contact the International Office and a new link can be issued."
        />
      </Bingkai>
    );
  }

  async function kirim(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const jawaban = bacaJawaban(formData);
    // An incomplete grid is our own validation, so it is named exactly.
    if (typeof jawaban.galat === "string") {
      await simpanDraf(token, jawaban);
      redirect(`/evaluasi/${token}?galat=${encodeURIComponent(jawaban.galat)}`);
    }
    const { error } = await klien.rpc("kirim_evaluasi_partner", {
      p_token: token,
      p_jawaban: jawaban,
    });
    if (error) {
      // The database message names an internal rule or column and this page is
      // public and unauthenticated (AR-07) — it is logged, never shown.
      console.error("[simks] evaluasi mitra ditolak:", error.message);
      await simpanDraf(token, jawaban);
      redirect(
        `/evaluasi/${token}?galat=${encodeURIComponent(
          "Jawaban tidak dapat disimpan. Silakan periksa kembali isian Anda atau hubungi Kantor Kerja Sama dan Urusan Internasional.",
        )}`,
      );
    }
    redirect(`/evaluasi/${token}?ok=1`);
  }

  return (
    <Bingkai>
      <h1 className="mb-1 text-lg font-semibold" style={{ color: "var(--midnight)" }}>
        Evaluasi Kerja Sama · Partnership Evaluation
      </h1>
      <p className="mb-5 text-sm" style={{ color: "var(--text-secondary)" }}>
        Sebelum kerja sama ini diperbarui, kami ingin mendengar penilaian Anda.
        Pengisian memakan waktu sekitar lima menit. · Before this partnership is
        renewed, we would like your assessment. It takes about five minutes.
      </p>

      {galat ? (
        <p
          className="mb-4 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--action-danger)", color: "var(--action-danger)" }}
        >
          Pengiriman gagal, silakan coba lagi. · Submission failed, please try again.
          <span className="mt-1 block text-xs">{galat}</span>
        </p>
      ) : null}

      {/* Section 1, read-only and prefilled. The partner seeing their own
          institution named is what confirms the link is about them. */}
      <section
        className="mb-5 rounded-xl border bg-white p-4"
        style={{ borderColor: "var(--border)" }}
      >
        <h2 className="mb-3 text-sm font-semibold">
          Kerja sama yang dievaluasi · The partnership
        </h2>
        <dl className="space-y-1.5 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt style={{ color: "var(--text-secondary)" }}>Mitra · Partner</dt>
            <dd className="font-medium">{ev.nama_mitra ?? "—"}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt style={{ color: "var(--text-secondary)" }}>Negara · Country</dt>
            <dd>{ev.negara ?? "—"}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt style={{ color: "var(--text-secondary)" }}>Dokumen · Document</dt>
            <dd className="no-dokumen">
              {ev.jenis} {ev.no_dokumen ?? ""}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt style={{ color: "var(--text-secondary)" }}>Periode · Period</dt>
            <dd>
              {ev.tanggal_mulai ?? "—"} — {ev.tanggal_berakhir ?? "—"}
            </dd>
          </div>
        </dl>
      </section>

      <form action={kirim}>
        <GridLikert
          awal={draf}
          awalan="exp"
          judul="1. Harapan Anda · Your expectations"
          keterangan="Seberapa tinggi harapan Anda terhadap kerja sama ini pada tiap aspek? · How high were your expectations for this partnership in each area?"
          dwibahasa
        />
        <GridLikert
          awal={draf}
          awalan="sat"
          judul="2. Kepuasan Anda · Your satisfaction"
          keterangan="Seberapa puas Anda dengan pelaksanaannya pada tiap aspek? · How satisfied are you with how it was carried out?"
          dwibahasa
        />
        <BlokRekomendasi dwibahasa awal={draf} />

        {/* Name, position, email and phone are the accountability record for
            a form with no login, so they are required — and the database
            requires them too, not only this markup (PRD §9.3). */}
        <fieldset
          className="mb-5 rounded-xl border bg-white p-4"
          style={{ borderColor: "var(--border)" }}
        >
          <legend className="px-1 text-sm font-semibold">
            Identitas responden · About you
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nama · Name (*)</span>
              <input
                name="respondent_nama"
                required
                defaultValue={String(draf?.respondent_nama ?? ev.nama_kontak ?? "")}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Jabatan · Position (*)</span>
              <input
                name="respondent_jabatan"
                required
                defaultValue={String(draf?.respondent_jabatan ?? ev.jabatan_kontak ?? "")}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Email (*)</span>
              <input
                name="respondent_email"
                type="email"
                required
                defaultValue={String(draf?.respondent_email ?? ev.email_kontak ?? "")}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">No. HP · Phone (*)</span>
              <input
                name="respondent_hp"
                type="tel"
                required
                defaultValue={String(draf?.respondent_hp ?? ev.hp_kontak ?? "")}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              />
            </label>
          </div>
        </fieldset>

        <SubmitButton
          labelMenunggu="Mengirim… · Submitting…"
          className="w-full rounded-lg px-4 py-3 text-sm font-medium text-white"
          style={{ background: "var(--midnight)" }}
        >
          Kirim Evaluasi · Submit Evaluation
        </SubmitButton>
        <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          Setelah dikirim, tautan ini akan tertutup. · Once submitted, this link
          closes. Formulir {ev.form_revision}.
        </p>
      </form>
    </Bingkai>
  );
}
