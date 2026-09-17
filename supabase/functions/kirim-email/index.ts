// Email dispatch (Architecture §7, Design §7).
//
// Notifications are written inside the workflow transaction; email is sent
// OUTSIDE it, by draining the queue afterwards. That ordering is the whole
// point: a mail provider being down must never roll back an approval (BR-21).
//
// Runs on the service role, on a schedule. It is not reachable by a browser —
// it has no authenticated caller and returns nothing a client needs.
//
// Deploy:  supabase functions deploy kirim-email --no-verify-jwt
// Secrets: RESEND_API_KEY, EMAIL_FROM, APP_URL
// Schedule: every 5 minutes (Supabase Cron). Missing a run only delays mail;
// the queue is durable and the next run picks it up.

import { createClient } from "jsr:@supabase/supabase-js@2";

const JUDUL: Record<string, string> = {
  disposition_assigned: "Dokumen menunggu persetujuan Anda",
  renewal_request_assigned: "Permintaan pembaruan untuk unit Anda",
  approved: "Dokumen disetujui",
  rejected: "Dokumen ditolak",
  pending: "Dokumen ditangguhkan",
  revision_requested: "Permintaan revisi dokumen",
  reactivated: "Dokumen diaktifkan kembali",
  expiring_soon: "Dokumen akan berakhir",
  sla_yellow: "Pengingat: dokumen menunggu tindakan Anda",
  sla_red: "Pengingat kedua: dokumen menunggu tindakan Anda",
  sla_eskalasi: "Eskalasi: seorang approver belum menindak",
  evaluation_submitted: "Evaluasi pembaruan masuk",
  split_decision: "Evaluasi berbeda — perlu keputusan KUI",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const APP_URL = Deno.env.get("APP_URL") ?? "https://simks.petra.ac.id";

/**
 * Plain, text-first, one link (Design §7). An SLA reminder to a late approver
 * stays factual and short; the escalation to IO is a separate message the
 * approver never sees, which is why recipients are resolved per notification
 * row rather than broadcast.
 */
function badan(n: Record<string, any>): string {
  const judul = JUDUL[n.jenis_notifikasi] ?? n.jenis_notifikasi;
  const tautan = n.id_proposal_dokumen
    ? `${APP_URL}/kerja-sama/${n.id_proposal_dokumen}`
    : `${APP_URL}/notifikasi`;
  return [
    judul,
    "",
    n.isi ?? "",
    "",
    `Buka dokumen: ${tautan}`,
    "",
    "SIM Kerja Sama — Kantor Kerja Sama dan Urusan Internasional",
    "Universitas Kristen Petra",
  ].join("\n");
}

Deno.serve(async () => {
  const { data: antrean, error } = await supabase
    .from("notifikasi")
    .select("id, jenis_notifikasi, isi, id_proposal_dokumen, id_jabatan_penerima")
    .eq("status", "pending")
    .order("waktu_kirim")
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ pesan: error.message }), { status: 500 });
  }

  // Recipient positions resolved to their role emails in one query. The
  // notification names a position; the account is how that position is reached.
  const jabatanIds = [
    ...new Set((antrean ?? []).map((n) => n.id_jabatan_penerima).filter(Boolean)),
  ];
  const { data: akun } = await supabase
    .from("akun")
    .select("id_jabatan, email")
    .in("id_jabatan", jabatanIds.length ? jabatanIds : [-1])
    .eq("is_active", true);

  const alamat = new Map<number, string>();
  for (const a of akun ?? []) {
    if (!alamat.has(a.id_jabatan)) alamat.set(a.id_jabatan, a.email);
  }

  const kunci = Deno.env.get("RESEND_API_KEY");
  let terkirim = 0;
  let gagal = 0;

  for (const n of antrean ?? []) {
    // The account IS the position, so a role email reaches whoever currently
    // holds the office (DR-06).
    const tujuan = alamat.get(n.id_jabatan_penerima as number);
    if (!tujuan || !kunci) {
      // No address or no provider configured: leave the row pending rather
      // than marking it sent, so nothing is silently lost (EC-06).
      continue;
    }

    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${kunci}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: Deno.env.get("EMAIL_FROM") ?? "SIM Kerja Sama <no-reply@petra.ac.id>",
          to: [tujuan],
          subject: `[SIM-KS] ${JUDUL[n.jenis_notifikasi] ?? n.jenis_notifikasi}`,
          text: badan(n),
        }),
      });

      await supabase
        .from("notifikasi")
        .update({ status: r.ok ? "sent" : "failed" })
        .eq("id", n.id);

      if (r.ok) terkirim++;
      else gagal++;
    } catch (e) {
      console.error("[simks] gagal mengirim email", n.id, e);
      await supabase.from("notifikasi").update({ status: "failed" }).eq("id", n.id);
      gagal++;
    }
  }

  return new Response(JSON.stringify({ terkirim, gagal }), {
    headers: { "Content-Type": "application/json" },
  });
});
