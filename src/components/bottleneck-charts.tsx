"use client";

import { useEffect, useRef } from "react";
import type { ECharts } from "echarts";

const PALET = ["#19304b", "#3880d0", "#45b8bc", "#6aaa43", "#be93e4", "#f37121", "#ffbc00"];
const dasar = {
  color: PALET,
  textStyle: { fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
  grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
  tooltip: {},
};

function Kanvas({ opsi, tinggi = 260 }: { opsi: Record<string, unknown>; tinggi?: number }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let grafik: ECharts | undefined;
    let batal = false;
    const ukur = () => grafik?.resize();

    (async () => {
      const echarts = await import("echarts");
      if (batal || !el.current) return;
      grafik = echarts.init(el.current);
      grafik.setOption(opsi);
      window.addEventListener("resize", ukur);
    })();

    return () => {
      batal = true;
      window.removeEventListener("resize", ukur);
      grafik?.dispose();
    };
  }, [opsi]);

  return <div ref={el} style={{ height: tinggi }} />;
}

function Kosong() {
  return (
    <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
      Belum ada data yang cukup untuk grafik ini.
    </p>
  );
}

type Section = { title: string; note: string; children: React.ReactNode };

function Bagian({ title, note, children }: Section) {
  return (
    <section className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
        {note}
      </p>
      {children}
    </section>
  );
}

export type WaktuStatus = { status: string; jumlah: number; rata_rata_hari: number | null; median_hari: number | null };
export type Leaderboard = { jabatan: string; tertahan: number; rata_rata_hari: number | null };
export type UnitDelay = { unit: string; dokumen_tertahan: number; rata_rata_hari: number | null };
export type BacklogTrend = { bulan: string; kuning: number; merah: number };

export function BottleneckCharts({
  waktuStatus,
  leaderboard,
  unitDelay,
  trend,
}: {
  waktuStatus: WaktuStatus[];
  leaderboard: Leaderboard[];
  unitDelay: UnitDelay[];
  trend: BacklogTrend[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bagian
        title="Funnel Waktu per Status"
        note="Rata-rata dan median hari yang dihabiskan dokumen di setiap status — status dengan angka tertinggi adalah titik tersumbat utama."
      >
        {waktuStatus.length === 0 ? (
          <Kosong />
        ) : (
          <Kanvas
            opsi={{
              ...dasar,
              xAxis: { type: "value", name: "Hari" },
              yAxis: { type: "category", data: waktuStatus.map((w) => w.status) },
              legend: { top: 0 },
              series: [
                { name: "Rata-rata", type: "bar", data: waktuStatus.map((w) => w.rata_rata_hari ?? 0) },
                { name: "Median", type: "bar", data: waktuStatus.map((w) => w.median_hari ?? 0) },
              ],
            }}
          />
        )}
      </Bagian>

      <Bagian
        title="Leaderboard Jabatan/Akun"
        note="Jabatan dengan target approval paling banyak tertahan (kuning/merah) dan rata-rata waktu tindak lanjutnya."
      >
        {leaderboard.length === 0 ? (
          <Kosong />
        ) : (
          <Kanvas
            opsi={{
              ...dasar,
              xAxis: { type: "value" },
              yAxis: { type: "category", data: leaderboard.map((l) => l.jabatan).reverse() },
              series: [{ type: "bar", data: leaderboard.map((l) => l.tertahan).reverse() }],
            }}
          />
        )}
      </Bagian>

      <Bagian
        title="Keterlambatan per Unit Pengusul"
        note="Rata-rata usia dokumen yang masih berjalan (belum disetujui), dikelompokkan per unit pengusul."
      >
        {unitDelay.length === 0 ? (
          <Kosong />
        ) : (
          <Kanvas
            opsi={{
              ...dasar,
              xAxis: { type: "value", name: "Hari" },
              yAxis: { type: "category", data: unitDelay.map((u) => u.unit).reverse() },
              series: [{ type: "bar", data: unitDelay.map((u) => u.rata_rata_hari ?? 0).reverse() }],
            }}
          />
        )}
      </Bagian>

      <Bagian
        title="Tren Backlog Bulanan"
        note="Jumlah peringatan batas waktu (kuning/merah) per bulan — menunjukkan apakah backlog membesar atau mengecil."
      >
        {trend.length === 0 ? (
          <Kosong />
        ) : (
          <Kanvas
            opsi={{
              ...dasar,
              xAxis: { type: "category", data: trend.map((t) => t.bulan) },
              yAxis: { type: "value" },
              legend: { top: 0 },
              series: [
                { name: "Kuning", type: "line", data: trend.map((t) => t.kuning) },
                { name: "Merah", type: "line", data: trend.map((t) => t.merah) },
              ],
            }}
          />
        )}
      </Bagian>
    </div>
  );
}
