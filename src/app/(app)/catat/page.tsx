import { notFound } from "next/navigation";
import { akunSaatIni, isIO, supabaseServer } from "@/lib/supabase/server";
import { catatDokumenLangsung } from "@/lib/actions/pencatatan";
import { PohonLingkup } from "@/components/lingkup-tree";
import { MitraPicker } from "@/components/mitra-picker";
import { SearchSelect } from "@/components/search-select";
import { KerjaSamaFields } from "@/components/kerja-sama-fields";
import { SubmitButton } from "@/components/submit-button";
import { Bagian } from "@/components/bagian";
import { uraiPeriode } from "@/lib/periode";
import { TERIMA_PDF } from "@/lib/unggah";

/**
 * Catat Dokumen — Pencatatan Langsung (Revisi V8 §1).
 *
 * The same sections as Buat Kerja Sama, plus the signed-document detail the
 * activation form normally collects, in one pass. There is no Draft and no
 * Ajukan: the document is already signed, so it lands Aktif immediately and
 * never enters the disposition flow.
 *
 * KUI only. `?id=` edits an existing direct entry — and only a direct entry:
 * the query below filters on is_pencatatan_langsung, and the RPC refuses a
 * document that really did go through approval.
 */
export const dynamic = "force-dynamic";

/** PostgREST `or`: active rows, plus the ids this record already holds. */
const aktifAtau = (ids: unknown[]) =>
  ids.length ? `is_active.eq.true,id.in.(${ids.map(Number).join(",")})` : "is_active.eq.true";

const inputKelas = "w-full rounded-lg border px-3 py-2 text-sm";
const inputGaya = { borderColor: "var(--border)" };

export default async function CatatDokumen({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id: idMentah } = await searchParams;
  const idEdit = idMentah ? Number(idMentah) : null;
  const supabase = await supabaseServer();
  const akun = await akunSaatIni();

  // Same gate the activation form uses. RLS and the RPC are the real
  // enforcement; this keeps the page from rendering a form that could only
  // fail on submit.
  if (!isIO(akun)) notFound();

  const { data: rekaman } = idEdit
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
           proposal_dokumen_sdg ( nomor_sdg ),
           proposal_dokumen_mou ( ringkasan_kegiatan ),
           proposal_dokumen_moa ( hak_petra, hak_calon_mitra, kewajiban_petra, kewajiban_calon_mitra ),
           dokumen_kerja_sama ( no, no_dokumen, tanggal_tanda_tangan, tanggal_mulai,
             tanggal_berakhir, folder_kui, no_berkas_dikti, upload_dokumen,
             penandatangan_petra ( nama, jabatan ),
             penandatangan_partner ( nama, jabatan ) )`,
        )
        .eq("id", idEdit)
        .eq("is_pencatatan_langsung", true)
        .maybeSingle()
    : { data: null };

  if (idEdit && !rekaman) notFound();

  const r = rekaman as any;
  const partnerTerpilih = new Set(r?.partner_pengusul?.map((p: any) => p.id_partner) ?? []);
  const partnerLead = r?.partner_pengusul?.find((p: any) => p.is_lead)?.id_partner ?? null;
  const bidangTerpilih = new Set(r?.proposal_dokumen_bidang?.map((b: any) => b.id_bidang_kerjasama) ?? []);
  const agendaTerpilih = new Set(r?.proposal_dokumen_agenda?.map((a: any) => a.id_agenda) ?? []);
  const unitTerpilih: number[] = r?.proposal_dokumen_unit?.map((u: any) => u.id_unit) ?? [];
  const sdgTerpilih = new Set(r?.proposal_dokumen_sdg?.map((s: any) => s.nomor_sdg) ?? []);
  const mou = r?.proposal_dokumen_mou?.[0] ?? r?.proposal_dokumen_mou;
  const moa = r?.proposal_dokumen_moa?.[0] ?? r?.proposal_dokumen_moa;
  const jabatanPengusul = r?.pengusul?.[0]?.id_jabatan ?? null;
  const periode = uraiPeriode(r?.periode_kerjasama);
  const dok = r?.dokumen_kerja_sama?.[0] ?? r?.dokumen_kerja_sama;
  const ttdPetra = dok?.penandatangan_petra?.[0] ?? dok?.penandatangan_petra;
  const ttdMitra = dok?.penandatangan_partner?.[0] ?? dok?.penandatangan_partner;

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
    { data: sdgOpsi },
  ] = await Promise.all([
    supabase
      .from("partner")
      .select("id, nama, is_international")
      .eq("is_active", true)
      .order("nama")
      .limit(500),
    supabase.from("bidang_kerjasama").select("id, nama").or(aktifAtau([...bidangTerpilih])).order("id"),
    supabase
      .from("agenda")
      .select("id, nama, is_amendment")
      .or(aktifAtau([...agendaTerpilih]))
      .order("nama"),
    supabase
      .from("unit")
      .select("id, nama, id_parent_unit, id_jenis_unit")
      .eq("is_active", true)
      .order("nama"),
    supabase.from("tujuan_kerjasama").select("nilai").eq("is_active", true).order("nilai"),
    supabase.from("manfaat_petra").select("nilai").eq("is_active", true).order("nilai"),
    supabase.from("manfaat_mitra").select("nilai").eq("is_active", true).order("nilai"),
    supabase
      .from("jabatan")
      .select("id, nama")
      .or(aktifAtau(jabatanPengusul ? [jabatanPengusul] : []))
      .order("nama"),
    supabase.from("negara").select("id, nama").eq("is_active", true).order("nama"),
    supabase.from("jenis_mitra").select("id, nama").eq("is_active", true).order("nama"),
    supabase.from("partner_contact").select("id, id_partner, nama").order("nama").limit(2000),
    supabase.from("sdg").select("nomor, nama, warna").order("nomor"),
  ]);

  // A recorded document's own partners may fall outside the caps above, same
  // as on the proposal form — fetch and merge so the picker always prefills.
  const idPartnerAda = [...partnerTerpilih] as number[];
  const { data: partnerRekaman } = idPartnerAda.length
    ? await supabase.from("partner").select("id, nama, is_international").in("id", idPartnerAda)
    : { data: [] };
  const { data: kontakRekaman } = idPartnerAda.length
    ? await supabase
        .from("partner_contact")
        .select("id, id_partner, nama")
        .in("id_partner", idPartnerAda)
    : { data: [] };

  const partnerGabungan = [...(partner ?? [])];
  const sudahAda = new Set(partnerGabungan.map((p) => p.id));
  for (const p of partnerRekaman ?? []) if (!sudahAda.has(p.id)) partnerGabungan.push(p);
  const kontakGabungan = [...(kontak ?? [])];
  const kontakAda = new Set(kontakGabungan.map((k) => k.id));
  for (const k of kontakRekaman ?? []) if (!kontakAda.has(k.id)) kontakGabungan.push(k);

  return (
    <div className="max-w-3xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold" style={{ color: "var(--midnight)" }}>
          {idEdit ? "Ubah Pencatatan Dokumen" : "Catat Dokumen"}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Untuk dokumen yang sudah ditandatangani di luar sistem. Dokumen langsung
          tercatat aktif — tanpa pengajuan, disposisi, atau approval.
        </p>
      </header>

      <form action={catatDokumenLangsung} encType="multipart/form-data">
        {idEdit ? <input type="hidden" name="id" value={idEdit} /> : null}

        <Bagian
          judul="I. Data Mitra"
          keterangan="Pilih mitra dari master data, atau tambahkan mitra baru. Negara mitra menentukan status dalam negeri atau luar negeri."
        >
          <MitraPicker
            partners={partnerGabungan}
            negara={negara ?? []}
            jenisMitra={jenisMitra ?? []}
            contacts={kontakGabungan}
            awal={idPartnerAda}
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
              defaultValue={jabatanPengusul}
              placeholder="Cari jabatan..."
            />
          </label>
        </Bagian>

        <Bagian judul="III. Kerja Sama">
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="block sm:col-span-2">
              <legend className="mb-1 block text-sm font-medium">Periode Kerja Sama</legend>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="number"
                  name="periode_tahun"
                  min={0}
                  max={99}
                  inputMode="numeric"
                  aria-label="Periode (tahun)"
                  defaultValue={periode.tahun}
                  className="w-20 rounded-lg border px-3 py-2 text-sm"
                  style={inputGaya}
                />
                <span>Tahun</span>
                <input
                  type="number"
                  name="periode_bulan"
                  min={0}
                  max={11}
                  inputMode="numeric"
                  aria-label="Periode (bulan)"
                  defaultValue={periode.bulan}
                  className="ml-2 w-20 rounded-lg border px-3 py-2 text-sm"
                  style={inputGaya}
                />
                <span>Bulan</span>
              </div>
            </fieldset>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium">Sifat Periode</span>
              <select
                name="sifat_periode_kerjasama"
                defaultValue={r?.sifat_periode_kerjasama ?? "Kedua Belah Pihak"}
                className={inputKelas}
                style={inputGaya}
              >
                <option value="Kedua Belah Pihak">Kedua Belah Pihak</option>
                <option value="Auto Renewed">Auto Renewed</option>
              </select>
              {/* BR-11: an Auto Renewed document may not carry an end date. The
                  database refuses the combination, so leave Tanggal Berakhir
                  empty when choosing it. */}
              <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                Auto Renewed berarti tanpa tanggal berakhir — kosongkan Tanggal
                Berakhir di Bagian V.
              </span>
            </label>
          </div>

          <div className="mt-4">
            <KerjaSamaFields
              jenisAwal={r?.jenis_kerjasama ?? "MoU"}
              tujuanOpsi={(tujuanOpsi ?? []).map((o) => o.nilai)}
              manfaatPetraOpsi={(manfaatPetraOpsi ?? []).map((o) => o.nilai)}
              manfaatMitraOpsi={(manfaatMitraOpsi ?? []).map((o) => o.nilai)}
              tujuanAwal={r?.tujuan_kerjasama ?? ""}
              manfaatPetraAwal={r?.manfaat_bagi_petra ?? ""}
              manfaatMitraAwal={r?.manfaat_bagi_mitra ?? ""}
              ringkasanKegiatanAwal={mou?.ringkasan_kegiatan ?? ""}
              hakPetraAwal={moa?.hak_petra ?? ""}
              hakMitraAwal={moa?.hak_calon_mitra ?? ""}
              kewajibanPetraAwal={moa?.kewajiban_petra ?? ""}
              kewajibanMitraAwal={moa?.kewajiban_calon_mitra ?? ""}
            />
          </div>

          <fieldset className="mt-4">
            <legend className="mb-1 text-sm font-medium">Bidang Kerja Sama</legend>
            <div className="flex flex-wrap gap-3">
              {(bidang ?? []).map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="bidang" value={b.id} defaultChecked={bidangTerpilih.has(b.id)} />
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
                  <input type="checkbox" name="agenda" value={a.id} defaultChecked={agendaTerpilih.has(a.id)} />
                  {a.nama}
                  {a.is_amendment ? (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      (adendum)
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="mb-1 text-sm font-medium">
              Sustainable Development Goals (SDGs)
            </legend>
            <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Opsional. Pilih SDG yang relevan dengan kerja sama ini.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(sdgOpsi ?? []).map((s) => (
                <label key={s.nomor} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="sdg" value={s.nomor} defaultChecked={sdgTerpilih.has(s.nomor)} />
                  {s.nomor}. {s.nama}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">Informasi Tambahan</span>
            <textarea
              name="informasi_tambahan"
              rows={2}
              defaultValue={r?.informasi_tambahan ?? ""}
              className={inputKelas}
              style={inputGaya}
            />
          </label>
        </Bagian>

        <Bagian
          judul="IV. Lingkup Kerja Sama"
          keterangan="Mencentang fakultas otomatis mencentang seluruh prodi dan program di bawahnya. Mencabut satu anak membuat induknya berstatus sebagian."
        >
          <PohonLingkup units={unit ?? []} awal={unitTerpilih} />
        </Bagian>

        <Bagian
          judul="V. Dokumen yang Sudah Ditandatangani"
          keterangan="Data dari dokumen fisik yang sudah berlaku. Tanggal tanda tangan menjadi tanggal pengajuan dan persetujuan dokumen ini, karena tidak melalui proses approval."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Nomor Dokumen (*)</span>
              <input
                name="no_dokumen"
                required
                defaultValue={dok?.no_dokumen ?? ""}
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Nomor LAPORDIKTI</span>
              <input
                name="no_berkas_dikti"
                defaultValue={dok?.no_berkas_dikti ?? ""}
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Tanggal Tanda Tangan (*)</span>
              <input
                type="date"
                name="tanggal_tanda_tangan"
                required
                defaultValue={dok?.tanggal_tanda_tangan ?? ""}
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Tanggal Mulai (*)</span>
              <input
                type="date"
                name="tanggal_mulai"
                required
                defaultValue={dok?.tanggal_mulai ?? ""}
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Tanggal Berakhir</span>
              <input
                type="date"
                name="tanggal_berakhir"
                defaultValue={dok?.tanggal_berakhir ?? ""}
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Folder KUI</span>
              <input
                name="folder_kui"
                defaultValue={dok?.folder_kui ?? ""}
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Penandatangan PETRA</span>
              <input
                name="penandatangan_petra"
                defaultValue={ttdPetra?.nama ?? ""}
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Jabatan Penandatangan PETRA</span>
              <input
                name="jabatan_petra"
                defaultValue={ttdPetra?.jabatan ?? ""}
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Penandatangan Mitra</span>
              <input
                name="penandatangan_mitra"
                defaultValue={ttdMitra?.nama ?? ""}
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Jabatan Penandatangan Mitra</span>
              <input
                name="jabatan_mitra"
                defaultValue={ttdMitra?.jabatan ?? ""}
                className={inputKelas}
                style={inputGaya}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium">
                Upload Dokumen (PDF bertanda tangan)
              </span>
              <input type="file" name="berkas" accept={TERIMA_PDF} className="text-sm" />
              {dok?.upload_dokumen ? (
                <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                  Sudah ada berkas tersimpan. Biarkan kosong untuk mempertahankannya.
                </span>
              ) : null}
            </label>
          </div>
        </Bagian>

        <SubmitButton
          labelMenunggu="Menyimpan…"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--midnight)" }}
        >
          {idEdit ? "Simpan Perubahan" : "Simpan Dokumen"}
        </SubmitButton>
      </form>
    </div>
  );
}
