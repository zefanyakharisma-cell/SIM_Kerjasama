import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { akunSaatIni, isIO, supabaseServer } from "@/lib/supabase/server";
import { aktivasiDokumen, kirimDisposisi } from "@/lib/actions/workflow";
import { arsipkanDokumen } from "@/lib/actions/pembaruan";
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

const TAB = { view: "View", log: "Log", pembaruan: "Pembaruan" } as const;
type TabKey = keyof typeof TAB;

function waktuLokal(nilai: string | null) {
  if (!nilai) return "—";
  return new Date(nilai).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Tanggal({ nilai }: { nilai: string | null | undefined }) {
  if (!nilai) return <>—</>;
  return <>{new Date(nilai).toLocaleDateString("id-ID", { dateStyle: "medium" })}</>;
}

const gaya = { borderColor: "var(--border)" };

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

export default async function DetailDokumen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabMentah } = await searchParams;
  const tab: TabKey = (tabMentah as TabKey) in TAB ? (tabMentah as TabKey) : "view";
  const idProposal = Number(id);
  const supabase = await supabaseServer();
  const akun = await akunSaatIni();

  const { data: proposal } = await supabase
    .from("proposal_dokumen")
    .select(
      `id, jenis_kerjasama, status_proposal, periode_kerjasama,
       sifat_periode_kerjasama, tujuan_kerjasama, manfaat_bagi_petra,
       manfaat_bagi_mitra, informasi_tambahan, waktu_proposal_dokumen,
       waktu_disetujui, waktu_aktif, id_dokumen_sebelumnya, file_draft,
       partner_pengusul ( is_lead, partner ( id, nama, kota, alamat, homepage,
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

  // Primary contact per partner. Fetched separately from the nested select
  // above — partner_contact has two possible FK paths to partner (the
  // partner's own id_partner_contact, and partner_contact's own id_partner),
  // so a nested embed would be ambiguous; a plain lookup by id sidesteps that.
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

  // Signed URL for the uploaded PDF, if any — the bucket is private, so this
  // is the only way to view/download it (revision V2: upload or a Drive link).
  let previewUrl: string | null = null;
  if (dok?.upload_dokumen) {
    const { data: signed } = await supabase.storage
      .from("dokumen-kerjasama")
      .createSignedUrl(dok.upload_dokumen, 3600);
    previewUrl = signed?.signedUrl ?? null;
  }

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

  // On a Perpanjangan the approver list starts prefilled from the positions
  // that approved the predecessor — editable, and empty for a legacy document
  // with no approval history to prefill from (PRD §9.6).
  const { data: prefill } = await supabase.rpc("jabatan_prefill_perpanjangan", {
    p_id_proposal: idProposal,
  });
  const prefillSet = new Set(
    ((prefill ?? []) as { jabatan_prefill_perpanjangan: number }[] | number[]).map((x: any) =>
      typeof x === "number" ? x : x.jabatan_prefill_perpanjangan,
    ),
  );

  // Renewal chain, linked both ways so a document's history is reachable from
  // either end (Design §5.8).
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

  async function aktifkan(formData: FormData) {
    "use server";
    const akhir = String(formData.get("tanggal_berakhir") ?? "");
    await aktivasiDokumen(idProposal, {
      // Typed by IO, never generated and never format-checked (BR-22).
      noDokumen: String(formData.get("no_dokumen") ?? ""),
      tanggalTandaTangan: String(formData.get("tanggal_tanda_tangan") ?? ""),
      tanggalMulai: String(formData.get("tanggal_mulai") ?? ""),
      // Auto Renewed carries no end date at all (BR-11).
      tanggalBerakhir: akhir === "" ? null : akhir,
      folderKui: String(formData.get("folder_kui") ?? "") || null,
      noBerkasDikti: String(formData.get("no_berkas_dikti") ?? "") || null,
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

  // Upload OR a Drive link — either is enough for the View tab's preview
  // (revision V2). Both fields are optional and independent; submitting one
  // does not clear the other unless it's blank.
  async function simpanFileDokumen(formData: FormData) {
    "use server";
    const klien = await supabaseServer();
    const berkas = formData.get("file") as File | null;
    const tautan = String(formData.get("link_gdrive") ?? "").trim();
    const perubahan: Record<string, string | null> = {};

    if (berkas && berkas.size > 0) {
      const path = `${idProposal}/${Date.now()}-${berkas.name}`;
      const { error } = await klien.storage
        .from("dokumen-kerjasama")
        .upload(path, berkas, { upsert: true });
      if (!error) perubahan.upload_dokumen = path;
    }
    if (formData.has("link_gdrive")) {
      perubahan.link_gdrive = tautan === "" ? null : tautan;
    }
    if (Object.keys(perubahan).length > 0) {
      await klien
        .from("dokumen_kerja_sama")
        .update(perubahan)
        .eq("id_proposal_dokumen", idProposal);
    }
    revalidatePath(`/kerja-sama/${idProposal}`);
  }

  // Empty tiers are omitted, never rendered blank (Design §4.3).
  const tierTampil = [1, 2, 3].filter((t) =>
    (target ?? []).some((x: any) => x.tier === t && x.status !== "removed"),
  );

  const jenis = proposal.jenis_kerjasama as string;
  const mou = (proposal as any).proposal_dokumen_mou?.[0] ?? (proposal as any).proposal_dokumen_mou;
  const moa = (proposal as any).proposal_dokumen_moa?.[0] ?? (proposal as any).proposal_dokumen_moa;

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

      {beku ? (
        <div className="mb-6 rounded-xl border-2 p-4" style={{ borderColor: "var(--status-pending)" }}>
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

      <nav className="mb-5 flex flex-wrap gap-1 border-b" style={gaya}>
        {(Object.keys(TAB) as TabKey[]).map((k) => (
          <Link
            key={k}
            href={`/kerja-sama/${idProposal}?tab=${k}` as any}
            className="border-b-2 px-3 py-2 text-sm"
            style={{
              borderColor: k === tab ? "var(--midnight)" : "transparent",
              color: k === tab ? "var(--midnight)" : "var(--text-secondary)",
              fontWeight: k === tab ? 600 : 400,
            }}
          >
            {TAB[k]}
          </Link>
        ))}
      </nav>

      {tab === "view" ? (
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
                      <Baris label="Jenis Bisnis" nilai={p.jenis_bisnis} />
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
                <Baris label="Status Kerja Sama" nilai={dok?.status ?? proposal.status_proposal} />
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
                <div className="mb-3 overflow-hidden rounded-lg border" style={gaya}>
                  <iframe src={previewUrl} className="h-96 w-full" title="Pratinjau dokumen" />
                  <a
                    href={previewUrl}
                    download
                    className="block border-t px-3 py-2 text-center text-xs underline"
                    style={gaya}
                  >
                    Unduh PDF
                  </a>
                </div>
              ) : dok?.link_gdrive ? (
                <a
                  href={dok.link_gdrive}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-3 block rounded-lg border px-3 py-2 text-center text-sm underline"
                  style={gaya}
                >
                  Buka di Google Drive
                </a>
              ) : (
                <p className="mb-3 text-sm" style={{ color: "var(--text-muted)" }}>
                  Belum ada berkas untuk dokumen ini.
                </p>
              )}

              {io && dok ? (
                <form action={simpanFileDokumen} className="flex flex-wrap items-end gap-2 text-sm">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium">Unggah PDF</span>
                    <input type="file" name="file" accept="application/pdf" className="text-xs" />
                  </label>
                  <label className="block flex-1">
                    <span className="mb-1 block text-xs font-medium">Atau tautan Google Drive</span>
                    <input
                      name="link_gdrive"
                      defaultValue={dok.link_gdrive ?? ""}
                      placeholder="https://drive.google.com/…"
                      className="w-full rounded-lg border px-2 py-1 text-xs"
                      style={gaya}
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                    style={{ background: "var(--midnight)" }}
                  >
                    Simpan
                  </button>
                </form>
              ) : null}
            </Kartu>
          </section>

          <section className="mb-6 space-y-4">
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
          </section>

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

          {belumDidisposisi ? (
            <section
              className="mb-6 rounded-xl border bg-white p-4"
              style={{ borderColor: "var(--border)" }}
            >
              <h2 className="mb-1 text-sm font-semibold">Kirim Disposisi Approval</h2>
              <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Pilih jabatan yang harus menyetujui. Tier dibaca dari master jabatan;
                tier yang kosong akan dilewati, bukan menghambat.
                {prefillSet.size > 0
                  ? " Daftar ini sudah tercentang dari approval dokumen sebelumnya — masih dapat diubah."
                  : ""}
              </p>

              <form action={kirimDisposisiAwal}>
                <div className="mb-3 space-y-3">
                  {[1, 2, 3].map((tier) => {
                    const daftar = (jabatanApprover ?? []).filter(
                      (j) => j.tier_disposisi === tier,
                    );
                    if (daftar.length === 0) return null;
                    return (
                      <fieldset key={tier}>
                        <legend
                          className="mb-1 text-xs font-semibold"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          TIER {tier}
                        </legend>
                        <div className="grid gap-1 sm:grid-cols-2">
                          {daftar.map((j) => (
                            <label key={j.id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                name="jabatan"
                                value={j.id}
                                defaultChecked={prefillSet.has(j.id)}
                              />
                              {j.nama}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>

                <label className="mb-3 block text-sm">
                  <span className="mb-1 block font-medium">Pesan disposisi</span>
                  <input
                    name="pesan"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>

                <button
                  type="submit"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                  style={{ background: "var(--midnight)" }}
                >
                  Kirim Disposisi
                </button>
              </form>
            </section>
          ) : null}

          {io && proposal.status_proposal === "Disetujui" && !dok ? (
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
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                    style={{ background: "var(--status-active)" }}
                  >
                    Aktifkan Dokumen
                  </button>
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
                <button
                  type="submit"
                  className="rounded-lg border px-4 py-2 text-sm font-medium"
                  style={{ borderColor: "var(--action-danger)", color: "var(--action-danger)" }}
                >
                  Akhiri kerja sama ini
                </button>
              </form>
            </section>
          ) : null}
        </>
      ) : null}

      {tab === "log" ? (
        <section className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-3 text-sm font-semibold">Log</h2>
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
      ) : null}

      {tab === "pembaruan" ? (
        <section className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-3 text-sm font-semibold">Pembaruan</h2>

          {pendahulu || penerus ? (
            <ul className="mb-4 space-y-1 text-sm">
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
          ) : null}

          {dok?.no ? (
            <Link href={`/pembaruan/${dok.no}` as any} className="text-sm underline">
              Kelola pembaruan &amp; evaluasi dokumen ini →
            </Link>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Pembaruan dan evaluasi tersedia setelah dokumen ini aktif.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
