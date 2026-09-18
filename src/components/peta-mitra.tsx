"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Peta Mitra Global (PRD §8.1).
 *
 * Leaflet is loaded and driven directly rather than through a React wrapper:
 * the map holds its own imperative state, and a wrapper would only add a
 * dependency to re-express what `useEffect` already does in twenty lines.
 *
 * One bubble per country, sized by how many active partners it holds; the
 * coordinates come from the country master (v_peta_mitra), so a new partner
 * appears on the map without anyone geocoding it.
 */

export type Pin = {
  id: number;
  nama: string;
  latitude: number;
  longitude: number;
  is_domestic: boolean;
  jumlah_mitra: number;
  jumlah_dokumen: number;
};

// The region tabs from the mockup, as bounding boxes. A hardcoded
// country-to-region table would be a second source of truth sitting beside the
// country master, and it would drift (BR-16).
const WILAYAH: Record<string, [number, number, number, number] | null> = {
  Semua: null,
  Asia: [-11, 25, 60, 150],
  Eropa: [35, -25, 71, 45],
  Amerika: [-56, -170, 72, -30],
  Australia: [-50, 110, -10, 180],
};

export function PetaMitra({ pin }: { pin: Pin[] }) {
  const wadah = useRef<HTMLDivElement>(null);
  const peta = useRef<any>(null);
  const lapisan = useRef<any>(null);
  const [wilayah, setWilayah] = useState("Semua");
  const [lingkup, setLingkup] = useState<"semua" | "intl" | "domestik">("semua");

  const terlihat = useMemo(() => {
    const kotak = WILAYAH[wilayah];
    return pin.filter((p) => {
      if (lingkup === "intl" && p.is_domestic) return false;
      if (lingkup === "domestik" && !p.is_domestic) return false;
      if (!kotak) return true;
      const [s, b, u, t] = kotak;
      return p.latitude >= s && p.latitude <= u && p.longitude >= b && p.longitude <= t;
    });
  }, [pin, wilayah, lingkup]);

  // Leaflet ships its own stylesheet; loading it here keeps the map
  // self-contained rather than making every page pay for it.
  useEffect(() => {
    const id = "leaflet-css";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(l);
  }, []);

  useEffect(() => {
    let batal = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (batal || !wadah.current) return;

      if (!peta.current) {
        peta.current = L.map(wadah.current, {
          center: [-2, 118],
          zoom: 2,
          scrollWheelZoom: false,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 12,
        }).addTo(peta.current);
        lapisan.current = L.layerGroup().addTo(peta.current);
      }

      lapisan.current.clearLayers();
      for (const p of terlihat) {
        L.circleMarker([p.latitude, p.longitude], {
          // Area, not radius, tracks the count, so 4x the partners reads as
          // 4x the bubble rather than 16x.
          radius: Math.min(5 + 3 * Math.sqrt(p.jumlah_mitra), 30),
          // Colour carries one meaning here, and the popup names it in words.
          color: p.is_domestic ? "#6aaa43" : "#3880d0",
          fillOpacity: 0.65,
          weight: 1,
        })
          .bindPopup(
            `<strong>${p.nama}</strong><br/>${p.jumlah_mitra} mitra · ${p.jumlah_dokumen} dokumen<br/>` +
              (p.is_domestic ? "Dalam Negeri" : "Luar Negeri"),
          )
          .addTo(lapisan.current);
      }
    })();

    return () => {
      batal = true;
    };
  }, [terlihat]);

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Peta Mitra Global</h2>
        <div className="flex flex-wrap gap-1">
          {(["semua", "intl", "domestik"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLingkup(l)}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{
                borderColor: lingkup === l ? "var(--midnight)" : "var(--border)",
                fontWeight: lingkup === l ? 600 : 400,
              }}
            >
              {l === "semua" ? "Semua" : l === "intl" ? "Internasional" : "Domestik"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {Object.keys(WILAYAH).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWilayah(w)}
            className="border-b-2 px-2 py-1 text-xs"
            style={{
              borderColor: wilayah === w ? "var(--midnight)" : "transparent",
              fontWeight: wilayah === w ? 600 : 400,
            }}
          >
            {w}
          </button>
        ))}
      </div>

      <div ref={wadah} className="h-80 w-full rounded-lg" />

      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        {terlihat.length} negara · {terlihat.reduce((n, p) => n + p.jumlah_mitra, 0)} mitra
        tampil. Ukuran lingkaran menunjukkan jumlah mitra di negara tersebut.
      </p>
    </div>
  );
}
