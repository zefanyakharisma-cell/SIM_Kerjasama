import type { Config } from "tailwindcss";

// PCU Brand Guidelines (2026 draft), Formal register — PRD §16.
// Values are provisional until MRD confirms (open item O3).
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#19304b",
        smoke: "#f1f1f1",
        brand: {
          blue: "#3880d0",
          orange: "#f37121",
          teal: "#45b8bc",
          green: "#6aaa43",
          purple: "#be93e4",
          yellow: "#ffbc00",
          red: "#e31f26",
          cerise: "#ec008c",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
