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

  const { data: proposal, error } = await supabase
    .from("proposal_dokumen")
    .insert({
      jenis_kerjasama: formData.get("jenis_kerjasama"),
      periode_kerjasama: formData.get("periode_kerjasama") || null,
      sifat_periode_kerjasama: formData.get("sifat_periode_kerjasama") || null,
      tujuan_kerjasama: formData.get("tujuan_kerjasama") || null,
      manfaat_bagi_petra: formData.get("manfaat_bagi_petra") || null,
      // One shared statement, even on a multi-partner document (Q1).
      manfaat_bagi_mitra: formData.get("manfaat_bagi_mitra") || null,
      informasi_tambahan: formData.get("informasi_tambahan") || null,
      id_akun_pembuat: akun.id,
      status_proposal: "Draft",
    })
    .select("id")
    .single();

  if (error || !proposal) {
    throw new Error(`Proposal gagal disimpan: ${error?.message}`);
  }

  const id = proposal.id as number;

  // A partner is always recorded through the join table, even when there is
  // exactly one. There is no shortcut partner column on the proposal (DR-01).
  //
  // Multi-partner is rare but real: Section I repeats while Section III stays
  // shared, and exactly one partner is the lead — the one whose evaluation is
  // collected at renewal (BR-29). The lead defaults to the first selected, so a
  // single-partner document needs no extra decision.
  const semuaPartner = formData.getAll("id_partner").map(Number).filter(Boolean);
  const unik = [...new Set(semuaPartner)];
  const pilihanLead = Number(formData.get("id_partner_lead") ?? 0);
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

  await supabase.from("riwayat_approval").insert({
    id_proposal_dokumen: id,
    id_akun: akun.id,
    aksi: "created",
  });

  if (ajukan) {
    const { error: galat } = await supabase.rpc("ajukan_proposal", {
      p_id_proposal: id,
    });
    if (galat) throw new Error(`Pengajuan ditolak: ${galat.message}`);
  }

  revalidatePath("/kerja-sama");
  redirect(`/kerja-sama/${id}`);
}
