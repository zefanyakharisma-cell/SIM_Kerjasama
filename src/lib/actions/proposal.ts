"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { susunPeriode } from "@/lib/periode";
import { unggahBerkas } from "@/lib/unggah";

/**
 * Creating a proposal (PRD §7.2). Draft and Ajukan are the same write with a
 * different ending: a Draft stays private to its creator and IO, a submission
 * enters the List of Processed Documents.
 */
export async function simpanProposal(formData: FormData) {
  const akun = await akunSaatIni();
  if (!akun) redirect("/login");

  const supabase = await supabaseServer();
  const ajukan = formData.get("aksi") === "ajukan";
  const idEdit = Number(formData.get("id") ?? 0) || null;

  const kolom = {
    jenis_kerjasama: formData.get("jenis_kerjasama"),
    periode_kerjasama: formData.get("periode_kerjasama") || null,
    sifat_periode_kerjasama: formData.get("sifat_periode_kerjasama") || null,
    tujuan_kerjasama: formData.get("tujuan_kerjasama") || null,
    manfaat_bagi_petra: formData.get("manfaat_bagi_petra") || null,
    // One shared statement, even on a multi-partner document (Q1).
    manfaat_bagi_mitra: formData.get("manfaat_bagi_mitra") || null,
    informasi_tambahan: formData.get("informasi_tambahan") || null,
  };

  // The searchable fields are free-text inputs in the browser (Revisi V7 §7),
  // so the list is enforced here: a value must be one of the table's.
  const DAFTAR = [
    ["tujuan_kerjasama", "tujuan_kerjasama", "Tujuan Kerja Sama"],
    ["manfaat_bagi_petra", "manfaat_petra", "Manfaat bagi UKP"],
    ["manfaat_bagi_mitra", "manfaat_mitra", "Manfaat bagi Mitra"],
  ] as const;
  for (const [kolomNama, tabel, label] of DAFTAR) {
    const nilai = kolom[kolomNama];
    if (!nilai) continue;
    const { count } = await supabase
      .from(tabel)
      .select("nilai", { count: "exact", head: true })
      .eq("nilai", String(nilai));
    if (!count) throw new Error(`${label} harus dipilih dari daftar.`);
  }

  let id: number;

  if (idEdit) {
    // Editing a draft (revision V3 §2): the same fields, written in place.
    // RLS restricts the update to the draft's own creator or IO, and to rows
    // still in Draft — a submitted document is never edited this way.
    const { data: proposal, error } = await supabase
      .from("proposal_dokumen")
      .update(kolom)
      .eq("id", idEdit)
      .eq("status_proposal", "Draft")
      .select("id")
      .single();
    if (error || !proposal) {
      throw new Error(`Draf gagal disimpan: ${error?.message}`);
    }
    id = proposal.id as number;
    // The child rows are replaced below, together with the create path's own
    // first write of them, by the single atomic simpan_anak_proposal call —
    // no more clear-then-reinsert split across two unchecked round trips.
  } else {
    const { data: proposal, error } = await supabase
      .from("proposal_dokumen")
      .insert({
        ...kolom,
        id_akun_pembuat: akun.id,
        status_proposal: "Draft",
      })
      .select("id")
      .single();

    if (error || !proposal) {
      throw new Error(`Proposal gagal disimpan: ${error?.message}`);
    }
    id = proposal.id as number;
  }

  // A partner is always recorded through the join table, even when there is
  // exactly one. There is no shortcut partner column on the proposal (DR-01).
  //
  // Multi-partner is rare but real: Section I repeats while Section III stays
  // shared, and exactly one partner is the lead — the one whose evaluation is
  // collected at renewal (BR-29). The lead defaults to the first selected, so a
  // single-partner document needs no extra decision.
  //
  // Each Calon Mitra row is either an existing partner (id resolved client-side
  // by search) or a brand-new partner whose fields are inserted here (Revisi V4
  // §1.a). lead_index is the FORM ROW index (0..mitra_count-1), so the id it
  // picks is looked up per row rather than by position in a list that shifts
  // whenever a row is skipped via `continue`.
  // Per-row contact intent is only collected here — set_kontak_utama itself
  // runs after simpan_anak_proposal below, once partner_pengusul actually
  // links the partner to this proposal. H1 fix: set_kontak_utama now checks
  // that link (a submitter may only touch their own Draft's partners), so
  // calling it before the link exists would always fail.
  const jumlahMitra = Number(formData.get("mitra_count") ?? 0);
  const idPerBaris = new Map<number, number>();
  const kontakPerBaris = new Map<number, number>();
  for (let i = 0; i < jumlahMitra; i++) {
    const mode = formData.get(`mitra_mode_${i}`);
    if (mode === "baru") {
      const namaBaru = String(formData.get(`mitra_baru_nama_${i}`) ?? "").trim();
      const idNegaraBaru = Number(formData.get(`mitra_baru_negara_${i}`) ?? 0);
      if (!namaBaru || !idNegaraBaru) continue;
      const { data: negaraBaru } = await supabase
        .from("negara")
        .select("is_domestic")
        .eq("id", idNegaraBaru)
        .maybeSingle();
      const idJenisBaru = Number(formData.get(`mitra_baru_jenis_${i}`) ?? 0) || null;
      const { data: partnerBaru, error: errPartnerBaru } = await supabase
        .from("partner")
        .insert({
          nama: namaBaru,
          id_negara: idNegaraBaru,
          is_international: !(negaraBaru?.is_domestic ?? true),
          id_jenis_mitra: idJenisBaru,
          kota: String(formData.get(`mitra_baru_kota_${i}`) ?? "") || null,
          alamat: String(formData.get(`mitra_baru_alamat_${i}`) ?? "") || null,
          no_telp: String(formData.get(`mitra_baru_telp_${i}`) ?? "") || null,
          homepage: String(formData.get(`mitra_baru_homepage_${i}`) ?? "") || null,
        })
        .select("id")
        .single();
      if (errPartnerBaru || !partnerBaru) {
        throw new Error(`Mitra baru gagal disimpan: ${errPartnerBaru?.message}`);
      }
      const idPartnerBaru = partnerBaru.id as number;
      const idKontakBaru = await simpanKontakBaru(supabase, idPartnerBaru, i, formData);
      if (idKontakBaru) kontakPerBaris.set(i, idKontakBaru);
      idPerBaris.set(i, idPartnerBaru);
    } else {
      const idPartner = Number(formData.get(`id_partner_${i}`) ?? 0);
      if (!idPartner) continue;
      // Existing partner: the user either points at an existing
      // PARTNER_CONTACT (set as primary) or fills in a new one inline. Only
      // IO Admin may write `partner` directly (rls.sql master-data loop), so
      // the primary contact goes through set_kontak_utama rather than a plain
      // update that RLS would otherwise silently drop.
      if (formData.get(`kontak_mode_${i}`) === "existing") {
        const idKontak = Number(formData.get(`id_kontak_${i}`) ?? 0);
        if (idKontak) kontakPerBaris.set(i, idKontak);
      } else {
        const idKontakBaru = await simpanKontakBaru(supabase, idPartner, i, formData);
        if (idKontakBaru) kontakPerBaris.set(i, idKontakBaru);
      }
      idPerBaris.set(i, idPartner);
    }
  }

  const unik = [...new Set(idPerBaris.values())];
  const pilihanLead = idPerBaris.get(Number(formData.get("lead_index") ?? 0));
  const lead = pilihanLead !== undefined && unik.includes(pilihanLead) ? pilihanLead : unik[0];

  // Section II — the proposing position. Without it a renewal request has
  // nowhere to be routed later, so it is recorded at creation rather than
  // reconstructed (BR-25).
  const idJabatanPengusul =
    Number(formData.get("id_jabatan_pengusul") ?? akun.id_jabatan) || null;

  const jenis = String(formData.get("jenis_kerjasama") ?? "");
  const { error: errAnak } = await supabase.rpc("simpan_anak_proposal", {
    p_id: id,
    p_partner: unik.map((p) => ({ id_partner: p, is_lead: p === lead })),
    p_id_jabatan: idJabatanPengusul,
    p_bidang: formData.getAll("bidang").map(Number),
    p_agenda: formData.getAll("agenda").map(Number),
    // The Lingkup selection is stored as the explicit set of chosen units; a
    // parent partial state is derived at read time, never stored (BR-38, DR-09).
    p_unit: formData.getAll("unit").map(Number),
    // Optional (Revisi V8 §3) — an empty array clears the set, same as the
    // other child lists.
    p_sdg: formData.getAll("sdg").map(Number),
    p_jenis: jenis,
    p_mou:
      jenis === "MoU"
        ? { ringkasan_kegiatan: String(formData.get("ringkasan_kegiatan") ?? "") }
        : null,
    p_moa:
      jenis === "MoA"
        ? {
            hak_petra: String(formData.get("hak_petra") ?? ""),
            hak_calon_mitra: String(formData.get("hak_calon_mitra") ?? ""),
            kewajiban_petra: String(formData.get("kewajiban_petra") ?? ""),
            kewajiban_calon_mitra: String(formData.get("kewajiban_calon_mitra") ?? ""),
          }
        : null,
  });
  if (errAnak) {
    throw new Error(`Rincian proposal gagal disimpan: ${errAnak.message}`);
  }

  // Primary contact, per row — only now that simpan_anak_proposal has linked
  // each partner to this proposal via partner_pengusul, which is what
  // set_kontak_utama's ownership check (H1 fix) requires for a non-IO caller.
  for (const [i, idKontak] of kontakPerBaris) {
    const idPartner = idPerBaris.get(i);
    if (!idPartner) continue;
    const { error: errKontak } = await supabase.rpc("set_kontak_utama", {
      p_id_proposal: id,
      p_id_partner: idPartner,
      p_id_kontak: idKontak,
    });
    if (errKontak) throw new Error(`Kontak utama gagal diset: ${errKontak.message}`);
  }

  // Upload Dokumen (Revisi V4 §4) — optional, PDF or Word (Revisi V7 §8.1),
  // stored in the same bucket the laporan flow already uses.
  const berkas = formData.get("upload_dokumen") as File | null;
  if (berkas && berkas.size > 0) {
    const unggah = await unggahBerkas(supabase, `draft/${id}`, berkas);
    if ("pesan" in unggah) throw new Error(unggah.pesan);
    const { error: errFileDraft } = await supabase
      .from("proposal_dokumen")
      .update({ file_draft: unggah.path })
      .eq("id", id);
    if (errFileDraft) {
      throw new Error(`Path berkas gagal disimpan: ${errFileDraft.message}`);
    }
  }

  // A creation and an edit are different events for the audit log and for
  // notifications — 'revision_requested' is the APPROVER's action (catat_revisi)
  // and drives its own notification; reusing it here for a self-edit would
  // misfire that notification and pollute the Discussion tab's filter on it.
  const { error: errRiwayat } = await supabase.from("riwayat_approval").insert({
    id_proposal_dokumen: id,
    id_akun: akun.id,
    aksi: idEdit ? "edited" : "created",
  });
  if (errRiwayat) {
    throw new Error(`Riwayat gagal dicatat: ${errRiwayat.message}`);
  }

  if (ajukan) {
    const { error: galat } = await supabase.rpc("ajukan_proposal", {
      p_id_proposal: id,
    });
    if (galat) throw new Error(`Pengajuan ditolak: ${galat.message}`);
  }

  revalidatePath("/kerja-sama");
  if (idEdit) revalidatePath(`/kerja-sama/${id}/laporan`);
  redirect(idEdit ? `/kerja-sama/${id}/laporan` : `/kerja-sama/${id}`);
}

/**
 * Inserts the full PARTNER_CONTACT entity for Calon Mitra row `i` (name
 * required, the rest optional free text). Returns its id so the caller can
 * set it as the partner's primary contact once simpan_anak_proposal has
 * linked the partner to the proposal (set_kontak_utama needs that link).
 */
async function simpanKontakBaru(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  idPartner: number,
  i: number,
  formData: FormData,
): Promise<number | null> {
  const namaKontak = String(formData.get(`kontak_nama_${i}`) ?? "").trim();
  if (!namaKontak) return null;
  const { data: kontakBaru, error } = await supabase
    .from("partner_contact")
    .insert({
      id_partner: idPartner,
      nama: namaKontak,
      jabatan: String(formData.get(`kontak_jabatan_${i}`) ?? "") || null,
      email: String(formData.get(`kontak_email_${i}`) ?? "") || null,
      no_telp: String(formData.get(`kontak_telp_${i}`) ?? "") || null,
    })
    .select("id")
    .single();
  if (error || !kontakBaru) {
    throw new Error(`Kontak baru gagal disimpan: ${error?.message}`);
  }
  return kontakBaru.id as number;
}
