import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { akunSaatIni, isIO, supabaseServer } from "@/lib/supabase/server";
import { aktivasiDokumen, kirimDisposisi, tandaiSiapTtd } from "@/lib/actions/workflow";
import { arsipkanDokumen } from "@/lib/actions/pembaruan";
import { StatusPill } from "@/components/status-pill";
import { SlaFlag } from "@/components/sla-flag";
import { SubmitButton } from "@/components/submit-button";
import { PilihBanyak } from "@/components/pilih-banyak";
import { TERIMA_PDF, unggahBerkas } from "@/lib/unggah";
import {
  EditorDisposisi,
  PanelApproval,
  TombolReaktivasi,
} from "@/components/approval-actions";

export const dynamic = "force-dynamic";

const GLIF: Record<string, string> = {
  approved: "✓",
  pending_action: "●",
  waiting: "○",
  rejected: "✕",
  removed: "–",
};

const KETERANGAN: Record<string, string> = {
  approved: "Disetujui",
  pending_action: "Menunggu",
  waiting: "Belum dibuka",
  rejected: "Ditolak",
  removed: "Dihapus",
};

function waktuLokal(nilai: string | null) {
  if (!nilai) return "—";
  return new Date(nilai).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function DetailDokumen({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idProposal = Number(id);
  const supabase = await supabaseServer();

  // Queries run in waves: everything in a wave depends only on earlier waves,
  // so each wave costs one round trip instead of one per query.
  const [
    akun,
    { data: proposal },
    { data: disposisi },
    { data: beku },
    { data: riwayat },
    { data: jabatanApprover },
    { data: prefill },
    { data: penerus },
  ] = await Promise.all([
    akunSaatIni(),
    supabase
      .from("proposal_dokumen")
      .select(
        `id, jenis_kerjasama, status_proposal, is_pencatatan_langsung, periode_kerjasama,
         sifat_periode_kerjasama, tujuan_kerjasama, manfaat_bagi_petra,
         manfaat_bagi_mitra, informasi_tambahan, waktu_proposal_dokumen,
         waktu_disetujui, waktu_aktif, id_dokumen_sebelumnya, file_draft,
         partner_pengusul ( is_lead, partner ( nama, kota, is_international ) ),
         proposal_dokumen_unit ( unit ( id, nama ) ),
         dokumen_kerja_sama ( no, no_dokumen, status, alasan_arsip,
                              tanggal_mulai, tanggal_berakhir )`,
      )
      .eq("id", idProposal)
      .maybeSingle(),
    // The live round is the highest one; earlier rounds are history left behind
    // by a Pending reset (BR-06).
    supabase
      .from("disposisi")
      .select("no, round_ke, pesan_disposisi, waktu_disposisi, jenis_disposisi")
      .eq("id_proposal_dokumen", idProposal)
      .eq("jenis_disposisi", "approval")
      .order("round_ke", { ascending: false }),
    supabase
      .from("pending_periods")
      .select("id, mulai")
      .eq("id_proposal_dokumen", idProposal)
      .is("selesai", null)
      .maybeSingle(),
    supabase
      .from("riwayat_approval")
      .select("id, aksi, catatan, tanggal, waktu")
      .eq("id_proposal_dokumen", idProposal)
      .order("tanggal", { ascending: false })
      .order("waktu", { ascending: false })
      .limit(50),
    supabase
      .from("jabatan")
      .select("id, nama, tier_disposisi")
      .not("tier_disposisi", "is", null)
      .order("tier_disposisi"),
    // On a Perpanjangan the approver list starts prefilled from the positions
    // that approved the predecessor — editable, and empty for a legacy document
    // with no approval history to prefill from (PRD §9.6).
    supabase.rpc("jabatan_prefill_perpanjangan", { p_id_proposal: idProposal }),
    // Renewal chain, linked both ways so a document's history is reachable from
    // either end (Design §5.8).
    supabase
      .from("v_daftar_dokumen")
      .select("id_proposal, no_dokumen")
      .eq("id_dokumen_sebelumnya", idProposal)
      .maybeSingle(),
  ]);

  // RLS already decided this: a row the account may not read simply is not
  // here, so there is nothing extra to check (AR-03).
  if (!proposal) notFound();

  const dok: any =
    (proposal as any).dokumen_kerja_sama?.[0] ?? (proposal as any).dokumen_kerja_sama;

  const ronde = disposisi?.[0]?.round_ke ?? null;
  const noDisposisiRonde = (disposisi ?? [])
    .filter((d) => d.round_ke === ronde)
    .map((d) => d.no);

  const [{ data: target }, { data: pendahulu }] = await Promise.all([
    supabase
      .from("disposisi_target")
      .select(
        `no, tier, status, waktu_unlock, waktu_resolusi, durasi_hari_kerja,
         status_sla, no_disposisi, jabatan ( id, nama )`,
      )
      .in("no_disposisi", noDisposisiRonde.length ? noDisposisiRonde : [-1])
      .order("tier"),
    proposal.id_dokumen_sebelumnya
      ? supabase
          .from("v_daftar_dokumen")
          .select("id_proposal, no_dokumen")
          .eq("id_proposal", proposal.id_dokumen_sebelumnya)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const io = isIO(akun);
  // A directly-recorded document has no approval chain at all (Revisi V8 §1).
  // Every other approval block here already self-hides -- it is Disetujui, so
  // dalamDisposisi and belumDidisposisi are false, it always has a dokumen_
  // kerja_sama row so the activation CTA is off, and it has no disposisi_target
  // so targetSaya is null. Only the tier progress below renders unconditionally.
  const langsung = Boolean((proposal as any).is_pencatatan_langsung);

  const dalamDisposisi = [
    "Diproses",
    "Disposisi - Tier 1",
    "Disposisi - Tier 2",
    "Disposisi - Tier 3",
  ].includes(proposal.status_proposal as string);

  // "Approver" is derived, never a stored role: it is simply whether an open
  // target on this document points at my position (AR-01).
  const targetSaya = (target ?? []).find(
    (t: any) => t.jabatan?.id === akun?.id_jabatan && t.status === "pending_action",
  );

  const { data: menungguRevisi } = targetSaya
    ? await supabase.rpc("revisi_terbuka", { p_no_target: targetSaya.no })
    : { data: false };

  const sudahJadiTarget = new Set((target ?? []).map((t: any) => t.jabatan?.id));

  const prefillSet = new Set(
    ((prefill ?? []) as { jabatan_prefill_perpanjangan: number }[] | number[]).map((x: any) =>
      typeof x === "number" ? x : x.jabatan_prefill_perpanjangan,
    ),
  );

  const belumDidisposisi =
    io && ["Diajukan", "Diproses"].includes(proposal.status_proposal as string);

  async function kirimDisposisiAwal(formData: FormData) {
    "use server";
    const dipilih = formData.getAll("jabatan").map(Number);
    if (dipilih.length === 0) return;
    await kirimDisposisi(
      idProposal,
      dipilih,
      String(formData.get("pesan") ?? ""),
    );
  }

  async function tandaiSiapTtdAksi() {
    "use server";
    await tandaiSiapTtd(idProposal);
    revalidatePath(`/kerja-sama/${idProposal}`);
  }

  async function aktifkan(formData: FormData) {
    "use server";
    const akhir = String(formData.get("tanggal_berakhir") ?? "");
    // The signed document (Revisi V7 §3).
    let uploadDokumen: string | null = null;
    const berkas = formData.get("berkas") as File | null;
    if (berkas && berkas.size > 0) {
      const unggah = await unggahBerkas(await supabaseServer(), `dokumen/${idProposal}`, berkas, TERIMA_PDF);
      if ("pesan" in unggah) throw new Error(unggah.pesan);
      uploadDokumen = unggah.path;
    }
    await aktivasiDokumen(idProposal, {
      // Typed by IO, never generated and never format-checked (BR-22).
      noDokumen: String(formData.get("no_dokumen") ?? ""),
      tanggalTandaTangan: String(formData.get("tanggal_tanda_tangan") ?? ""),
      tanggalMulai: String(formData.get("tanggal_mulai") ?? ""),
      // Auto Renewed carries no end date at all (BR-11).
      tanggalBerakhir: akhir === "" ? null : akhir,
      folderKui: String(formData.get("folder_kui") ?? "") || null,
      noBerkasDikti: String(formData.get("no_berkas_dikti") ?? "") || null,
      uploadDokumen,
    });
    revalidatePath(`/kerja-sama/${idProposal}`);
  }

  async function akhiriLebihAwal(formData: FormData) {
    "use server";
    await arsipkanDokumen(
      Number(formData.get("no")),
      "terminated_early",
      idProposal,
    );
  }

  // Empty tiers are omitted, never rendered blank (Design §4.3).
  const tierTampil = [1, 2, 3].filter((t) =>
    (target ?? []).some((x: any) => x.tier === t && x.status !== "removed"),
  );

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h1 className="no-dokumen text-lg font-semibold" style={{ color: "var(--midnight)" }}>
            {dok?.no_dokumen ?? `Draf #${proposal.id}`}
          </h1>
          <StatusPill
            status={dok?.status ?? (proposal.status_proposal as string)}
            alasanArsip={dok?.alasan_arsip}
          />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {proposal.jenis_kerjasama}
          </span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {(proposal as any).partner_pengusul
            ?.map((p: any) => p.partner?.nama)
            .filter(Boolean)
            .join(", ") || "Mitra belum dipilih"}
        </p>
        <Link href={`/kerja-sama/${idProposal}/laporan` as any} className="text-xs underline">
          Lihat laporan dokumen ini →
        </Link>
      </header>

      {beku ? (
        <div className="mb-6 rounded-xl border-2 p-4" style={{ borderColor: "var(--status-pending)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--status-pending-text)" }}>
            Dokumen ditangguhkan sejak {waktuLokal(beku.mulai)}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Hitungan SLA berhenti selama dokumen dibekukan. Saat KUI
            mengaktifkannya kembali, seluruh approval diulang dari Tier 1.
          </p>
          {io ? (
            <div className="mt-3">
              <TombolReaktivasi idProposal={idProposal} />
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-3 text-sm font-semibold">Detail</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--text-secondary)" }}>Periode</dt>
              <dd className="text-right">{proposal.periode_kerjasama ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--text-secondary)" }}>Sifat periode</dt>
              <dd className="text-right">{proposal.sifat_periode_kerjasama ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--text-secondary)" }}>Diajukan</dt>
              <dd className="text-right">{waktuLokal(proposal.waktu_proposal_dokumen)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--text-secondary)" }}>Disetujui</dt>
              <dd className="text-right">{waktuLokal(proposal.waktu_disetujui)}</dd>
            </div>
            {dok?.tanggal_berakhir ? (
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-secondary)" }}>Berakhir</dt>
                <dd className="text-right">{dok.tanggal_berakhir}</dd>
              </div>
            ) : proposal.sifat_periode_kerjasama === "Auto Renewed" ? (
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-secondary)" }}>Berakhir</dt>
                <dd className="text-right" style={{ color: "var(--text-muted)" }}>
                  Auto Renewed — tanpa tanggal berakhir
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-3 text-sm font-semibold">Lingkup Kerja Sama</h2>
          <div className="flex flex-wrap gap-1.5">
            {(proposal as any).proposal_dokumen_unit?.length ? (
              (proposal as any).proposal_dokumen_unit.map((u: any) => (
                <span
                  key={u.unit?.id}
                  className="rounded-full border px-2 py-0.5 text-xs"
                  style={{ borderColor: "var(--border)" }}
                >
                  {u.unit?.nama}
                </span>
              ))
            ) : (
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                Belum ada unit dipilih.
              </span>
            )}
          </div>
        </div>
      </section>

      {/*
        The tier progress indicator carries the most explanatory weight in the
        whole system (Design §4.3): what state the document is in, and who it
        is waiting on.
      */}
      {!langsung ? (
      <section
            className="mb-6 rounded-xl border bg-white p-4"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Approval</h2>
              {ronde && ronde > 1 ? (
                <span className="text-xs" style={{ color: "var(--status-pending-text)" }}>
                  Ronde ke-{ronde} — diulang setelah penangguhan
                </span>
              ) : null}
            </div>

            {tierTampil.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Belum ada disposisi approval untuk dokumen ini.
              </p>
            ) : (
              <div className="space-y-4">
                {tierTampil.map((tier) => (
                  <div key={tier}>
                    <div
                      className="mb-1 text-xs font-semibold"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      TIER {tier}
                    </div>
                    <ul className="space-y-1">
                      {(target ?? [])
                        .filter((t: any) => t.tier === tier && t.status !== "removed")
                        .map((t: any) => (
                          <li key={t.no} className="flex items-baseline justify-between gap-3 text-sm">
                            <span>
                              <span aria-hidden className="mr-2">
                                {GLIF[t.status]}
                              </span>
                              {t.jabatan?.nama}
                            </span>
                            <span className="flex items-baseline gap-3 whitespace-nowrap">
                              <span style={{ color: "var(--text-secondary)" }}>
                                {KETERANGAN[t.status]}
                              </span>
                              {t.status === "pending_action" ? (
                                <SlaFlag
                                  hari={t.durasi_hari_kerja}
                                  bendera={t.status_sla}
                                  beku={Boolean(beku)}
                                />
                              ) : t.status === "approved" ? (
                                <SlaFlag hari={t.durasi_hari_kerja} bendera={t.status_sla} />
                              ) : null}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
      ) : null}

          {targetSaya ? (
            <section className="mb-6">
              <PanelApproval
                noTarget={targetSaya.no}
                idProposal={idProposal}
                menungguRevisi={Boolean(menungguRevisi)}
              />
            </section>
          ) : null}

          {belumDidisposisi ? (
            <section
              className="mb-6 rounded-xl border bg-white p-4"
              style={{ borderColor: "var(--border)" }}
            >
              <h2 className="mb-1 text-sm font-semibold">Kirim Disposisi Approval</h2>
              <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Pilih jabatan yang harus menyetujui. Urutan persetujuan tetap
                mengikuti tier di master jabatan.
                {prefillSet.size > 0
                  ? " Daftar ini sudah tercentang dari approval dokumen sebelumnya — masih dapat diubah."
                  : ""}
              </p>

              <form action={kirimDisposisiAwal}>
                {/* One searchable list; tiers still order the approval (Revisi V7 §9). */}
                <div className="mb-3">
                  <PilihBanyak
                    name="jabatan"
                    opsi={(jabatanApprover ?? []).map((j) => ({ id: j.id, label: j.nama }))}
                    awal={(jabatanApprover ?? []).filter((j) => prefillSet.has(j.id)).map((j) => j.id)}
                  />
                </div>

                <label className="mb-3 block text-sm">
                  <span className="mb-1 block font-medium">Pesan disposisi</span>
                  <input
                    name="pesan"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>

                <SubmitButton
                  labelMenunggu="Mengirim…"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                  style={{ background: "var(--midnight)" }}
                >
                  Kirim Disposisi
                </SubmitButton>
              </form>
            </section>
          ) : null}

          {io && proposal.status_proposal === "Disetujui" && !dok ? (
            <section
              className="mb-6 rounded-xl border-2 bg-white p-4"
              style={{ borderColor: "var(--status-approved)" }}
            >
              <h2 className="mb-1 text-sm font-semibold">Tandai Siap TTD</h2>
              <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Dokumen sudah disetujui semua disposisi. Tandai setelah dicetak
                dan memasuki proses tanda tangan (Revisi V8 §2).
              </p>
              <form action={tandaiSiapTtdAksi}>
                <SubmitButton
                  labelMenunggu="Menandai…"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                  style={{ background: "var(--midnight)" }}
                >
                  Tandai Siap TTD
                </SubmitButton>
              </form>
            </section>
          ) : null}

          {io && proposal.status_proposal === "Siap TTD" && !dok ? (
            <section
              className="mb-6 rounded-xl border-2 bg-white p-4"
              style={{ borderColor: "var(--status-approved)" }}
            >
              <h2 className="mb-1 text-sm font-semibold">Aktivasi Dokumen</h2>
              <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Nomor dokumen diketik oleh KUI, tidak pernah dibuat otomatis.
                {proposal.sifat_periode_kerjasama === "Auto Renewed"
                  ? " Dokumen Auto Renewed tidak memiliki tanggal berakhir — biarkan kosong."
                  : ""}
              </p>
              <form action={aktifkan} className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">No. Dokumen (*)</span>
                  <input
                    name="no_dokumen"
                    required
                    className="no-dokumen w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Tanggal Tanda Tangan (*)</span>
                  <input
                    type="date"
                    name="tanggal_tanda_tangan"
                    required
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Tanggal Mulai (*)</span>
                  <input
                    type="date"
                    name="tanggal_mulai"
                    required
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>
                {proposal.sifat_periode_kerjasama !== "Auto Renewed" ? (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Tanggal Berakhir</span>
                    <input
                      type="date"
                      name="tanggal_berakhir"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)" }}
                    />
                  </label>
                ) : null}
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Folder KUI</span>
                  <input
                    name="folder_kui"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">No. Berkas Dikti</span>
                  <input
                    name="no_berkas_dikti"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium">Upload Dokumen (PDF bertanda tangan)</span>
                  <input
                    type="file"
                    name="berkas"
                    accept={TERIMA_PDF}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>
                <div className="sm:col-span-2">
                  <SubmitButton
                    labelMenunggu="Memproses…"
                    className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                    style={{ background: "var(--status-active)" }}
                  >
                    Aktifkan Dokumen
                  </SubmitButton>
                  {proposal.id_dokumen_sebelumnya ? (
                    <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      Dokumen ini adalah perpanjangan. Saat diaktifkan, dokumen
                      pendahulunya otomatis diarsipkan sebagai digantikan oleh
                      pembaruan — dalam satu transaksi yang sama.
                    </p>
                  ) : null}
                </div>
              </form>
            </section>
          ) : null}

          {io && dalamDisposisi ? (
            <section className="mb-6">
              <EditorDisposisi
                idProposal={idProposal}
                jabatanTersedia={(jabatanApprover ?? [])
                  .filter((j) => !sudahJadiTarget.has(j.id))
                  .map((j) => ({ id: j.id, nama: j.nama, tier: j.tier_disposisi }))}
                targetPending={(target ?? [])
                  .filter((t: any) => t.status === "waiting" || t.status === "pending_action")
                  .map((t: any) => ({ no: t.no, nama: t.jabatan?.nama ?? `Target ${t.no}` }))}
              />
            </section>
          ) : null}

          {io && dok?.status && ["Aktif", "Akan Berakhir"].includes(dok.status) ? (
            <section
              className="mb-6 rounded-xl border bg-white p-4"
              style={{ borderColor: "var(--border)" }}
            >
              <h2 className="mb-1 text-sm font-semibold">Akhiri Lebih Awal</h2>
              <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Dokumen menjadi tidak aktif sebelum tanggal berakhirnya, dengan
                alasan tercatat. Dokumen tidak pernah dihapus dan tetap dapat dibaca
                selamanya.
              </p>
              <form action={akhiriLebihAwal}>
                <input type="hidden" name="no" value={dok.no} />
                <SubmitButton
                  labelMenunggu="Memproses…"
                  className="rounded-lg border px-4 py-2 text-sm font-medium"
                  style={{ borderColor: "var(--action-danger)", color: "var(--action-danger)" }}
                >
                  Akhiri kerja sama ini
                </SubmitButton>
              </form>
            </section>
          ) : null}

      {/* The renewal chain, navigable from either end. */}
      {pendahulu || penerus ? (
        <section
          className="mb-6 rounded-xl border bg-white p-4"
          style={{ borderColor: "var(--renewal-request)" }}
        >
          <h2 className="mb-2 text-sm font-semibold">Rantai Pembaruan</h2>
          <ul className="space-y-1 text-sm">
            {pendahulu ? (
              <li>
                Menggantikan{" "}
                <Link href={`/kerja-sama/${pendahulu.id_proposal}`} className="underline">
                  <span className="no-dokumen">{pendahulu.no_dokumen ?? "dokumen sebelumnya"}</span>
                </Link>
              </li>
            ) : null}
            {penerus ? (
              <li>
                Digantikan oleh{" "}
                <Link href={`/kerja-sama/${penerus.id_proposal}`} className="underline">
                  <span className="no-dokumen">{penerus.no_dokumen ?? "proposal perpanjangan"}</span>
                </Link>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="mb-3 text-sm font-semibold">Riwayat</h2>
        <ul className="space-y-2 text-sm">
          {(riwayat ?? []).map((r: any) => (
            <li key={r.id} className="flex gap-3">
              <span className="whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                {r.tanggal} {String(r.waktu).slice(0, 5)}
              </span>
              <span>
                <strong>{r.aksi}</strong>
                {r.catatan ? (
                  <span style={{ color: "var(--text-secondary)" }}> — {r.catatan}</span>
                ) : null}
              </span>
            </li>
          ))}
          {!riwayat?.length ? (
            <li style={{ color: "var(--text-muted)" }}>Belum ada aktivitas.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
