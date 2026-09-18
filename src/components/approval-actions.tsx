"use client";

import { useState, useTransition } from "react";
import { PilihBanyak } from "@/components/pilih-banyak";
import {
  aksiApproval,
  hapusTarget,
  reaktivasiPending,
  tambahTarget,
} from "@/lib/actions/workflow";
import { useKonfirmasi } from "@/components/konfirmasi-dialog";

type Aksi = "approve" | "reject" | "pending" | "revision";

/**
 * Pending and Revision must FEEL as different as they are (Design §4.4).
 *
 * The confirmation copy is doing real work here. Pending freezing the document
 * and restarting the entire approval is surprising, and an approver who
 * expected a gentle pause will be furious when every colleague has to approve
 * again. So it is said plainly, at the moment of choosing, in the words of the
 * consequence rather than a generic "Are you sure?" (Design §4.8).
 */
const KONFIRMASI: Record<Aksi, string | null> = {
  approve: null,
  revision: null,
  pending:
    "Menangguhkan dokumen ini akan MEMBEKUKAN prosesnya dan menghentikan " +
    "hitungan SLA. Ketika KUI mengaktifkannya kembali, SELURUH approval " +
    "diulang dari Tier 1 — termasuk tier yang sudah menyetujui. Lanjutkan?",
  reject:
    "Menolak akan MENGARSIPKAN dokumen ini secara permanen. Tidak ada jalan " +
    "kembali: melanjutkan kerja sama ini memerlukan proposal baru. Jika yang " +
    "Anda inginkan hanya perbaikan draf, gunakan Minta Revisi. Tolak dokumen?",
};

const LABEL: Record<Aksi, string> = {
  approve: "Setujui",
  reject: "Tolak",
  pending: "Tangguhkan",
  revision: "Minta Revisi",
};

export function PanelApproval({
  noTarget,
  idProposal,
  menungguRevisi = false,
}: {
  noTarget: number;
  idProposal: number;
  /** An open revision request: Approve waits for the submitter's upload. */
  menungguRevisi?: boolean;
}) {
  const [catatan, setCatatan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [menunggu, mulai] = useTransition();
  const { konfirmasi, dialog } = useKonfirmasi();

  async function jalankan(aksi: Aksi) {
    const pesan = KONFIRMASI[aksi];
    if (
      pesan &&
      !(await konfirmasi({
        judul: aksi === "reject" ? "Tolak dokumen ini?" : "Tangguhkan dokumen ini?",
        pesan,
        labelKonfirmasi: LABEL[aksi],
        nada: aksi === "reject" ? "bahaya" : "tangguh",
      }))
    )
      return;

    setGalat(null);
    mulai(async () => {
      const hasil = await aksiApproval(noTarget, aksi, catatan, idProposal);
      if (!hasil.ok) setGalat(hasil.pesan);
      else setCatatan("");
    });
  }

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
      <h3 className="mb-3 text-sm font-semibold">Tindakan Anda</h3>

      {menungguRevisi ? (
        <p
          className="mb-3 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--status-pending)", color: "var(--status-pending-text)" }}
        >
          Menunggu revisi dari pengusul. Anda dapat menyetujui setelah revisi
          diunggah — Anda akan menerima notifikasi.
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>
          Catatan (sebaiknya diisi bila meminta revisi atau menangguhkan)
        </span>
        <textarea
          rows={3}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={menunggu || menungguRevisi}
          onClick={() => jalankan("approve")}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--midnight)" }}
        >
          {LABEL.approve}
        </button>

        {/* Lightweight: the document stays exactly where it is (BR-07). */}
        <button
          type="button"
          disabled={menunggu || menungguRevisi}
          onClick={() => jalankan("revision")}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          {LABEL.revision}
        </button>

        {/* Heavyweight: visually weightier because its blast radius is larger. */}
        <button
          type="button"
          disabled={menunggu}
          onClick={() => jalankan("pending")}
          className="rounded-lg border-2 px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ borderColor: "var(--status-pending)", color: "var(--status-pending-text)" }}
        >
          {LABEL.pending}
        </button>

        {/* Terminal, so it wears the one colour reserved for irreversible acts. */}
        <button
          type="button"
          disabled={menunggu}
          onClick={() => jalankan("reject")}
          className="ml-auto rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--action-danger)" }}
        >
          {LABEL.reject}
        </button>
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        <strong>Minta Revisi</strong> memperbaiki draf di tempat dan dokumen
        tetap di tier ini. <strong>Tangguhkan</strong> membekukan dokumen dan
        mengulang approval dari Tier 1 saat diaktifkan kembali.
      </p>

      {galat ? (
        <p role="alert" className="mt-3 text-sm" style={{ color: "var(--action-danger)" }}>
          {galat}
        </p>
      ) : null}
      {dialog}
    </div>
  );
}

/**
 * Live disposition editing, allowed only while the document is in-disposition
 * (Design §4.7, BR-33).
 *
 * Both controls warn about the consequence before it happens: adding makes the
 * current tier wait for one more approver, and removing the last outstanding
 * one advances the document immediately. Neither is obvious from the button.
 */
export function EditorDisposisi({
  idProposal,
  jabatanTersedia,
  targetPending,
}: {
  idProposal: number;
  jabatanTersedia: { id: number; nama: string; tier: number | null }[];
  targetPending: { no: number; nama: string }[];
}) {
  const [pilih, setPilih] = useState<number[]>([]);
  // Remounts the picker to clear it once everything picked has been added.
  const [putaran, setPutaran] = useState(0);
  const [galat, setGalat] = useState<string | null>(null);
  const [menunggu, mulai] = useTransition();
  const { konfirmasi, dialog } = useKonfirmasi();

  function tambah() {
    if (!pilih.length) return;
    setGalat(null);
    mulai(async () => {
      for (const id of pilih) {
        const hasil = await tambahTarget(idProposal, id);
        if (!hasil.ok) return setGalat(hasil.pesan);
      }
      setPilih([]);
      setPutaran((x) => x + 1);
    });
  }

  async function hapus(noTarget: number, nama: string) {
    if (
      !(await konfirmasi({
        judul: "Hapus approver?",
        pesan:
          `Hapus ${nama} dari daftar approver? Jika beliau adalah penghambat ` +
          `terakhir di tier ini, dokumen langsung maju ke tier berikutnya.`,
        labelKonfirmasi: "Hapus",
        nada: "bahaya",
      }))
    )
      return;
    setGalat(null);
    mulai(async () => {
      const hasil = await hapusTarget(noTarget, idProposal);
      if (!hasil.ok) setGalat(hasil.pesan);
    });
  }

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
      <h3 className="mb-1 text-sm font-semibold">Ubah Daftar Approver</h3>
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
        Menambah approver membuat tier berjalan menunggu satu orang lagi.
        Approver yang sudah menyetujui tidak dapat dihapus.
      </p>

      <div className="space-y-2">
        <PilihBanyak
          key={putaran}
          opsi={jabatanTersedia.map((j) => ({ id: j.id, label: j.nama }))}
          onChange={setPilih}
        />
        <button
          type="button"
          disabled={menunggu || !pilih.length}
          onClick={tambah}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          Tambah
        </button>
      </div>

      {targetPending.length ? (
        <ul className="mt-3 space-y-1">
          {targetPending.map((t) => (
            <li key={t.no} className="flex items-center justify-between text-sm">
              <span>{t.nama}</span>
              <button
                type="button"
                disabled={menunggu}
                onClick={() => hapus(t.no, t.nama)}
                className="text-xs underline disabled:opacity-60"
                style={{ color: "var(--action-danger)" }}
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {galat ? (
        <p role="alert" className="mt-3 text-sm" style={{ color: "var(--action-danger)" }}>
          {galat}
        </p>
      ) : null}
      {dialog}
    </div>
  );
}

/** Reactivating a frozen document, which restarts the approval (BR-06). */
export function TombolReaktivasi({ idProposal }: { idProposal: number }) {
  const [galat, setGalat] = useState<string | null>(null);
  const [menunggu, mulai] = useTransition();
  const { konfirmasi, dialog } = useKonfirmasi();

  return (
    <div>
      <button
        type="button"
        disabled={menunggu}
        onClick={async () => {
          if (
            !(await konfirmasi({
              judul: "Aktifkan kembali dokumen ini?",
              pesan:
                "Mengaktifkan kembali dokumen ini akan mengulang SELURUH approval " +
                "dari Tier 1. Persetujuan yang sudah diberikan pada ronde " +
                "sebelumnya tetap tercatat, tetapi tidak lagi berlaku. Lanjutkan?",
              labelKonfirmasi: "Aktifkan Kembali",
              nada: "tangguh",
            }))
          )
            return;
          setGalat(null);
          mulai(async () => {
            const hasil = await reaktivasiPending(idProposal);
            if (!hasil.ok) setGalat(hasil.pesan);
          });
        }}
        className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--status-pending-text)" }}
      >
        Aktifkan Kembali
      </button>
      {galat ? (
        <p role="alert" className="mt-2 text-sm" style={{ color: "var(--action-danger)" }}>
          {galat}
        </p>
      ) : null}
      {dialog}
    </div>
  );
}
