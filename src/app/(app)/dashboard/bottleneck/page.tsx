import Link from "next/link";
import { redirect } from "next/navigation";
import { akunSaatIni, supabaseServer } from "@/lib/supabase/server";
import { BottleneckCharts } from "@/components/bottleneck-charts";

/**
 * Bottleneck analysis (Revisi V8 §19) — reached from the Dashboard's
 * "Melewati Batas Waktu" card. Four views onto the same question: where do
 * documents actually get stuck, and for whom.
 *
 * Admin-only, like the evaluation recap (§13) — this exposes per-account
 * performance, not just document status.
 */
export const dynamic = "force-dynamic";

export default async function Bottleneck() {
  const akun = await akunSaatIni();
  if (akun?.role !== "admin") redirect("/dashboard");

  const supabase = await supabaseServer();
  const [{ data: waktuStatus }, { data: leaderboard }, { data: unitDelay }, { data: trend }] =
    await Promise.all([
      supabase.from("v_time_in_status").select("*"),
      supabase.from("v_leaderboard_pending").select("*").limit(15),
      supabase.from("v_unit_delay_breakdown").select("*").limit(15),
      supabase.from("v_backlog_trend").select("*").order("bulan"),
    ]);

  return (
    <div>
      <header className="mb-5">
        <Link href="/dashboard" className="text-xs underline" style={{ color: "var(--text-secondary)" }}>
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-xl font-semibold" style={{ color: "var(--midnight)" }}>
          Titik Tersumbat Proses
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Di mana dokumen paling sering tertahan — per status, per jabatan, dan
          per unit pengusul.
        </p>
      </header>

      <BottleneckCharts
        waktuStatus={waktuStatus ?? []}
        leaderboard={leaderboard ?? []}
        unitDelay={unitDelay ?? []}
        trend={(trend ?? []).map((t: { bulan: string; kuning: number; merah: number }) => ({
          ...t,
          bulan: new Date(t.bulan).toLocaleDateString("id-ID", { year: "numeric", month: "short" }),
        }))}
      />
    </div>
  );
}
