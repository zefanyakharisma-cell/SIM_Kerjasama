"use client";

import { useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";

/**
 * Studio Grafik Mitra — the rendering half (PRD §8.1).
 *
 * Each account manages its own charts from the Dashboard; this draws them and
 * hosts the controls. The aggregation happens in Postgres (`agregasi_grafik`), so a chart
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

type AksiGrafik = (formData: FormData) => void | Promise<void>;

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

export function StudioGrafik({
  grafik,
  onPindah,
  onHapus,
  onReset,
  editor,
  tambah,
}: {
  grafik: Grafik[];
  // Every account owns its charts. All optional so the component still works
  // wherever charts are shown read-only.
  onPindah?: AksiGrafik;
  onHapus?: AksiGrafik;
  onReset?: AksiGrafik;
  /** The edit form for each chart, rendered on the server, keyed by chart id. */
  editor?: Record<number, React.ReactNode>;
  /** The "Tambah Grafik" form, or absent once the account is at its limit. */
  tambah?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Studio Grafik Mitra</h2>
        <div className="flex flex-wrap items-center gap-2">
          {onReset ? (
            <form action={onReset}>
              <SubmitButton
                labelMenunggu="Memproses…"
                className="rounded-lg border px-3 py-1.5 text-xs"
                style={{ borderColor: "var(--border)", background: "white" }}
              >
                Reset ke default
              </SubmitButton>
            </form>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--border)", background: "white" }}
          >
            Ekspor PDF
          </button>
        </div>
      </div>

      {tambah ? (
        <details className="mb-3 rounded-xl border bg-white p-3" style={{ borderColor: "var(--border)" }}>
          <summary className="cursor-pointer text-sm font-medium" style={{ color: "var(--midnight)" }}>
            + Tambah Grafik
          </summary>
          <div className="mt-3">{tambah}</div>
        </details>
      ) : null}

      {grafik.length === 0 ? (
        <div
          className="rounded-xl border bg-white p-10 text-center text-sm"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Belum ada grafik. Tambahkan grafik baru atau kembalikan grafik bawaan.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {grafik.map((g, i) => (
            <div
              key={g.id}
              className="rounded-xl border bg-white p-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{g.judul}</h3>
                {onHapus || onPindah ? (
                  <div className="flex items-center gap-1 text-xs">
                    {onPindah ? (
                      <>
                        <form action={onPindah}>
                          <input type="hidden" name="id_chart" value={g.id} />
                          <input type="hidden" name="arah" value="naik" />
                          <SubmitButton
                            labelMenunggu="…"
                            disabled={i === 0}
                            className="rounded px-1.5 py-0.5 hover:bg-black/5 disabled:opacity-30"
                            aria-label="Naikkan"
                          >
                            ↑
                          </SubmitButton>
                        </form>
                        <form action={onPindah}>
                          <input type="hidden" name="id_chart" value={g.id} />
                          <input type="hidden" name="arah" value="turun" />
                          <SubmitButton
                            labelMenunggu="…"
                            disabled={i === grafik.length - 1}
                            className="rounded px-1.5 py-0.5 hover:bg-black/5 disabled:opacity-30"
                            aria-label="Turunkan"
                          >
                            ↓
                          </SubmitButton>
                        </form>
                      </>
                    ) : null}
                    {onHapus ? (
                      <form action={onHapus}>
                        <input type="hidden" name="id_chart" value={g.id} />
                        <SubmitButton
                          labelMenunggu="Menghapus…"
                          className="rounded px-1.5 py-0.5 underline hover:bg-black/5"
                          style={{ color: "var(--action-danger)" }}
                        >
                          Hapus
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {editor?.[g.id] ? (
                <details className="mb-2 text-xs">
                  <summary className="cursor-pointer underline" style={{ color: "var(--text-secondary)" }}>
                    Edit
                  </summary>
                  <div className="mt-2">{editor[g.id]}</div>
                </details>
              ) : null}
              <Kanvas g={g} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
