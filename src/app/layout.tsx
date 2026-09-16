import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIM Kerja Sama — Universitas Kristen Petra",
  description:
    "Sistem manajemen dokumen kerja sama Kantor Kerja Sama dan Urusan Internasional.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
