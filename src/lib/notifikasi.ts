/**
 * Notification vocabulary, shared by the /notifikasi page and the floating
 * bell's popup so the two can never drift apart (they render the same rows).
 */

export type Notifikasi = {
  id: number;
  jenis_notifikasi: string;
  isi: string | null;
  waktu_kirim: string;
  waktu_dibaca: string | null;
  id_proposal_dokumen: number | null;
  no_dokumen_kerjasama: number | null;
};

/** The columns both readers select. One list, so neither forgets a field. */
export const KOLOM_NOTIFIKASI =
  "id, jenis_notifikasi, isi, waktu_kirim, waktu_dibaca, id_proposal_dokumen, no_dokumen_kerjasama";

export const JUDUL_NOTIFIKASI: Record<string, string> = {
  disposition_assigned: "Dokumen menunggu persetujuan Anda",
  renewal_request_assigned: "Permintaan pembaruan untuk unit Anda",
  approved: "Disetujui",
  rejected: "Ditolak",
  pending: "Dokumen ditangguhkan",
  revision_requested: "Permintaan revisi",
  revision_submitted: "Revisi diunggah — silakan tinjau",
  reactivated: "Diaktifkan kembali — approval diulang dari Tier 1",
  expiring_soon: "Dokumen akan berakhir",
  sla_yellow: "Melewati batas waktu",
  sla_red: "Jauh melewati batas waktu",
  sla_eskalasi: "Eskalasi: approver belum menindak",
  renewal_request_sla: "Batas waktu permintaan pembaruan",
  evaluation_submitted: "Evaluasi masuk",
  split_decision: "Evaluasi berbeda — perlu keputusan",
  renewal_open: "Evaluasi lanjut — unggah dokumen perpanjangan",
  renewal_ready: "Evaluasi lanjut — mulai proses pembaruan",
  renewal_terminated: "Evaluasi tidak dilanjutkan",
};

/** Colour carries no meaning alone; each of these also reads as a word. */
export const WARNA_NOTIFIKASI: Record<string, string> = {
  sla_red: "var(--sla-red)",
  sla_eskalasi: "var(--sla-red)",
  sla_yellow: "var(--sla-yellow)",
  pending: "var(--status-pending)",
  rejected: "var(--action-danger)",
  split_decision: "var(--action-danger)",
  renewal_open: "var(--status-active)",
  renewal_ready: "var(--status-active)",
  expiring_soon: "var(--sla-yellow)",
  renewal_request_assigned: "var(--renewal-request)",
};

// Evaluation outcomes open the Pembaruan tab, where the files and actions are.
const KE_PEMBARUAN = new Set([
  "split_decision",
  "renewal_open",
  "renewal_ready",
  "renewal_terminated",
]);

const KE_DISPOSISI = new Set([
  "disposition_assigned",
  "revision_requested",
  "revision_submitted",
]);

/**
 * Where a notice leads. A notification that does not open the document it is
 * about is just noise, so every one that carries an id gets a destination.
 */
export function tautanNotifikasi(n: Notifikasi): string | null {
  if (n.id_proposal_dokumen) {
    if (KE_DISPOSISI.has(n.jenis_notifikasi)) {
      return `/kerja-sama/${n.id_proposal_dokumen}/laporan?tab=disposisi`;
    }
    if (KE_PEMBARUAN.has(n.jenis_notifikasi)) {
      return `/kerja-sama/${n.id_proposal_dokumen}/laporan?tab=pembaruan`;
    }
    return `/kerja-sama/${n.id_proposal_dokumen}`;
  }
  // Renewal notices carry only the document number; /pembaruan/[no]
  // redirects to its Pembaruan tab.
  if (n.no_dokumen_kerjasama) return `/pembaruan/${n.no_dokumen_kerjasama}`;
  return null;
}

export const waktuNotifikasi = (nilai: string) =>
  new Date(nilai).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
