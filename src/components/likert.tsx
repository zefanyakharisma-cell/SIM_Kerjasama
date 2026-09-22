/**
 * The two Likert grids, shared by the faculty form and the public partner page
 * (Design §5.9, §5.10).
 *
 * One component for both sides on purpose: the two answers are compared against
 * each other in the gap analytics, so they must be the same five dimensions on
 * the same 1-5 scale. Two components would eventually drift and quietly make
 * the comparison meaningless.
 *
 * Accessibility is the reason this is radios rather than a clickable grid
 * (Design §9): each dimension is its own radio group with a real row header, so
 * a screen reader announces "Kualitas: 4 dari 5" and a keyboard reaches every
 * cell. A mouse-only matrix of divs is the obvious build and it is unusable.
 */

export const DIMENSI = [
  { kunci: "quality", id: "Kualitas kerja sama", en: "Quality" },
  { kunci: "relevance", id: "Relevansi dengan kebutuhan", en: "Relevance" },
  { kunci: "productivity", id: "Produktivitas hasil", en: "Productivity" },
  { kunci: "sustainability", id: "Keberlanjutan", en: "Sustainability" },
  { kunci: "communication", id: "Komunikasi", en: "Communication" },
] as const;

const NILAI = [1, 2, 3, 4, 5];

export function GridLikert({
  awalan,
  judul,
  keterangan,
  dwibahasa = false,
  wajib = true,
  awal,
}: {
  awalan: "exp" | "sat";
  judul: string;
  keterangan: string;
  dwibahasa?: boolean;
  wajib?: boolean;
  /**
   * The previously posted answers, so a submission the server refused comes
   * back filled in rather than blank. The public partner page has one
   * single-use link and no login, so losing ten answers to a refusal means the
   * respondent starts over — or gives up.
   */
  awal?: Record<string, unknown>;
}) {
  return (
    <fieldset
      className="mb-5 rounded-xl border bg-white p-4"
      style={{
        borderColor: "var(--border)",
        // The two grids must not be conflated, so they differ visibly as well
        // as by heading (Design §5.9).
        borderLeftWidth: 3,
        borderLeftColor:
          awalan === "exp" ? "var(--status-progress)" : "var(--status-active)",
      }}
    >
      <legend className="px-1 text-sm font-semibold">{judul}</legend>
      <p className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        {keterangan}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--text-secondary)" }}>
              <th className="py-1 text-left font-medium" />
              {NILAI.map((n) => (
                <th key={n} className="px-2 py-1 text-center text-xs font-medium">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIMENSI.map((d) => (
              <tr key={d.kunci} className="border-t" style={{ borderColor: "var(--border)" }}>
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {d.id}
                  {dwibahasa ? (
                    <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                      {d.en}
                    </span>
                  ) : null}
                </th>
                {NILAI.map((n) => (
                  <td key={n} className="px-2 py-2 text-center">
                    <input
                      type="radio"
                      name={`${awalan}_${d.kunci}`}
                      value={n}
                      defaultChecked={Number(awal?.[`${awalan}_${d.kunci}`]) === n}
                      required={wajib && n === 1}
                      aria-label={`${d.id}: ${n} dari 5`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        1 = sangat rendah, 5 = sangat tinggi
        {dwibahasa ? " · 1 = very low, 5 = very high" : ""}
      </p>
    </fieldset>
  );
}

/**
 * The recommendation is the field the whole gate turns on, so it is prominent
 * and it is never pre-selected — an unanswered recommendation must stay
 * unanswered rather than quietly meaning "continue" (BR-26).
 */
export function BlokRekomendasi({
  dwibahasa = false,
  awal,
}: {
  dwibahasa?: boolean;
  awal?: Record<string, unknown>;
}) {
  return (
    <fieldset
      className="mb-5 rounded-xl border-2 bg-white p-4"
      style={{ borderColor: "var(--midnight)" }}
    >
      <legend className="px-1 text-sm font-semibold">
        Rekomendasi{dwibahasa ? " · Recommendation" : ""}
      </legend>
      <p className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        {dwibahasa
          ? "Apakah kerja sama ini sebaiknya dilanjutkan? · Should this partnership continue?"
          : "Apakah kerja sama ini sebaiknya dilanjutkan?"}
      </p>

      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="rekomendasi"
            value="continue"
            defaultChecked={awal?.rekomendasi === "continue"}
            required
            className="mt-1"
          />
          <span>
            Lanjutkan kerja sama
            {dwibahasa ? (
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                Continue the partnership
              </span>
            ) : null}
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="rekomendasi"
            value="terminate"
            defaultChecked={awal?.rekomendasi === "terminate"}
            className="mt-1"
          />
          <span>
            Akhiri kerja sama
            {dwibahasa ? (
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                End the partnership
              </span>
            ) : null}
          </span>
        </label>
      </div>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">
          Bila dilanjutkan, dalam bentuk apa?
          {dwibahasa ? " · If continuing, in what form?" : ""}
        </span>
        <select
          name="continuation_mode"
          defaultValue={String(awal?.continuation_mode ?? "")}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          <option value="">—</option>
          <option value="same_program">Program yang sama</option>
          <option value="add_program">Menambah program baru</option>
        </select>
      </label>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">
          Catatan{dwibahasa ? " · Notes" : ""}
        </span>
        <textarea
          name="catatan_evaluasi"
          rows={3}
          defaultValue={String(awal?.catatan_evaluasi ?? "")}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        />
      </label>
    </fieldset>
  );
}

/**
 * Pulls the posted answers into the jsonb shape the database function takes.
 *
 * An unanswered Likert cell must never reach the database. `Number(null)` is 0,
 * not NaN, so a missing radio used to pass this layer intact and be refused only
 * by the CHECK (... between 1 and 5) — whose raw Postgres text then surfaced to
 * the partner on the public page. So the miss is caught here, once, for both
 * callers: the result carries `galat` and every caller refuses on it before the
 * RPC. The return type stays a plain jsonb record, so no call site changes shape.
 */
export function bacaJawaban(formData: FormData): Record<string, unknown> & { galat?: string } {
  const jawaban: Record<string, unknown> & { galat?: string } = {
    rekomendasi: formData.get("rekomendasi"),
    continuation_mode: formData.get("continuation_mode") ?? "",
    catatan_evaluasi: formData.get("catatan_evaluasi") ?? "",
    respondent_nama: formData.get("respondent_nama") ?? "",
    respondent_email: formData.get("respondent_email") ?? "",
    respondent_jabatan: formData.get("respondent_jabatan") ?? "",
    respondent_hp: formData.get("respondent_hp") ?? "",
  };
  const kosong: string[] = [];
  for (const d of DIMENSI) {
    for (const awalan of ["exp", "sat"] as const) {
      const n = Number(formData.get(`${awalan}_${d.kunci}`));
      if (!Number.isInteger(n) || n < 1 || n > 5) kosong.push(d.id);
      jawaban[`${awalan}_${d.kunci}`] = n;
    }
  }
  if (!jawaban.rekomendasi) kosong.push("Rekomendasi");
  if (kosong.length) {
    jawaban.galat = `Mohon lengkapi penilaian: ${[...new Set(kosong)].join(", ")}.`;
  }
  return jawaban;
}
