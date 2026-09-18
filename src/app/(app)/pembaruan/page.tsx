import { redirect } from "next/navigation";

/** Sending and tracking renewals moved to Cari Kerja Sama › Akan Berakhir. */
export default function PembaruanLama() {
  redirect("/kerja-sama?tab=berakhir");
}
