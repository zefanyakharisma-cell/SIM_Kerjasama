import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isIO, akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { StatusPill } from "@/components/status-pill";

/**
 * Kerja Sama Aktif — Report (revision V2 §1.a). Reached from the magnifying
 * glass on the Kerja Sama Aktif list. A dedicated, read-focused page — the
 * approval workflow (disposisi, activation, early termination, …) stays on
 * `/kerja-sama/[id]`, which every other tab still links to; this route never
 * mutates the document's workflow state, only its file (PDF/Drive link).
 */
export const dynamic = "force-dynamic";

const TAB = { view: "View", log: "Log", pembaruan: "Pembaruan" } as const;
type TabKey = keyof typeof TAB;

const gaya = { borderColor: "var(--border)" };

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
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabMentah } = await searchParams;
  const tab: TabKey = (tabMentah as TabKey) in TAB ? (tabMentah as TabKey) : "view";
  const idProposal = Number(id);
  const supabase = await supabaseServer();
  const akun = await akunSaatIni();
  const io = isIO(akun);

  const { data: proposal } = await supabase
    .from("proposal_dokumen")
    .select(
      `id, jenis_kerjasama, status_proposal, tujuan_kerjasama, manfaat_bagi_petra,
       manfaat_bagi_mitra, id_dokumen_sebelumnya,
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

  // Signed URL for the uploaded PDF, if any — the bucket is private.
  let previewUrl: string | null = null;
  if (dok?.upload_dokumen) {
    const { data: signed } = await supabase.storage
      .from("dokumen-kerjasama")
      .createSignedUrl(dok.upload_dokumen, 3600);
    previewUrl = signed?.signedUrl ?? null;
  }

  const { data: riwayat } = await supabase
    .from("riwayat_approval")
    .select("id, aksi, catatan, tanggal, waktu")
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

  // Upload OR a Drive link — either is enough for the preview (revision V2).
  // Document metadata, not a workflow mutation, so it stays on the report.
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
    revalidatePath(`/kerja-sama/${idProposal}/laporan`);
  }

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
        <Link href={`/kerja-sama/${idProposal}`} className="text-xs underline">
          Kelola workflow dokumen ini →
        </Link>
      </header>

      <nav className="mb-5 flex flex-wrap gap-1 border-b" style={gaya}>
        {(Object.keys(TAB) as TabKey[]).map((k) => (
          <Link
            key={k}
            href={`/kerja-sama/${idProposal}/laporan?tab=${k}` as any}
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
          </section>
        </>
      ) : null}

      {tab === "log" ? (
        <section className="rounded-xl border bg-white p-4" style={gaya}>
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
        <section className="rounded-xl border bg-white p-4" style={gaya}>
          <h2 className="mb-3 text-sm font-semibold">Pembaruan</h2>

          {pendahulu || penerus ? (
            <ul className="mb-4 space-y-1 text-sm">
              {pendahulu ? (
                <li>
                  Menggantikan{" "}
                  <Link href={`/kerja-sama/${pendahulu.id_proposal}/laporan` as any} className="underline">
                    <span className="no-dokumen">{pendahulu.no_dokumen ?? "dokumen sebelumnya"}</span>
                  </Link>
                </li>
              ) : null}
              {penerus ? (
                <li>
                  Digantikan oleh{" "}
                  <Link href={`/kerja-sama/${penerus.id_proposal}/laporan` as any} className="underline">
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
