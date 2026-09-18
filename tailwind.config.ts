import type { Config } from "tailwindcss";

// Colours live once, as CSS variables in globals.css (PCU Brand Guidelines,
// Formal register — PRD §16). Tailwind only points at them.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "var(--midnight)",
        smoke: "var(--surface-sunk)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
