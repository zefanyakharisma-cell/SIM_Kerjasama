import { notFound } from "next/navigation";
import { akunSaatIni, isIO, supabaseServer } from "@/lib/supabase/server";
import { StatusPill } from "@/components/status-pill";
import { SlaFlag } from "@/components/sla-flag";
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
  const akun = await akunSaatIni();

  const { data: proposal } = await supabase
    .from("proposal_dokumen")
    .select(
      `id, jenis_kerjasama, status_proposal, periode_kerjasama,
       sifat_periode_kerjasama, tujuan_kerjasama, manfaat_bagi_petra,
       manfaat_bagi_mitra, informasi_tambahan, waktu_proposal_dokumen,
       waktu_disetujui, waktu_aktif,
       partner_pengusul ( is_lead, partner ( nama, kota, is_international ) ),
       proposal_dokumen_unit ( unit ( id, nama ) ),
       dokumen_kerja_sama ( no, no_dokumen, status, alasan_arsip,
                            tanggal_mulai, tanggal_berakhir )`,
    )
    .eq("id", idProposal)
    .maybeSingle();

  // RLS already decided this: a row the account may not read simply is not
  // here, so there is nothing extra to check (AR-03).
  if (!proposal) notFound();

  const dok: any =
    (proposal as any).dokumen_kerja_sama?.[0] ?? (proposal as any).dokumen_kerja_sama;

  // The live round is the highest one; earlier rounds are history left behind
  // by a Pending reset (BR-06).
  const { data: disposisi } = await supabase
    .from("disposisi")
    .select("no, round_ke, pesan_disposisi, waktu_disposisi, jenis_disposisi")
    .eq("id_proposal_dokumen", idProposal)
    .eq("jenis_disposisi", "approval")
    .order("round_ke", { ascending: false });

  const ronde = disposisi?.[0]?.round_ke ?? null;
  const noDisposisiRonde = (disposisi ?? [])
    .filter((d) => d.round_ke === ronde)
    .map((d) => d.no);

  const { data: target } = await supabase
    .from("disposisi_target")
    .select(
      `no, tier, status, waktu_unlock, waktu_resolusi, durasi_hari_kerja,
       status_sla, no_disposisi, jabatan ( id, nama )`,
    )
    .in("no_disposisi", noDisposisiRonde.length ? noDisposisiRonde : [-1])
    .order("tier");

  const { data: beku } = await supabase
    .from("pending_periods")
    .select("id, mulai")
    .eq("id_proposal_dokumen", idProposal)
    .is("selesai", null)
    .maybeSingle();

  const { data: riwayat } = await supabase
    .from("riwayat_approval")
    .select("id, aksi, catatan, tanggal, waktu")
    .eq("id_proposal_dokumen", idProposal)
    .order("tanggal", { ascending: false })
    .order("waktu", { ascending: false })
    .limit(50);

  const io = isIO(akun);
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

  const { data: jabatanApprover } = await supabase
    .from("jabatan")
    .select("id, nama, tier_disposisi")
    .not("tier_disposisi", "is", null)
    .order("tier_disposisi");

  const sudahJadiTarget = new Set((target ?? []).map((t: any) => t.jabatan?.id));

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
      </header>

      {beku ? (
        <div
          className="mb-6 rounded-xl border-2 p-4"
          style={{ borderColor: "var(--status-pending)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--status-pending)" }}>
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
      <section
        className="mb-6 rounded-xl border bg-white p-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Approval</h2>
          {ronde && ronde > 1 ? (
            <span className="text-xs" style={{ color: "var(--status-pending)" }}>
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

      {targetSaya ? (
        <section className="mb-6">
          <PanelApproval noTarget={targetSaya.no} idProposal={idProposal} />
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
