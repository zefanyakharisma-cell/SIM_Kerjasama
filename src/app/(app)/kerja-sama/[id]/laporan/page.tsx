import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isIO, akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { kirimDisposisi, unggahRevisi } from "@/lib/actions/workflow";
import { StatusPill } from "@/components/status-pill";
import { SlaFlag } from "@/components/sla-flag";
import { SubmitButton } from "@/components/submit-button";
import { EditorDisposisi, PanelApproval, TombolReaktivasi } from "@/components/approval-actions";
import { PembaruanPanel } from "@/components/pembaruan-panel";
import { PilihBanyak } from "@/components/pilih-banyak";
import { TERIMA_PDF_WORD, bisaPratinjau, unggahBerkas } from "@/lib/unggah";
import { Tabs } from "@/components/tabs";

/**
 * Proposal Kerja Sama — Report (revision V3 §2.a). Reached from the
 * magnifying glass on the Proposal Kerja Sama / Kerja Sama Aktif lists.
 * Tabs: Detail, Approval, History, Disposisi (IO only) and Pembaruan (only
 * once the document is expiring or a renewal is under way).
 *
 * The workflow mutations that used to live only on `/kerja-sama/[id]`
 * (approval actions, live disposition editing, the initial dispatch) are
 * surfaced here too, tab-scoped, so the report is a complete stop rather
 * than a read-only stub that sends IO elsewhere to act.
 */
export const dynamic = "force-dynamic";

const TAB = {
  detail: "Detail",
  approval: "Approval",
  history: "History",
  disposisi: "Disposisi",
  pembaruan: "Pembaruan",
} as const;
type TabKey = keyof typeof TAB;

const gaya = { borderColor: "var(--border)" };

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

/** [Jabatan], [Nama Unit], [action], [jenis dokumen], [nama partner], pada [tanggal], [waktu] (revision V3 §2.a.3). */
const AKSI_LABEL: Record<string, string> = {
  created: "membuat proposal",
  submitted: "mengajukan",
  dispositioned: "mendisposisikan",
  approve: "menyetujui",
  reject: "menolak",
  pending: "menangguhkan",
  revision_requested: "meminta revisi",
  revision_submitted: "mengunggah revisi",
  reactivated: "mengaktifkan kembali",
  disposition_added: "menambah approver",
  disposition_removed: "menghapus approver",
  activated: "mengaktifkan dokumen",
  archived: "mengarsipkan dokumen",
  renewal_requested: "mengirim disposisi evaluasi pembaruan",
  evaluation_submitted: "mengirim evaluasi",
  renewal_decided: "memutuskan pembaruan",
  evaluation_reopened: "membuka ulang evaluasi",
};

function Tanggal({ nilai }: { nilai: string | null | undefined }) {
  if (!nilai) return <>—</>;
  return <>{new Date(nilai).toLocaleDateString("id-ID", { dateStyle: "medium" })}</>;
}

function Kartu({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={gaya}>
      <h2 className="mb-3 text-sm font-semibold">{judul}</h2>
      {children}
    </div>
  );
}

function Baris({ label, nilai }: { label: string; nilai: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt style={{ color: "var(--text-secondary)" }}>{label}</dt>
      <dd className="text-right">{nilai ?? "—"}</dd>
    </div>
  );
}

export default async function LaporanDokumen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; galat?: string }>;
}) {
  const { id } = await params;
  const { tab: tabMentah, galat } = await searchParams;
  const tab: TabKey = tabMentah && Object.hasOwn(TAB, tabMentah) ? (tabMentah as TabKey) : "detail";
  const idProposal = Number(id);
  const supabase = await supabaseServer();
  const akun = await akunSaatIni();
  const io = isIO(akun);

  const { data: proposal } = await supabase
    .from("proposal_dokumen")
    .select(
      `id, jenis_kerjasama, status_proposal, tujuan_kerjasama, manfaat_bagi_petra,
       manfaat_bagi_mitra, id_dokumen_sebelumnya, file_draft, id_akun_pembuat,
       partner_pengusul ( partner ( id, nama, kota, alamat, homepage,
         afiliasi_group, jenis_bisnis, is_international, id_partner_contact,
         negara ( nama ) ) ),
       proposal_dokumen_unit ( unit ( id, nama ) ),
       proposal_dokumen_agenda ( agenda ( nama ) ),
       proposal_dokumen_bidang ( bidang_kerjasama ( nama ) ),
       proposal_dokumen_mou ( ringkasan_kegiatan ),
       proposal_dokumen_moa ( hak_petra, hak_calon_mitra, kewajiban_petra, kewajiban_calon_mitra ),
       pengusul ( jabatan ( id, nama, unit ( nama ), id_pegawai, pegawai ( nama, email, no_hp ) ) ),
       dokumen_kerja_sama ( no, no_dokumen, status, alasan_arsip,
                            tanggal_mulai, tanggal_berakhir, upload_dokumen, link_gdrive )`,
    )
    .eq("id", idProposal)
    .maybeSingle();

  // RLS already decided this: a row the account may not read simply is not
  // here, so there is nothing extra to check (AR-03).
  if (!proposal) notFound();

  const dok: any =
    (proposal as any).dokumen_kerja_sama?.[0] ?? (proposal as any).dokumen_kerja_sama;

  // The Pembaruan tab exists once renewal is relevant: the document is
  // expiring, or a renewal request is already on it.
  const { count: jumlahPembaruan } = dok?.no
    ? await supabase
        .from("v_pembaruan")
        .select("no_dokumen_kerjasama", { count: "exact", head: true })
        .eq("no_dokumen_kerjasama", dok.no)
    : { count: 0 };
  const adaPembaruan = Boolean(dok?.no) && (dok.status === "Akan Berakhir" || (jumlahPembaruan ?? 0) > 0);

  // Primary contact per partner, fetched separately — partner_contact has two
  // possible FK paths to partner, so a nested embed would be ambiguous.
  const daftarMitra = ((proposal as any).partner_pengusul ?? [])
    .map((pp: any) => pp.partner)
    .filter(Boolean);
  const idKontak = daftarMitra.map((p: any) => p.id_partner_contact).filter(Boolean);
  const { data: kontakMitra } = idKontak.length
    ? await supabase
        .from("partner_contact")
        .select("id, nama, jabatan, email, no_telp")
        .in("id", idKontak)
    : { data: [] };
  const kontakById = new Map((kontakMitra ?? []).map((k) => [k.id, k]));

  // Signed URL for whatever file stands for "the document" right now: the
  // signed partnership file once one exists, otherwise the draft still under
  // review — that IS "Download Draft" (revision V3 §2.a.1.3).
  const pathBerkas = dok?.upload_dokumen || proposal.file_draft || null;
  let previewUrl: string | null = null;
  if (pathBerkas) {
    const { data: signed } = await supabase.storage
      .from("dokumen-kerjasama")
      .createSignedUrl(pathBerkas, 3600);
    previewUrl = signed?.signedUrl ?? null;
  }
  const labelUnduh = dok?.upload_dokumen ? "Unduh Dokumen" : "Download Draft";

  const { data: riwayat } = await supabase
    .from("riwayat_approval")
    .select(
      `id, aksi, catatan, tanggal, waktu,
       akun ( jabatan ( nama, unit ( nama ) ) )`,
    )
    .eq("id_proposal_dokumen", idProposal)
    .order("tanggal", { ascending: false })
    .order("waktu", { ascending: false })
    .limit(50);

  const { data: pendahulu } = proposal.id_dokumen_sebelumnya
    ? await supabase
        .from("v_daftar_dokumen")
        .select("id_proposal, no_dokumen")
        .eq("id_proposal", proposal.id_dokumen_sebelumnya)
        .maybeSingle()
    : { data: null };

  const { data: penerus } = await supabase
    .from("v_daftar_dokumen")
    .select("id_proposal, no_dokumen")
    .eq("id_dokumen_sebelumnya", idProposal)
    .maybeSingle();

  // Approval progress — same shape the workflow page reads (revision V3 §2.a.2).
  const { data: disposisi } = await supabase
    .from("disposisi")
    .select(
      `no, round_ke, pesan_disposisi, waktu_disposisi, jenis_disposisi, lampiran,
       akun:id_akun_pengirim ( jabatan ( nama ) )`,
    )
    .eq("id_proposal_dokumen", idProposal)
    .eq("jenis_disposisi", "approval")
    .order("round_ke", { ascending: false })
    .order("waktu_disposisi", { ascending: false });

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

  // The Disposisi tab is where a disposition's message is read and where the
  // revision loop runs, so it is open to IO, to the approvers, and to the
  // submitter (who answers revision requests there).
  const pengusulSaya = Boolean(akun) && proposal.id_akun_pembuat === akun?.id;
  const approverSaya = (target ?? []).some((t: any) => t.jabatan?.id === akun?.id_jabatan);
  const bolehDisposisi = io || pengusulSaya || approverSaya;

  // Signed links for each disposition's attached document.
  const pathLampiran = (disposisi ?? []).map((d: any) => d.lampiran).filter(Boolean);
  const { data: lampiranSigned } = pathLampiran.length
    ? await supabase.storage.from("dokumen-kerjasama").createSignedUrls(pathLampiran, 3600)
    : { data: [] };
  const urlLampiran = new Map(
    (lampiranSigned ?? []).map((s: any) => [s.path, s.signedUrl as string | null]),
  );

  // Revision requests, each paired with the upload that answered it. Requests
  // and uploads alternate per target (the database refuses a second open
  // request), so walking them in order pairs them.
  const { data: riwayatRevisi } = await supabase
    .from("riwayat_approval")
    .select(
      `id, aksi, catatan, tanggal, waktu, id_disposisi_target,
       disposisi_target ( status, jabatan ( nama ) )`,
    )
    .eq("id_proposal_dokumen", idProposal)
    .in("aksi", ["revision_requested", "revision_submitted"])
    .order("tanggal")
    .order("waktu")
    .order("id");

  type PermintaanRevisi = { minta: any; jawab: any | null };
  const permintaanRevisi: PermintaanRevisi[] = [];
  const terbukaPerTarget = new Map<number, PermintaanRevisi>();
  for (const r of (riwayatRevisi ?? []) as any[]) {
    if (r.aksi === "revision_requested") {
      const p = { minta: r, jawab: null };
      permintaanRevisi.push(p);
      terbukaPerTarget.set(r.id_disposisi_target, p);
    } else {
      const p = terbukaPerTarget.get(r.id_disposisi_target);
      if (p) {
        p.jawab = r;
        terbukaPerTarget.delete(r.id_disposisi_target);
      }
    }
  }
  permintaanRevisi.reverse(); // newest first

  async function kirimRevisi(formData: FormData) {
    "use server";
    const hasil = await unggahRevisi(idProposal, Number(formData.get("no_target")), formData);
    if (!hasil.ok) {
      redirect(
        `/kerja-sama/${idProposal}/laporan?tab=disposisi&galat=${encodeURIComponent(hasil.pesan)}`,
      );
    }
  }

  const { data: jabatanApprover } = await supabase
    .from("jabatan")
    .select("id, nama, tier_disposisi")
    .not("tier_disposisi", "is", null)
    .order("tier_disposisi");

  const sudahJadiTarget = new Set((target ?? []).map((t: any) => t.jabatan?.id));

  // On a Perpanjangan the approver list starts prefilled from the positions
  // that approved the predecessor — editable (PRD §9.6).
  const { data: prefill } = await supabase.rpc("jabatan_prefill_perpanjangan", {
    p_id_proposal: idProposal,
  });
  const prefillSet = new Set(
    ((prefill ?? []) as { jabatan_prefill_perpanjangan: number }[] | number[]).map((x: any) =>
      typeof x === "number" ? x : x.jabatan_prefill_perpanjangan,
    ),
  );

  const belumDidisposisi =
    io && ["Diajukan", "Diproses"].includes(proposal.status_proposal as string);

  // "To" — choosing the positions for disposition (revision V3 §2.a.4.1);
  // "Message" (§2.a.4.2); "Dokumen" — the submitted draft or a fresh upload
  // (§2.a.4.3), whichever the sender picked.
  async function kirimDisposisiAwal(formData: FormData) {
    "use server";
    const balik = (pesan: string) =>
      redirect(
        `/kerja-sama/${idProposal}/laporan?tab=disposisi&galat=${encodeURIComponent(pesan)}`,
      );

    const dipilih = formData.getAll("jabatan").map(Number);
    if (dipilih.length === 0) balik("Pilih minimal satu jabatan.");

    const klien = await supabaseServer();
    let lampiran: string | null = null;
    const sumberDokumen = String(formData.get("sumber_dokumen") ?? "draf");
    const berkasBaru = formData.get("berkas") as File | null;

    if (sumberDokumen === "baru" && berkasBaru && berkasBaru.size > 0) {
      const unggah = await unggahBerkas(klien, `disposisi/${idProposal}`, berkasBaru);
      if ("pesan" in unggah) return balik(unggah.pesan);
      lampiran = unggah.path;
    } else if (sumberDokumen === "draf") {
      lampiran = proposal?.file_draft ?? null;
    }

    const hasil = await kirimDisposisi(idProposal, dipilih, String(formData.get("pesan") ?? ""), lampiran);
    if (!hasil.ok) balik(hasil.pesan);
    revalidatePath(`/kerja-sama/${idProposal}/laporan`);
  }

  const jenis = proposal.jenis_kerjasama as string;
  const mou = (proposal as any).proposal_dokumen_mou?.[0] ?? (proposal as any).proposal_dokumen_mou;
  const moa = (proposal as any).proposal_dokumen_moa?.[0] ?? (proposal as any).proposal_dokumen_moa;

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
          {daftarMitra.map((p: any) => p.nama).filter(Boolean).join(", ") || "Mitra belum dipilih"}
        </p>
      </header>

      <Tabs
        basePath={`/kerja-sama/${idProposal}/laporan`}
        tabs={Object.fromEntries(
          Object.entries(TAB).filter(
            ([k]) => (k !== "disposisi" || bolehDisposisi) && (k !== "pembaruan" || adaPembaruan),
          ),
        )}
        aktif={tab}
      />

      {tab === "detail" ? (
        <>
          <section className="mb-6 space-y-4">
            {daftarMitra.length === 0 ? (
              <Kartu judul="Informasi Mitra">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Mitra belum dipilih.
                </p>
              </Kartu>
            ) : (
              daftarMitra.map((p: any) => {
                const k = p.id_partner_contact ? kontakById.get(p.id_partner_contact) : null;
                return (
                  <Kartu key={p.id} judul={`Informasi Mitra — ${p.nama}`}>
                    <dl className="grid gap-x-6 sm:grid-cols-2">
                      <Baris label="Nama Mitra" nilai={p.nama} />
                      <Baris label="Negara" nilai={p.negara?.nama} />
                      <Baris label="Kota" nilai={p.kota} />
                      <Baris label="Alamat" nilai={p.alamat} />
                      <Baris label="Afiliasi/Group" nilai={p.afiliasi_group} />
                      <Baris
                        label="Homepage"
                        nilai={
                          p.homepage ? (
                            <a href={p.homepage} target="_blank" rel="noreferrer" className="underline">
                              {p.homepage}
                            </a>
                          ) : null
                        }
                      />
                      <Baris
                        label="Jenis Mitra"
                        nilai={p.is_international ? "Internasional" : "Domestik"}
                      />
                      <Baris label="Nama Kontak" nilai={k?.nama} />
                      <Baris label="Jabatan Kontak" nilai={k?.jabatan} />
                      <Baris label="Email" nilai={k?.email} />
                      <Baris label="No.HP" nilai={k?.no_telp} />
                    </dl>
                  </Kartu>
                );
              })
            )}
          </section>

          <section className="mb-6">
            <Kartu judul="Kerja Sama yang Diusulkan">
              <dl className="grid gap-x-6 sm:grid-cols-2">
                <Baris label="Jenis Kerja Sama" nilai={jenis} />
                <Baris
                  label="Agenda Kerja Sama"
                  nilai={
                    ((proposal as any).proposal_dokumen_agenda ?? [])
                      .map((a: any) => a.agenda?.nama)
                      .filter(Boolean)
                      .join(", ") || null
                  }
                />
                <Baris
                  label="Bidang Kerja Sama"
                  nilai={
                    ((proposal as any).proposal_dokumen_bidang ?? [])
                      .map((b: any) => b.bidang_kerjasama?.nama)
                      .filter(Boolean)
                      .join(", ") || null
                  }
                />
                <Baris label="Status Dokumen" nilai={dok?.status ?? proposal.status_proposal} />
                <Baris label="Tanggal Mulai" nilai={<Tanggal nilai={dok?.tanggal_mulai} />} />
                <Baris label="Tanggal Selesai" nilai={<Tanggal nilai={dok?.tanggal_berakhir} />} />
              </dl>
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Tujuan Kerja Sama
                  </div>
                  <p>{proposal.tujuan_kerjasama || "—"}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                      Manfaat Bagi PETRA
                    </div>
                    <p>{proposal.manfaat_bagi_petra || "—"}</p>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                      Manfaat Bagi Mitra
                    </div>
                    <p>{proposal.manfaat_bagi_mitra || "—"}</p>
                  </div>
                </div>

                {jenis === "MoU" ? (
                  <div>
                    <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                      Ringkasan Kegiatan
                    </div>
                    <p>{mou?.ringkasan_kegiatan || "—"}</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        Hak Petra
                      </div>
                      <p>{moa?.hak_petra || "—"}</p>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        Kewajiban Petra
                      </div>
                      <p>{moa?.kewajiban_petra || "—"}</p>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        Hak Mitra
                      </div>
                      <p>{moa?.hak_calon_mitra || "—"}</p>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        Kewajiban Mitra
                      </div>
                      <p>{moa?.kewajiban_calon_mitra || "—"}</p>
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Lingkup Unit
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(proposal as any).proposal_dokumen_unit?.length ? (
                      (proposal as any).proposal_dokumen_unit.map((u: any) => (
                        <span
                          key={u.unit?.id}
                          className="rounded-full border px-2 py-0.5 text-xs"
                          style={gaya}
                        >
                          {u.unit?.nama}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>Belum ada unit dipilih.</span>
                    )}
                  </div>
                </div>
              </div>
            </Kartu>
          </section>

          <section className="mb-6">
            <Kartu judul="Dokumen">
              {previewUrl ? (
                <div className="overflow-hidden rounded-lg border" style={gaya}>
                  {/* A Word draft cannot be previewed inline — download only. */}
                  {bisaPratinjau(pathBerkas) ? (
                    <iframe src={previewUrl} className="h-96 w-full" title="Pratinjau dokumen" />
                  ) : null}
                  <a
                    href={previewUrl}
                    download
                    className="block border-t px-3 py-2 text-center text-xs underline"
                    style={gaya}
                  >
                    {labelUnduh}
                  </a>
                </div>
              ) : dok?.link_gdrive ? (
                <a
                  href={dok.link_gdrive}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border px-3 py-2 text-center text-sm underline"
                  style={gaya}
                >
                  Buka di Google Drive
                </a>
              ) : (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Belum ada berkas untuk dokumen ini.
                </p>
              )}
            </Kartu>
          </section>

          <section className="space-y-4">
            {((proposal as any).pengusul ?? []).length === 0 ? (
              <Kartu judul="Unit Pengusul">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Belum ada jabatan pengusul.
                </p>
              </Kartu>
            ) : (
              ((proposal as any).pengusul ?? []).map((pg: any, i: number) => (
                <Kartu key={i} judul="Unit Pengusul">
                  <dl className="grid gap-x-6 sm:grid-cols-2">
                    <Baris label="Nama Unit" nilai={pg.jabatan?.unit?.nama} />
                    <Baris label="Jabatan" nilai={pg.jabatan?.nama} />
                    <Baris label="Nama Kontak" nilai={pg.jabatan?.pegawai?.nama} />
                    <Baris label="Email" nilai={pg.jabatan?.pegawai?.email} />
                    <Baris label="No.HP" nilai={pg.jabatan?.pegawai?.no_hp} />
                  </dl>
                </Kartu>
              ))
            )}

            {pendahulu || penerus ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {pendahulu ? (
                  <>
                    Menggantikan{" "}
                    <Link href={`/kerja-sama/${pendahulu.id_proposal}/laporan` as any} className="underline">
                      <span className="no-dokumen">{pendahulu.no_dokumen ?? "dokumen sebelumnya"}</span>
                    </Link>
                    .{" "}
                  </>
                ) : null}
                {penerus ? (
                  <>
                    Digantikan oleh{" "}
                    <Link href={`/kerja-sama/${penerus.id_proposal}/laporan` as any} className="underline">
                      <span className="no-dokumen">{penerus.no_dokumen ?? "proposal perpanjangan"}</span>
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      {tab === "approval" ? (
        <div className="space-y-6">
          <section className="rounded-xl border bg-white p-4" style={gaya}>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Approval</h2>
              {ronde && ronde > 1 ? (
                <span className="text-xs" style={{ color: "var(--status-pending-text)" }}>
                  Ronde ke-{ronde} — diulang setelah penangguhan
                </span>
              ) : null}
            </div>

            {beku ? (
              <p className="mb-3 text-xs" style={{ color: "var(--status-pending-text)" }}>
                Dokumen ditangguhkan. Hitungan SLA berhenti sampai KUI mengaktifkannya kembali.
                {io ? (
                  <span className="ml-2 inline-block align-middle">
                    <TombolReaktivasi idProposal={idProposal} />
                  </span>
                ) : null}
              </p>
            ) : null}

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
                                <SlaFlag hari={t.durasi_hari_kerja} bendera={t.status_sla} beku={Boolean(beku)} />
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
            <PanelApproval
              noTarget={targetSaya.no}
              idProposal={idProposal}
              menungguRevisi={Boolean(menungguRevisi)}
            />
          ) : null}

          {io && dalamDisposisi ? (
            <EditorDisposisi
              idProposal={idProposal}
              jabatanTersedia={(jabatanApprover ?? [])
                .filter((j) => !sudahJadiTarget.has(j.id))
                .map((j) => ({ id: j.id, nama: j.nama, tier: j.tier_disposisi }))}
              targetPending={(target ?? [])
                .filter((t: any) => t.status === "waiting" || t.status === "pending_action")
                .map((t: any) => ({ no: t.no, nama: t.jabatan?.nama ?? `Target ${t.no}` }))}
            />
          ) : null}
        </div>
      ) : null}

      {tab === "history" ? (
        <section className="rounded-xl border bg-white p-4" style={gaya}>
          <h2 className="mb-3 text-sm font-semibold">History</h2>
          <ul className="space-y-2 text-sm">
            {(riwayat ?? []).map((r: any) => {
              // The partner evaluates without an account, so its row has no actor.
              const jabatanNama =
                r.akun?.jabatan?.nama ?? (r.aksi === "evaluation_submitted" ? "Mitra" : "Sistem");
              const unitNama = r.akun?.jabatan?.unit?.nama ?? "—";
              const aksiLabel = AKSI_LABEL[r.aksi] ?? r.aksi;
              const namaPartner = daftarMitra.map((p: any) => p.nama).filter(Boolean).join(", ") || "—";
              return (
                <li key={r.id}>
                  <span>
                    <strong>{jabatanNama}</strong>, {unitNama}, {aksiLabel}, {jenis}, {namaPartner}, pada{" "}
                    {new Date(r.tanggal).toLocaleDateString("id-ID", { dateStyle: "medium" })},{" "}
                    {String(r.waktu).slice(0, 5)}
                  </span>
                  {r.catatan ? (
                    <span style={{ color: "var(--text-secondary)" }}> — {r.catatan}</span>
                  ) : null}
                </li>
              );
            })}
            {!riwayat?.length ? (
              <li style={{ color: "var(--text-muted)" }}>Belum ada aktivitas.</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {tab === "pembaruan" && adaPembaruan ? (
        <PembaruanPanel noDokumen={dok.no} io={io} idJabatan={akun?.id_jabatan ?? null} galat={galat} />
      ) : null}

      {tab === "disposisi" && bolehDisposisi ? (
        <div className="space-y-6">
          {galat ? (
            <p
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--action-danger)", color: "var(--action-danger)" }}
            >
              {galat}
            </p>
          ) : null}

          <section className="rounded-xl border bg-white p-4" style={gaya}>
            <h2 className="mb-3 text-sm font-semibold">Pesan Disposisi</h2>
            {(disposisi ?? []).length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Belum ada disposisi untuk dokumen ini.
              </p>
            ) : (
              <ul className="space-y-3">
                {(disposisi ?? []).map((d: any) => (
                  <li key={d.no} className="border-l-2 pl-3" style={gaya}>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {d.akun?.jabatan?.nama ?? "KUI"} ·{" "}
                      {new Date(d.waktu_disposisi).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {d.round_ke > 1 ? ` · Ronde ke-${d.round_ke}` : ""}
                    </div>
                    <p className="mt-0.5 whitespace-pre-line text-sm">
                      {d.pesan_disposisi || (
                        <span style={{ color: "var(--text-muted)" }}>(tanpa pesan)</span>
                      )}
                    </p>
                    {d.lampiran && urlLampiran.get(d.lampiran) ? (
                      <a
                        href={urlLampiran.get(d.lampiran)!}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                      >
                        Lihat dokumen terlampir
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {permintaanRevisi.length > 0 ? (
            <section className="rounded-xl border bg-white p-4" style={gaya}>
              <h2 className="mb-3 text-sm font-semibold">Revisi</h2>
              <ul className="space-y-4">
                {permintaanRevisi.map(({ minta, jawab }) => (
                  <li key={minta.id} className="rounded-lg border p-3" style={gaya}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        {minta.disposisi_target?.jabatan?.nama ?? "Approver"} meminta revisi
                      </span>
                      <span
                        className="text-xs"
                        style={{
                          color: jawab ? "var(--status-approved)" : "var(--status-pending-text)",
                        }}
                      >
                        {jawab ? "Revisi diunggah" : "Menunggu revisi"}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(minta.tanggal).toLocaleDateString("id-ID", { dateStyle: "medium" })},{" "}
                      {String(minta.waktu).slice(0, 5)}
                    </div>
                    {minta.catatan ? (
                      <p className="mt-1 whitespace-pre-line text-sm">{minta.catatan}</p>
                    ) : null}

                    {jawab ? (
                      <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                        Diunggah{" "}
                        {new Date(jawab.tanggal).toLocaleDateString("id-ID", { dateStyle: "medium" })},{" "}
                        {String(jawab.waktu).slice(0, 5)}
                        {jawab.catatan ? ` — ${jawab.catatan}` : ""}. Berkas terbaru tampil di tab
                        Detail.
                      </p>
                    ) : pengusulSaya && dalamDisposisi ? (
                      <form action={kirimRevisi} className="mt-3 space-y-2">
                        <input type="hidden" name="no_target" value={minta.id_disposisi_target} />
                        <input
                          type="file"
                          name="berkas"
                          accept={TERIMA_PDF_WORD}
                          required
                          className="block text-xs"
                        />
                        <input
                          name="catatan"
                          placeholder="Catatan revisi (opsional)"
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          style={gaya}
                        />
                        <SubmitButton
                          labelMenunggu="Mengunggah…"
                          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                          style={{ background: "var(--midnight)" }}
                        >
                          Unggah Revisi
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {io ? (
        <section className="rounded-xl border bg-white p-4" style={gaya}>
          <h2 className="mb-1 text-sm font-semibold">Kirim Disposisi</h2>

          {!belumDidisposisi ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Dokumen ini sudah didisposisikan. Kelola daftar approver dari tab Approval.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Pilih jabatan yang harus menyetujui. Urutan persetujuan tetap
                mengikuti tier di master jabatan.
                {prefillSet.size > 0
                  ? " Daftar ini sudah tercentang dari approval dokumen sebelumnya — masih dapat diubah."
                  : ""}
              </p>

              <form action={kirimDisposisiAwal}>
                <fieldset className="mb-4">
                  <legend className="mb-1 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                    To
                  </legend>
                  {/* One searchable list; tiers still order the approval (Revisi V7 §9). */}
                  <PilihBanyak
                    name="jabatan"
                    opsi={(jabatanApprover ?? []).map((j) => ({ id: j.id, label: j.nama }))}
                    awal={(jabatanApprover ?? []).filter((j) => prefillSet.has(j.id)).map((j) => j.id)}
                  />
                </fieldset>

                <label className="mb-4 block text-sm">
                  <span className="mb-1 block font-medium">Message</span>
                  <input
                    name="pesan"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>

                <fieldset className="mb-4">
                  <legend className="mb-1 block text-sm font-medium">Dokumen</legend>
                  <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="sumber_dokumen"
                        value="draf"
                        defaultChecked={Boolean(proposal.file_draft)}
                        disabled={!proposal.file_draft}
                      />
                      Sertakan dokumen yang diajukan
                      {!proposal.file_draft ? (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          (belum ada dokumen diunggah)
                        </span>
                      ) : null}
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="sumber_dokumen"
                        value="baru"
                        defaultChecked={!proposal.file_draft}
                      />
                      Unggah dokumen baru
                    </label>
                    <input type="file" name="berkas" accept={TERIMA_PDF_WORD} className="text-xs" />
                  </div>
                </fieldset>

                <SubmitButton
                  labelMenunggu="Mengirim…"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                  style={{ background: "var(--midnight)" }}
                >
                  Kirim Disposisi
                </SubmitButton>
              </form>
            </>
          )}
        </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
