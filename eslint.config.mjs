import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// Flat config — `next lint` is deprecated and gone in Next 16, and the old
// interactive setup meant `npm run lint` could never run unattended. The
// Next presets are still eslintrc-shaped, so they come in through FlatCompat.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "public/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
