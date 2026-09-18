import { supabaseServer } from "@/lib/supabase/server";
import { simpanProposal } from "@/lib/actions/proposal";
import { PohonLingkup } from "@/components/lingkup-tree";
import { MitraPicker } from "@/components/mitra-picker";
import { SearchSelect } from "@/components/search-select";
import { KerjaSamaFields } from "@/components/kerja-sama-fields";
import { SubmitButton } from "@/components/submit-button";

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

export default async function BuatKerjaSama({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id: idMentah } = await searchParams;
  const idEdit = idMentah ? Number(idMentah) : null;
  const supabase = await supabaseServer();

  // Editing a draft loads its current values to prefill the form (revision
  // V3 §2). Only a Draft can be edited this way — RLS already restricts the
  // row to its own creator or IO, and the status check keeps a submitted
  // document out of this path even for IO.
  const { data: draf } = idEdit
    ? await supabase
        .from("proposal_dokumen")
        .select(
          `id, jenis_kerjasama, periode_kerjasama, sifat_periode_kerjasama,
           tujuan_kerjasama, manfaat_bagi_petra, manfaat_bagi_mitra, informasi_tambahan,
           partner_pengusul ( id_partner, is_lead ),
           pengusul ( id_jabatan ),
           proposal_dokumen_bidang ( id_bidang_kerjasama ),
           proposal_dokumen_agenda ( id_agenda ),
           proposal_dokumen_unit ( id_unit ),
           proposal_dokumen_mou ( ringkasan_kegiatan ),
           proposal_dokumen_moa ( hak_petra, hak_calon_mitra, kewajiban_petra, kewajiban_calon_mitra )`,
        )
        .eq("id", idEdit)
        .eq("status_proposal", "Draft")
        .maybeSingle()
    : { data: null };

  const partnerTerpilih = new Set((draf as any)?.partner_pengusul?.map((p: any) => p.id_partner) ?? []);
  const partnerLead = (draf as any)?.partner_pengusul?.find((p: any) => p.is_lead)?.id_partner ?? null;
  const bidangTerpilih = new Set((draf as any)?.proposal_dokumen_bidang?.map((b: any) => b.id_bidang_kerjasama) ?? []);
  const agendaTerpilih = new Set((draf as any)?.proposal_dokumen_agenda?.map((a: any) => a.id_agenda) ?? []);
  const unitTerpilih: number[] = (draf as any)?.proposal_dokumen_unit?.map((u: any) => u.id_unit) ?? [];
  const mouDraf = (draf as any)?.proposal_dokumen_mou?.[0] ?? (draf as any)?.proposal_dokumen_mou;
  const moaDraf = (draf as any)?.proposal_dokumen_moa?.[0] ?? (draf as any)?.proposal_dokumen_moa;
  const jabatanPengusulDraf = (draf as any)?.pengusul?.[0]?.id_jabatan ?? null;

  const [
    { data: partner },
    { data: bidang },
    { data: agenda },
    { data: unit },
    { data: tujuanOpsi },
    { data: manfaatPetraOpsi },
    { data: manfaatMitraOpsi },
    { data: jabatan },
    { data: negara },
    { data: jenisMitra },
    { data: kontak },
  ] = await Promise.all([
      // ponytail: client-side list is capped at 500 rows (a search box on the
      // server side is the real fix); the draft's own partners are patched in
      // below so editing a draft never silently drops a partner outside that
      // cap.
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
      supabase.from("tujuan_kerjasama").select("nilai").eq("is_active", true).order("nilai"),
      supabase.from("manfaat_petra").select("nilai").eq("is_active", true).order("nilai"),
      supabase.from("manfaat_mitra").select("nilai").eq("is_active", true).order("nilai"),
      supabase.from("jabatan").select("id, nama").order("nama"),
      supabase.from("negara").select("id, nama").order("nama"),
      supabase.from("jenis_mitra").select("id, nama").order("nama"),
      // Supabase's default max-rows (often 1000) already makes a limit(2000)
      // here mostly aspirational; the draft partners' contacts are fetched
      // separately below so a draft edit at least never loses those.
      supabase.from("partner_contact").select("id, id_partner, nama").order("nama").limit(2000),
    ]);

  // A draft's own partners may fall outside the 500-row/2000-row caps above
  // (e.g. sorted after them alphabetically) — fetch them explicitly and merge
  // so MitraPicker can always prefill the draft's selection.
  const idPartnerDraf = [...partnerTerpilih] as number[];
  const { data: partnerDraf } = idPartnerDraf.length
    ? await supabase
        .from("partner")
        .select("id, nama, is_international")
        .in("id", idPartnerDraf)
    : { data: [] };
  const { data: kontakDraf } = idPartnerDraf.length
    ? await supabase.from("partner_contact").select("id, id_partner, nama").in("id_partner", idPartnerDraf)
    : { data: [] };

  const partnerGabungan = [...(partner ?? [])];
  const idPartnerAda = new Set(partnerGabungan.map((p) => p.id));
  for (const p of partnerDraf ?? []) {
    if (!idPartnerAda.has(p.id)) partnerGabungan.push(p);
  }
  const kontakGabungan = [...(kontak ?? [])];
  const idKontakAda = new Set(kontakGabungan.map((k) => k.id));
  for (const k of kontakDraf ?? []) {
    if (!idKontakAda.has(k.id)) kontakGabungan.push(k);
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
          {idEdit ? "Edit Draf Kerja Sama" : "Buat Kerja Sama"}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {idEdit
            ? "Perubahan menimpa draf ini di tempat. Simpan sebagai draf lagi, atau ajukan langsung dari sini."
            : "Simpan sebagai draf dahulu bila datanya belum lengkap. Draf hanya terlihat oleh Anda dan KUI."}
        </p>
      </header>

      <form action={simpanProposal} encType="multipart/form-data">
        {idEdit ? <input type="hidden" name="id" value={idEdit} /> : null}
        <Bagian
          judul="I. Data Calon Mitra"
          keterangan="Pilih mitra dari master data, atau tambahkan mitra baru. Negara mitra menentukan status dalam negeri atau luar negeri."
        >
          <MitraPicker
            partners={partnerGabungan}
            negara={negara ?? []}
            jenisMitra={jenisMitra ?? []}
            contacts={kontakGabungan}
            awal={[...partnerTerpilih] as number[]}
            leadAwal={partnerLead}
          />
        </Bagian>

        <Bagian
          judul="II. Unit Pengusul"
          keterangan="Jabatan pengusul menentukan unit pemilik hubungan ini. Permintaan pembaruan kelak dikirim ke jabatan tersebut."
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Jabatan Pengusul (*)</span>
            <SearchSelect
              name="id_jabatan_pengusul"
              options={(jabatan ?? []).map((j) => ({ id: j.id, label: j.nama }))}
              defaultValue={jabatanPengusulDraf}
              placeholder="Cari jabatan..."
            />
          </label>
        </Bagian>

        <Bagian judul="III. Kerja Sama yang Diusulkan">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Periode</span>
              <input
                name="periode_kerjasama"
                defaultValue={(draf as any)?.periode_kerjasama ?? ""}
                placeholder="5 Tahun"
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium">Sifat Periode</span>
              <select
                name="sifat_periode_kerjasama"
                defaultValue={(draf as any)?.sifat_periode_kerjasama ?? "Kedua Belah Pihak"}
                className={inputKelas}
                style={inputGaya}
              >
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

          <div className="mt-4">
            <KerjaSamaFields
              jenisAwal={(draf as any)?.jenis_kerjasama ?? "MoU"}
              tujuanOpsi={(tujuanOpsi ?? []).map((o) => o.nilai)}
              manfaatPetraOpsi={(manfaatPetraOpsi ?? []).map((o) => o.nilai)}
              manfaatMitraOpsi={(manfaatMitraOpsi ?? []).map((o) => o.nilai)}
              tujuanAwal={(draf as any)?.tujuan_kerjasama ?? ""}
              manfaatPetraAwal={(draf as any)?.manfaat_bagi_petra ?? ""}
              manfaatMitraAwal={(draf as any)?.manfaat_bagi_mitra ?? ""}
              ringkasanKegiatanAwal={mouDraf?.ringkasan_kegiatan ?? ""}
              hakPetraAwal={moaDraf?.hak_petra ?? ""}
              hakMitraAwal={moaDraf?.hak_calon_mitra ?? ""}
              kewajibanPetraAwal={moaDraf?.kewajiban_petra ?? ""}
              kewajibanMitraAwal={moaDraf?.kewajiban_calon_mitra ?? ""}
            />
          </div>

          <fieldset className="mt-4">
            <legend className="mb-1 text-sm font-medium">Bidang Kerja Sama</legend>
            <div className="flex flex-wrap gap-3">
              {(bidang ?? []).map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="bidang"
                    value={b.id}
                    defaultChecked={bidangTerpilih.has(b.id)}
                  />
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
                  <input
                    type="checkbox"
                    name="agenda"
                    value={a.id}
                    defaultChecked={agendaTerpilih.has(a.id)}
                  />
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
            <span className="mb-1 block text-sm font-medium">Informasi Tambahan</span>
            <textarea
              name="informasi_tambahan"
              rows={2}
              defaultValue={(draf as any)?.informasi_tambahan ?? ""}
              className={inputKelas}
              style={inputGaya}
            />
          </label>
        </Bagian>

        <Bagian judul="Upload Dokumen" keterangan="Opsional. Unggah draf dokumen kerja sama dalam format PDF.">
          <input type="file" name="upload_dokumen" accept="application/pdf" aria-label="Upload dokumen (PDF)" className="text-sm" />
        </Bagian>

        <Bagian
          judul="IV. Lingkup Kerja Sama"
          keterangan="Mencentang fakultas otomatis mencentang seluruh prodi dan program di bawahnya. Mencabut satu anak membuat induknya berstatus sebagian."
        >
          <PohonLingkup units={unit ?? []} awal={unitTerpilih} />
        </Bagian>

        <div className="flex flex-wrap gap-2">
          <SubmitButton
            name="aksi"
            value="draft"
            labelMenunggu="Menyimpan…"
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "white" }}
          >
            Simpan sebagai Draft
          </SubmitButton>
          <SubmitButton
            name="aksi"
            value="ajukan"
            labelMenunggu="Mengajukan…"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--midnight)" }}
          >
            Ajukan
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
