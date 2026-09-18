import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { BlokRekomendasi, GridLikert, bacaJawaban } from "@/components/likert";

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
    const { error } = await klien.rpc("kirim_evaluasi_partner", {
      p_token: token,
      p_jawaban: bacaJawaban(formData),
    });
    if (error) {
      console.error("[simks] evaluasi mitra ditolak:", error.message);
      redirect(`/evaluasi/${token}?galat=1`);
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
          awalan="exp"
          judul="1. Harapan Anda · Your expectations"
          keterangan="Seberapa tinggi harapan Anda terhadap kerja sama ini pada tiap aspek? · How high were your expectations for this partnership in each area?"
          dwibahasa
        />
        <GridLikert
          awalan="sat"
          judul="2. Kepuasan Anda · Your satisfaction"
          keterangan="Seberapa puas Anda dengan pelaksanaannya pada tiap aspek? · How satisfied are you with how it was carried out?"
          dwibahasa
        />
        <BlokRekomendasi dwibahasa />

        {/* Name and email are the accountability record for a form with no
            login, so they are required — and the database requires them too,
            not only this markup (PRD §9.3). */}
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
                defaultValue={ev.nama_kontak ?? ""}
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
                defaultValue={ev.email_kontak ?? ""}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              />
            </label>
          </div>
        </fieldset>

        <button
          type="submit"
          className="w-full rounded-lg px-4 py-3 text-sm font-medium text-white"
          style={{ background: "var(--midnight)" }}
        >
          Kirim Evaluasi · Submit
        </button>
        <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          Setelah dikirim, tautan ini akan tertutup. · Once submitted, this link
          closes. Formulir {ev.form_revision}.
        </p>
      </form>
    </Bingkai>
  );
}
