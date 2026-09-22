"use client";

import { useEffect, useRef } from "react";
import type { ECharts } from "echarts";

/**
 * Antrean Saya's personal summary (Revisi V8 §5) — what this account still
 * has to do, its batas waktu exposure, and how much of its approval history
 * is already resolved. Fills the empty right-hand column on wide screens;
 * reuses studio-grafik.tsx's dynamic-import ECharts pattern.
 */
export type RingkasanData = {
  perJenis: { label: string; nilai: number }[];
  batasWaktu: { merah: number; kuning: number; normal: number };
  approvalSelesai: number;
  approvalTotal: number;
};

const PALET = ["#19304b", "#3880d0", "#45b8bc", "#6aaa43", "#be93e4", "#f37121", "#ffbc00"];

function Donut({ data }: { data: { label: string; nilai: number }[] }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let grafik: ECharts | undefined;
    let batal = false;
    const ukur = () => grafik?.resize();

    (async () => {
      const echarts = await import("echarts");
      if (batal || !el.current) return;
      grafik = echarts.init(el.current);
      grafik.setOption({
        color: PALET,
        textStyle: { fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
        tooltip: {},
        legend: { bottom: 0, type: "scroll" },
        series: [
          {
            type: "pie",
            radius: ["45%", "70%"],
            data: data.map((d) => ({ name: d.label, value: d.nilai })),
            label: { formatter: "{b}: {c}" },
          },
        ],
      });
      window.addEventListener("resize", ukur);
    })();

    return () => {
      batal = true;
      window.removeEventListener("resize", ukur);
      grafik?.dispose();
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        Tidak ada langkah menunggu.
      </p>
    );
  }
  return <div ref={el} style={{ height: 220 }} />;
}

export function RingkasanAntrean({ data }: { data: RingkasanData }) {
  const { batasWaktu, approvalSelesai, approvalTotal } = data;
  const persen = approvalTotal > 0 ? Math.round((approvalSelesai / approvalTotal) * 100) : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="mb-2 text-sm font-semibold">Ringkasan Aktivitas Saya</h2>
        <Donut data={data.perJenis} />
      </section>

      <section className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="mb-3 text-sm font-semibold">Batas Waktu</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-semibold" style={{ color: "var(--sla-red)" }}>
              {batasWaktu.merah}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Merah</div>
          </div>
          <div>
            <div className="text-xl font-semibold" style={{ color: "var(--sla-yellow-text)" }}>
              {batasWaktu.kuning}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Kuning</div>
          </div>
          <div>
            <div className="text-xl font-semibold" style={{ color: "var(--text-secondary)" }}>
              {batasWaktu.normal}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Normal</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="mb-1 text-sm font-semibold">Persentase Approval Selesai</h2>
        <div className="text-2xl font-semibold" style={{ color: "var(--midnight)" }}>
          {persen === null ? "—" : `${persen}%`}
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {approvalTotal
            ? `${approvalSelesai} dari ${approvalTotal} target approval sudah ditindak`
            : "Belum pernah menjadi target approval"}
        </p>
      </section>
    </div>
  );
}
