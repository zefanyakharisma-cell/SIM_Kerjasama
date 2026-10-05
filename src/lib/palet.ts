/**
 * Chart colours: PCU Design System hues, in one place for every chart and the map. SVG and Leaflet need real
 * values, so these mirror the CSS variables in globals.css (same hex, same names).
 *
 * Order: midnight leads, then the accents. Neighbouring series differ in lightness, not hue alone.
 */
export const PALET = [
  "#19304b", // midnight
  "#3880d0", // blue (status-progress)
  "#45b8bc", // teal (status-approved)
  "#6aaa43", // green (status-active)
  "#be93e4", // purple (renewal-request)
  "#f37121", // orange (status-pending)
  "#ffbc00", // amber (sla-yellow)
];

/** Partner markers on Peta Mitra: domestic = green (status-active), international = blue (status-progress). */
export const WARNA_MITRA = { domestik: "#6aaa43", internasional: "#3880d0" } as const;
