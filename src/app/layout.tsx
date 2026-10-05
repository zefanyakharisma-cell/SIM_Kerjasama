import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/** Inter, self-hosted from the PCU Design System: the variable font, so headings get their Bold. */
const inter = localFont({
  src: [
    { path: "./fonts/Inter-Variable.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/Inter-Italic-Variable.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SIM Kerja Sama — Universitas Kristen Petra",
  description:
    "Sistem manajemen dokumen kerja sama Kantor Kerja Sama dan Urusan Internasional.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
