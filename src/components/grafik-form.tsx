import { SubmitButton } from "@/components/submit-button";

/**
 * One Studio Grafik chart's settings — used for both "Tambah Grafik" and a
 * chart's "Edit". Groupings and metrics are fixed lists that
 * `agregasi_grafik` whitelists, so a config never becomes SQL.
 */

export type ConfigGrafik = {
  grouping?: string;
  sumber_data?: string;
  maks?: number;
  /** Fakultas grouping only: which level of the unit tree to count. */
  level?: string;
  /** Date groupings only: month or year buckets. */
  periode?: string;
  filter?: { region?: string; status?: string; dokumen?: string; fakultas?: string };
};

export type NilaiGrafik = { id?: number; judul: string; jenis_grafik: string; config: ConfigGrafik };

/** The form's fields back into a row; the server action's side of this form. */
export function grafikDariForm(formData: FormData) {
  const s = (k: string, bawaan = "") => String(formData.get(k) ?? bawaan);
  return {
    judul: s("judul", "Grafik").trim() || "Grafik",
    jenis_grafik: s("jenis_grafik", "batang_vertikal"),
    config: {
      grouping: s("grouping", "negara"),
      sumber_data: s("sumber_data", "dokumen"),
      maks: Math.min(50, Math.max(1, Number(formData.get("maks")) || 10)),
      level: s("level", "fakultas"),
      periode: s("periode", "bulan"),
      filter: {
        region: s("f_region"),
        status: s("f_status"),
        dokumen: s("f_dokumen"),
        fakultas: s("f_fakultas"),
      },
    },
  };
}

const inputKelas = "w-full rounded-lg border px-2 py-1 text-sm";
const gaya = { borderColor: "var(--border)" };

function Pilih({
  label,
  name,
  nilai,
  opsi,
}: {
  label: string;
  name: string;
  nilai?: string;
  opsi: [string, string][];
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium">{label}</span>
      <select name={name} defaultValue={nilai ?? opsi[0][0]} className={inputKelas} style={gaya}>
        {opsi.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GrafikForm({
  action,
  awal,
  labelSimpan,
}: {
  action: (formData: FormData) => void | Promise<void>;
  awal?: NilaiGrafik;
  labelSimpan: string;
}) {
  const c = awal?.config ?? {};
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-2">
      {awal?.id ? <input type="hidden" name="id" value={awal.id} /> : null}
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium">Judul</span>
        <input name="judul" required defaultValue={awal?.judul} className={inputKelas} style={gaya} />
      </label>
      <Pilih
        label="Jenis"
        name="jenis_grafik"
        nilai={awal?.jenis_grafik}
        opsi={[
          ["batang_vertikal", "Batang vertikal"],
          ["batang_horizontal", "Batang horizontal"],
          ["donut", "Donut"],
          ["garis", "Garis"],
          ["area", "Area"],
          ["radar", "Radar"],
          ["treemap", "Treemap"],
        ]}
      />
      <Pilih
        label="Dikelompokkan menurut"
        name="grouping"
        nilai={c.grouping}
        opsi={[
          ["status", "Status Dokumen"],
          ["jenis", "Jenis Dokumen"],
          ["negara", "Negara"],
          ["fakultas", "Fakultas / Program Studi"],
          ["jenis_unit", "Unit (UA/UP)"],
          ["tanda_tangan", "Tanggal Ditandatangani"],
          ["mulai", "Tanggal Mulai"],
          ["selesai", "Tanggal Selesai"],
        ]}
      />
      {/* Always shown, read only by the grouping they belong to — keeps the
          form free of client JS. */}
      <Pilih
        label="Tingkat (khusus Fakultas / Program Studi)"
        name="level"
        nilai={c.level}
        opsi={[
          ["fakultas", "Fakultas saja"],
          ["prodi", "Program Studi saja"],
          ["keduanya", "Keduanya"],
        ]}
      />
      <Pilih
        label="Periode (khusus pengelompokan tanggal)"
        name="periode"
        nilai={c.periode}
        opsi={[
          ["bulan", "Per bulan"],
          ["tahun", "Per tahun"],
        ]}
      />
      <Pilih
        label="Metrik"
        name="sumber_data"
        nilai={c.sumber_data}
        opsi={[
          ["dokumen", "Jumlah dokumen"],
          ["mitra", "Jumlah mitra"],
        ]}
      />
      <Pilih
        label="Filter — wilayah"
        name="f_region"
        nilai={c.filter?.region}
        opsi={[
          ["", "Semua"],
          ["Internasional", "Internasional"],
          ["Domestik", "Domestik"],
        ]}
      />
      <Pilih
        label="Filter — status"
        name="f_status"
        nilai={c.filter?.status}
        opsi={[
          ["", "Aktif & Akan Berakhir (bawaan)"],
          ["Aktif", "Aktif"],
          ["Akan Berakhir", "Akan Berakhir"],
          ["Disposisi Evaluasi", "Disposisi Evaluasi"],
          ["Kedaluarsa", "Kedaluwarsa"],
          ["Diarsipkan", "Diarsipkan"],
          ["Draft", "Draft"],
        ]}
      />
      <Pilih
        label="Filter — dokumen"
        name="f_dokumen"
        nilai={c.filter?.dokumen}
        opsi={[
          ["", "Semua"],
          ["MoU", "MoU"],
          ["MoA", "MoA"],
        ]}
      />
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium">Filter — fakultas</span>
        <input name="f_fakultas" defaultValue={c.filter?.fakultas} className={inputKelas} style={gaya} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium">Maksimal kategori</span>
        <input
          name="maks"
          type="number"
          min={1}
          max={50}
          defaultValue={c.maks ?? 10}
          className={inputKelas}
          style={gaya}
        />
      </label>
      <div className="flex items-end">
        <SubmitButton
          labelMenunggu="Menyimpan…"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--midnight)" }}
        >
          {labelSimpan}
        </SubmitButton>
      </div>
    </form>
  );
}
