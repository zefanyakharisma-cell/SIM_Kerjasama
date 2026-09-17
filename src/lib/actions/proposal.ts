"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";

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

    // The child rows are the explicit set for this proposal, not an append
    // log — clearing and reinserting keeps that true on every save, exactly
    // like the Lingkup Kerja Sama tree already does at read time (BR-38).
    await Promise.all([
      supabase.from("partner_pengusul").delete().eq("id_proposal_dokumen", id),
      supabase.from("pengusul").delete().eq("id_proposal_dokumen", id),
      supabase.from("proposal_dokumen_bidang").delete().eq("id_proposal_dokumen", id),
      supabase.from("proposal_dokumen_agenda").delete().eq("id_proposal_dokumen", id),
      supabase.from("proposal_dokumen_unit").delete().eq("id_proposal_dokumen", id),
      supabase.from("proposal_dokumen_mou").delete().eq("id_proposal_dokumen", id),
      supabase.from("proposal_dokumen_moa").delete().eq("id_proposal_dokumen", id),
    ]);
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
  // §1.a). Rows are processed in order, so lead_index still lines up with the
  // resulting partner id list as long as every row resolves to an id.
  const jumlahMitra = Number(formData.get("mitra_count") ?? 0);
  const partnerIds: number[] = [];
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
      await simpanKontakBaru(supabase, idPartnerBaru, i, formData);
      partnerIds.push(idPartnerBaru);
    } else {
      const idPartner = Number(formData.get(`id_partner_${i}`) ?? 0);
      if (!idPartner) continue;
      // Existing partner: the user either points at an existing
      // PARTNER_CONTACT (set as primary) or fills in a new one inline.
      if (formData.get(`kontak_mode_${i}`) === "existing") {
        const idKontak = Number(formData.get(`id_kontak_${i}`) ?? 0);
        if (idKontak) {
          await supabase.from("partner").update({ id_partner_contact: idKontak }).eq("id", idPartner);
        }
      } else {
        await simpanKontakBaru(supabase, idPartner, i, formData);
      }
      partnerIds.push(idPartner);
    }
  }

  const unik = [...new Set(partnerIds)];
  const pilihanLead = partnerIds[Number(formData.get("lead_index") ?? 0)];
  const lead = unik.includes(pilihanLead) ? pilihanLead : unik[0];

  if (unik.length) {
    await supabase.from("partner_pengusul").insert(
      unik.map((p) => ({
        id_proposal_dokumen: id,
        id_partner: p,
        is_lead: p === lead,
      })),
    );
  }

  // Section II — the proposing position. Without it a renewal request has
  // nowhere to be routed later, so it is recorded at creation rather than
  // reconstructed (BR-25).
  const idJabatanPengusul = Number(
    formData.get("id_jabatan_pengusul") ?? akun.id_jabatan,
  );
  if (idJabatanPengusul) {
    await supabase.from("pengusul").insert({
      id_proposal_dokumen: id,
      id_jabatan: idJabatanPengusul,
    });
  }

  const bidang = formData.getAll("bidang").map(Number);
  if (bidang.length) {
    await supabase
      .from("proposal_dokumen_bidang")
      .insert(bidang.map((b) => ({ id_proposal_dokumen: id, id_bidang_kerjasama: b })));
  }

  const agenda = formData.getAll("agenda").map(Number);
  if (agenda.length) {
    await supabase
      .from("proposal_dokumen_agenda")
      .insert(agenda.map((a) => ({ id_proposal_dokumen: id, id_agenda: a })));
  }

  // The Lingkup selection is stored as the explicit set of chosen units; a
  // parent partial state is derived at read time, never stored (BR-38, DR-09).
  const unit = formData.getAll("unit").map(Number);
  if (unit.length) {
    await supabase
      .from("proposal_dokumen_unit")
      .insert(unit.map((u) => ({ id_proposal_dokumen: id, id_unit: u })));
  }

  const jenis = formData.get("jenis_kerjasama");
  if (jenis === "MoU") {
    await supabase.from("proposal_dokumen_mou").insert({
      id_proposal_dokumen: id,
      ringkasan_kegiatan: String(formData.get("ringkasan_kegiatan") ?? ""),
    });
  } else {
    await supabase.from("proposal_dokumen_moa").insert({
      id_proposal_dokumen: id,
      hak_petra: String(formData.get("hak_petra") ?? ""),
      hak_calon_mitra: String(formData.get("hak_calon_mitra") ?? ""),
      kewajiban_petra: String(formData.get("kewajiban_petra") ?? ""),
      kewajiban_calon_mitra: String(formData.get("kewajiban_calon_mitra") ?? ""),
    });
  }

  // Upload Dokumen (Revisi V4 §4) — optional, stored in the same bucket the
  // laporan flow already uses for disposition attachments.
  const berkas = formData.get("upload_dokumen") as File | null;
  if (berkas && berkas.size > 0) {
    const path = `draft/${id}/${Date.now()}-${berkas.name}`;
    const { error: errUpload } = await supabase.storage
      .from("dokumen-kerjasama")
      .upload(path, berkas, { upsert: true });
    if (!errUpload) {
      await supabase.from("proposal_dokumen").update({ file_draft: path }).eq("id", id);
    }
  }

  await supabase.from("riwayat_approval").insert({
    id_proposal_dokumen: id,
    id_akun: akun.id,
    aksi: idEdit ? "revision_requested" : "created",
  });

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
 * required, the rest optional free text) and sets it as the partner's
 * primary contact.
 */
async function simpanKontakBaru(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  idPartner: number,
  i: number,
  formData: FormData,
) {
  const namaKontak = String(formData.get(`kontak_nama_${i}`) ?? "").trim();
  if (!namaKontak) return;
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
  if (error || !kontakBaru) return;
  await supabase.from("partner").update({ id_partner_contact: kontakBaru.id }).eq("id", idPartner);
}
