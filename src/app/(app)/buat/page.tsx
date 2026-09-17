import { supabaseServer } from "@/lib/supabase/server";
import { simpanProposal } from "@/lib/actions/proposal";
import { PohonLingkup } from "@/components/lingkup-tree";

/**
 * Buat Kerja Sama — the Proposal Form (PRD §7.2, Design §5.5).
 *
 * Three sections: prospective partner, proposed cooperation, and scope.
 * Two endings: Simpan sebagai Draft, or Ajukan.
 *
 * Fax and Year Established are deliberately absent — they were removed from the
 * form this cycle. Country lives on the partner record as a controlled
 * dropdown, because it is the authoritative source of the domestic vs
 * international KPI and free text would fragment it on spelling (PRD §11).
 */
export const dynamic = "force-dynamic";

function Bagian({
  judul,
  keterangan,
  children,
}: {
  judul: string;
  keterangan?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mb-5 rounded-xl border bg-white p-5"
      style={{ borderColor: "var(--border)" }}
    >
      <h2 className="text-sm font-semibold">{judul}</h2>
      {keterangan ? (
        <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {keterangan}
        </p>
      ) : (
        <div className="mb-3" />
      )}
      {children}
    </section>
  );
}

const inputKelas = "w-full rounded-lg border px-3 py-2 text-sm";
const inputGaya = { borderColor: "var(--border)" };

export default async function BuatKerjaSama() {
  const supabase = await supabaseServer();

  const [
    { data: partner },
    { data: bidang },
    { data: agenda },
    { data: unit },
    { data: opsi },
    { data: jabatan },
  ] = await Promise.all([
      supabase
        .from("partner")
        .select("id, nama, is_international")
        .eq("is_active", true)
        .order("nama")
        .limit(500),
      supabase.from("bidang_kerjasama").select("id, nama").order("id"),
      supabase.from("agenda").select("id, nama, is_amendment").order("nama"),
      supabase
        .from("unit")
        .select("id, nama, id_parent_unit, id_jenis_unit")
        .eq("is_active", true)
        .order("nama"),
      supabase
        .from("managed_options")
        .select("id, option_group, value")
        .eq("is_active", true),
      supabase.from("jabatan").select("id, nama").order("nama"),
    ]);

  const opsiGrup = (grup: string) =>
    (opsi ?? []).filter((o) => o.option_group === grup);

  return (
    <div className="max-w-3xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
          Buat Kerja Sama
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Simpan sebagai draf dahulu bila datanya belum lengkap. Draf hanya
          terlihat oleh Anda dan KUI.
        </p>
      </header>

      <form action={simpanProposal}>
        <Bagian
          judul="I. Data Calon Mitra"
          keterangan="Pilih mitra dari master data. Negara mitra menentukan status dalam negeri atau luar negeri."
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Calon Mitra (*)</span>
            {/* Multi-partner is rare, so it is the same control rather than a
                separate flow: pick one, or hold Ctrl to pick several
                (PRD §7.8). */}
            <select
              name="id_partner"
              multiple
              required
              size={6}
              className={inputKelas}
              style={inputGaya}
            >
              {(partner ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama} {p.is_international ? "· Luar Negeri" : "· Dalam Negeri"}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
              Untuk lebih dari satu mitra, tahan Ctrl (atau Cmd) saat memilih.
            </span>
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">Mitra Utama</span>
            <select name="id_partner_lead" className={inputKelas} style={inputGaya}>
              <option value="">Mitra pertama yang dipilih</option>
              {(partner ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
            {/* On a multi-partner renewal there is ONE partner evaluation, and
                it goes to this partner (BR-29, Q7). */}
            <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
              Saat pembaruan, evaluasi mitra hanya dikirim ke mitra utama.
            </span>
          </label>
        </Bagian>

        <Bagian
          judul="II. Unit Pengusul"
          keterangan="Jabatan pengusul menentukan unit pemilik hubungan ini. Permintaan pembaruan kelak dikirim ke jabatan tersebut."
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Jabatan Pengusul (*)</span>
            <select
              name="id_jabatan_pengusul"
              required
              className={inputKelas}
              style={inputGaya}
            >
              {(jabatan ?? []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.nama}
                </option>
              ))}
            </select>
          </label>
        </Bagian>

        <Bagian judul="III. Kerja Sama yang Diusulkan">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Jenis (*)</span>
              <select name="jenis_kerjasama" required className={inputKelas} style={inputGaya}>
                <option value="MoU">MoU</option>
                <option value="MoA">MoA</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Periode</span>
              <input
                name="periode_kerjasama"
                placeholder="5 Tahun"
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium">Sifat Periode</span>
              <select name="sifat_periode_kerjasama" className={inputKelas} style={inputGaya}>
                <option value="Kedua Belah Pihak">Kedua Belah Pihak</option>
                <option value="Auto Renewed">Auto Renewed</option>
              </select>
              {/* Auto Renewed documents have no End Date and never enter the
                  expiry-driven renewal flow (BR-11, PRD §9.7). */}
              <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                Auto Renewed berarti tanpa tanggal berakhir dan tidak masuk alur
                pembaruan.
              </span>
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-1 text-sm font-medium">Bidang Kerja Sama</legend>
            <div className="flex flex-wrap gap-3">
              {(bidang ?? []).map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="bidang" value={b.id} />
                  {b.nama}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="mb-1 text-sm font-medium">Agenda Kerja Sama</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(agenda ?? []).map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="agenda" value={a.id} />
                  {a.nama}
                  {/* Flagged by a boolean, so the addendum path is never
                      detected by matching the Indonesian string (BR-16). */}
                  {a.is_amendment ? (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      (adendum)
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">Tujuan Kerja Sama</span>
            <input
              name="tujuan_kerjasama"
              list="opsi-tujuan"
              className={inputKelas}
              style={inputGaya}
            />
            {/* Grow-then-reuse: a new value publishes immediately, with no
                moderation step (PRD §11). */}
            <datalist id="opsi-tujuan">
              {opsiGrup("tujuan").map((o) => (
                <option key={o.id} value={o.value} />
              ))}
            </datalist>
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">Manfaat bagi UKP</span>
            <textarea
              name="manfaat_bagi_petra"
              rows={2}
              className={inputKelas}
              style={inputGaya}
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">Manfaat bagi Mitra</span>
            <textarea
              name="manfaat_bagi_mitra"
              rows={2}
              className={inputKelas}
              style={inputGaya}
            />
            {/* One shared statement, not one per partner (Q1). */}
            <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
              Satu pernyataan bersama, berlaku untuk seluruh mitra pada dokumen ini.
            </span>
          </label>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">Ringkasan Kegiatan (MoU)</span>
            <textarea
              name="ringkasan_kegiatan"
              rows={2}
              className={inputKelas}
              style={inputGaya}
            />
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Hak UKP (MoA)</span>
              <textarea name="hak_petra" rows={2} className={inputKelas} style={inputGaya} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Hak Mitra (MoA)</span>
              <textarea name="hak_calon_mitra" rows={2} className={inputKelas} style={inputGaya} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Kewajiban UKP (MoA)</span>
              <textarea name="kewajiban_petra" rows={2} className={inputKelas} style={inputGaya} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Kewajiban Mitra (MoA)</span>
              <textarea
                name="kewajiban_calon_mitra"
                rows={2}
                className={inputKelas}
                style={inputGaya}
              />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">Informasi Tambahan</span>
            <textarea
              name="informasi_tambahan"
              rows={2}
              className={inputKelas}
              style={inputGaya}
            />
          </label>
        </Bagian>

        <Bagian
          judul="IV. Lingkup Kerja Sama"
          keterangan="Mencentang fakultas otomatis mencentang seluruh prodi dan program di bawahnya. Mencabut satu anak membuat induknya berstatus sebagian."
        >
          <PohonLingkup units={unit ?? []} />
        </Bagian>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="aksi"
            value="draft"
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "white" }}
          >
            Simpan sebagai Draft
          </button>
          <button
            type="submit"
            name="aksi"
            value="ajukan"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--midnight)" }}
          >
            Ajukan
          </button>
        </div>
      </form>
    </div>
  );
}
