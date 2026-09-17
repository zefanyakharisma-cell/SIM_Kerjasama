"use client";

import { useEffect, useRef } from "react";

/**
 * Studio Grafik Mitra — the rendering half (PRD §8.1).
 *
 * IO Admin configures up to five charts in Settings; this only draws what was
 * saved. The aggregation happens in Postgres (`agregasi_grafik`), so a chart
 * obeys the same RLS as every list — it is not a back door into rows the
 * account could not otherwise see.
 *
 * "Ekspor PDF" is the browser's own print-to-PDF. A PDF library would add a
 * dependency and a second layout to keep in step with this one, in order to
 * produce a worse copy of what the browser already renders.
 */

export type Grafik = {
  id: number;
  judul: string;
  jenis_grafik: string;
  deret: { label: string; nilai: number }[];
};

// The Formal register: Midnight first, secondary brand colours only where a
// series genuinely needs separating (PRD §16.1).
const PALET = ["#19304b", "#3880d0", "#45b8bc", "#6aaa43", "#be93e4", "#f37121", "#ffbc00"];

function opsiUntuk(g: Grafik) {
  const label = g.deret.map((d) => d.label);
  const nilai = g.deret.map((d) => d.nilai);
  const dasar = {
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {},
    color: PALET,
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
  };

  switch (g.jenis_grafik) {
    case "donut":
      return {
        ...dasar,
        legend: { bottom: 0, type: "scroll" },
        series: [
          {
            type: "pie",
            radius: ["45%", "70%"],
            data: g.deret.map((d) => ({ name: d.label, value: d.nilai })),
            label: { formatter: "{b}: {c}" },
          },
        ],
      };
    case "batang_horizontal":
      return {
        ...dasar,
        xAxis: { type: "value" },
        yAxis: { type: "category", data: label.slice().reverse() },
        series: [{ type: "bar", data: nilai.slice().reverse() }],
      };
    case "garis":
    case "area":
      return {
        ...dasar,
        xAxis: { type: "category", data: label },
        yAxis: { type: "value" },
        series: [
          {
            type: "line",
            data: nilai,
            smooth: false,
            areaStyle: g.jenis_grafik === "area" ? {} : undefined,
          },
        ],
      };
    case "radar":
      return {
        ...dasar,
        radar: {
          indicator: g.deret.map((d) => ({
            name: d.label,
            max: Math.max(...nilai, 1),
          })),
        },
        series: [{ type: "radar", data: [{ value: nilai, name: g.judul }] }],
      };
    case "treemap":
      return {
        ...dasar,
        series: [
          {
            type: "treemap",
            roam: false,
            breadcrumb: { show: false },
            data: g.deret.map((d) => ({ name: d.label, value: d.nilai })),
          },
        ],
      };
    default:
      return {
        ...dasar,
        xAxis: { type: "category", data: label, axisLabel: { interval: 0, rotate: 30 } },
        yAxis: { type: "value" },
        series: [{ type: "bar", data: nilai }],
      };
  }
}

function Kanvas({ g }: { g: Grafik }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let grafik: any;
    let batal = false;
    const ukur = () => grafik?.resize();

    (async () => {
      const echarts = await import("echarts");
      if (batal || !el.current) return;
      grafik = echarts.init(el.current);
      grafik.setOption(opsiUntuk(g));
      window.addEventListener("resize", ukur);
    })();

    return () => {
      batal = true;
      window.removeEventListener("resize", ukur);
      grafik?.dispose();
    };
  }, [g]);

  if (g.deret.length === 0) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        Belum ada data untuk grafik ini.
      </p>
    );
  }
  return <div ref={el} className="h-64 w-full" />;
}

export function StudioGrafik({ grafik }: { grafik: Grafik[] }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Studio Grafik Mitra</h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border px-3 py-1.5 text-xs"
          style={{ borderColor: "var(--border)", background: "white" }}
        >
          Ekspor PDF
        </button>
      </div>

      {grafik.length === 0 ? (
        <div
          className="rounded-xl border bg-white p-10 text-center text-sm"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Belum ada grafik tersimpan. KUI Admin dapat menambahkannya di Settings.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {grafik.map((g) => (
            <div
              key={g.id}
              className="rounded-xl border bg-white p-4"
              style={{ borderColor: "var(--border)" }}
            >
              <h3 className="mb-2 text-sm font-medium">{g.judul}</h3>
              <Kanvas g={g} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
