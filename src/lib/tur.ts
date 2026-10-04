/**
 * The guided tour shown while "Mode Tutorial" is on (see
 * components/tur-demo.tsx). Content only — the engine reads it.
 *
 * Every step points at an element marked `data-tour="<target>"`. A step whose
 * element is not on screen (another tab, a role that never sees it, mobile vs
 * desktop, an action that does not apply to this document) is skipped, so a
 * chapter can list everything a page might show and still never point at
 * nothing. A step without `target` is a centred card.
 */

export type Peran = "admin" | "user" | "user_staff" | "approver";

export type Langkah = {
  target?: string;
  judul: string;
  isi: string;
  /** Only these roles see the step; omitted means everyone. */
  peran?: Peran[];
};

export type Bab = {
  id: string;
  judul: string;
  /** Whether this chapter belongs to the page at `pathname`. */
  cocok: (pathname: string) => boolean;
  langkah: Langkah[];
};

/** Played once, before the first page chapter: the shell around every page. */
export const BAB_UMUM: Bab = {
  id: "umum",
  judul: "Pengenalan",
  cocok: () => false,
  langkah: [
    {
      judul: "Selamat datang di SIM Kerja Sama 👋",
      isi: "Tur singkat ini menjelaskan setiap menu, komponen dan tombol di aplikasi. Gunakan tombol Lanjut atau tombol panah → pada keyboard. Tekan Lewati kapan saja untuk berhenti.",
    },
    {
      target: "menu-seluler",
      judul: "Menu utama",
      isi: "Ketuk tombol ini untuk membuka menu. Semua halaman aplikasi bisa dibuka dari sini, dan di bagian bawahnya ada sakelar Mode Tutorial untuk menyalakan, mematikan, atau mengulang tur ini.",
    },
    {
      target: "menu",
      judul: "Menu utama",
      isi: "Semua halaman aplikasi ada di sini. Menu yang tampil menyesuaikan peran Anda — yang tidak bisa Anda gunakan tidak ditampilkan.",
    },
    {
      target: "menu-/dashboard",
      judul: "Dashboard",
      isi: "Ringkasan seluruh kerja sama: jumlah dokumen aktif, mitra, peta sebaran mitra, grafik, Activity Log, dan ruang diskusi.",
    },
    {
      target: "menu-/antrean",
      judul: "Antrean Saya",
      isi: "Daftar tugas Anda: setiap langkah yang sedang menunggu tindakan Anda, misalnya approval, tanda tangan, atau aktivasi. Mulailah hari Anda dari sini.",
    },
    {
      target: "menu-/kerja-sama",
      judul: "Cari Kerja Sama",
      isi: "Cari dan saring semua proposal dan dokumen kerja sama — aktif, disetujui, akan berakhir, pembaruan, hingga arsip — lalu unduh laporannya ke Excel.",
    },
    {
      target: "menu-/buat",
      judul: "Buat Kerja Sama",
      isi: "Ajukan kerja sama baru untuk di-approve. KUI juga dapat langsung mencatat dokumen yang sudah ditandatangani di luar sistem.",
      peran: ["admin", "user", "user_staff"],
    },
    {
      target: "menu-/master-data",
      judul: "Master Data",
      isi: "Kelola data acuan: mitra, jabatan, pegawai, unit, negara, dan daftar pilihan formulir.",
      peran: ["admin"],
    },
    {
      target: "menu-/admin",
      judul: "Pengaturan",
      isi: "Aturan sistem yang mengubah perilaku alur kerja: tier approval tiap jabatan serta ambang batas waktu dan pengingat.",
      peran: ["admin"],
    },
    {
      target: "akun",
      judul: "Akun Anda",
      isi: "Jabatan dan email yang sedang login. Klik untuk melihat detail akun dan tombol Keluar.",
    },
    {
      target: "lipat",
      judul: "Ciutkan menu",
      isi: "Perkecil sidebar menjadi deret ikon agar ruang kerja lebih lebar. Klik lagi untuk membukanya kembali.",
    },
    {
      target: "lonceng",
      judul: "Notifikasi",
      isi: "Lonceng notifikasi selalu melayang di atas halaman. Angka merah adalah notifikasi yang belum dibaca. Ketuk untuk membuka kotak masuk; seret untuk memindahkannya ke sisi layar mana pun.",
    },
    {
      target: "tur",
      judul: "Mode Tutorial",
      isi: "Selama sakelar ini aktif, setiap halaman yang Anda buka pertama kali akan menjelaskan isinya sendiri. Matikan bila sudah paham, atau pilih \"Ulangi tur halaman ini\" untuk mengulang.",
    },
  ],
};

export const BAB_HALAMAN: Bab[] = [
  {
    id: "dashboard",
    judul: "Dashboard",
    cocok: (p) => p === "/dashboard",
    langkah: [
      {
        target: "dashboard-tab",
        judul: "Tab Dashboard",
        isi: "Dashboard: angka dan grafik ringkasan. Activity Log: jejak setiap perubahan. Discussion: komentar dari seluruh dokumen. In Process (khusus admin): semua dokumen yang masih dalam proses, diurutkan dari yang paling mendesak.",
      },
      {
        target: "dashboard-statistik",
        judul: "Angka ringkasan",
        isi: "Jumlah kerja sama aktif, mitra internasional dan domestik, dokumen yang akan kedaluwarsa, dokumen dalam proses, approver yang melewati batas waktu (SLA), dan kecepatan penyelesaian dokumen. Klik sebuah kartu untuk membuka daftar di baliknya.",
      },
      {
        target: "dashboard-peta",
        judul: "Peta mitra",
        isi: "Sebaran lokasi mitra kerja sama di seluruh dunia. Perbesar dan klik penanda untuk melihat nama mitranya.",
      },
      {
        target: "dashboard-grafik",
        judul: "Studio grafik",
        isi: "Grafik ringkasan kerja sama. Setiap akun punya susunan grafiknya sendiri: tambah grafik baru, ubah, pindahkan urutannya, atau hapus — Reset mengembalikan susunan bawaan.",
      },
      {
        target: "dashboard-evaluasi",
        judul: "Rekap evaluasi",
        isi: "Rata-rata harapan dan kepuasan dari evaluasi pembaruan, per aspek. Selisih negatif berarti kepuasan masih di bawah harapan.",
        peran: ["admin"],
      },
      {
        target: "dashboard-proses",
        judul: "Dokumen dalam proses",
        isi: "Dikelompokkan per tahap. Bendera merah/kuning menandai approver yang terlambat — tangani yang merah terlebih dahulu.",
      },
    ],
  },
  {
    id: "antrean",
    judul: "Antrean Saya",
    cocok: (p) => p === "/antrean",
    langkah: [
      {
        target: "antrean-daftar",
        judul: "Tugas yang menunggu Anda",
        isi: "Setiap baris adalah satu langkah yang perlu Anda kerjakan. Label di atas nama mitra menyebut tindakannya (misalnya Approval atau Aktivasi). Klik baris untuk langsung membuka dokumennya.",
      },
      {
        target: "antrean-sla",
        judul: "Bendera batas waktu (SLA)",
        isi: "Menunjukkan berapa hari kerja dokumen sudah menunggu Anda. Kuning berarti mendekati batas, merah berarti sudah lewat.",
      },
      {
        target: "antrean-ringkasan",
        judul: "Ringkasan antrean",
        isi: "Rangkuman tugas Anda per jenis, dokumen yang mendekati batas waktu, dan persentase approval yang sudah Anda selesaikan.",
      },
    ],
  },
  {
    id: "kerja-sama",
    judul: "Cari Kerja Sama",
    cocok: (p) => p === "/kerja-sama",
    langkah: [
      {
        target: "ks-tab",
        judul: "Tab status",
        isi: "Proposal: yang masih diajukan/diproses. Kerja Sama Aktif: dokumen yang berlaku. Disetujui: menunggu tanda tangan dan aktivasi. Akan Berakhir: segera habis masa berlakunya. Pembaruan: perpanjangan yang sedang berjalan. Arsip: yang sudah selesai.",
      },
      {
        target: "ks-unduh",
        judul: "Unduh laporan",
        isi: "Unduh laporan dan data ke Excel. Pencarian dan filter yang sedang dipakai ikut terbawa ke file unduhan.",
      },
      {
        target: "ks-filter",
        judul: "Cari & saring",
        isi: "Ketik nama mitra atau nomor dokumen, lalu persempit dengan filter kolom dan urutan. Tekan Saring untuk memperbarui tabel.",
      },
      {
        target: "ks-tabel",
        judul: "Daftar dokumen",
        isi: "Klik nomor dokumen untuk membuka detailnya. Tombol di kolom aksi membuka laporan dokumen atau mengubah draf.",
      },
    ],
  },
  {
    id: "buat",
    judul: "Buat Kerja Sama",
    cocok: (p) => p === "/buat",
    langkah: [
      {
        target: "buat-pilihan",
        judul: "Dua cara membuat",
        isi: "Ajukan untuk approval: kerja sama baru yang melewati disposisi dan persetujuan. Catat langsung: dokumen yang sudah ditandatangani, langsung aktif tanpa approval.",
      },
      {
        target: "buat-mitra",
        judul: "I. Data Calon Mitra",
        isi: "Pilih mitra dari master data atau tambahkan mitra baru, beserta narahubungnya.",
      },
      {
        target: "buat-pengusul",
        judul: "II. Unit Pengusul",
        isi: "Jabatan/unit yang mengusulkan kerja sama ini.",
      },
      {
        target: "buat-kerjasama",
        judul: "III. Kerja Sama yang Diusulkan",
        isi: "Jenis dokumen (MoU, MoA, dll.), periode, tujuan, dan rincian kegiatan kerja sama.",
      },
      {
        target: "buat-unggah",
        judul: "Upload dokumen",
        isi: "Opsional: lampirkan draf dokumen dalam format PDF atau Word.",
      },
      {
        target: "buat-lingkup",
        judul: "IV. Lingkup Kerja Sama",
        isi: "Centang fakultas/prodi yang terlibat. Mencentang fakultas otomatis mencentang semua prodi di bawahnya.",
      },
      {
        target: "buat-aksi",
        judul: "Simpan atau ajukan",
        isi: "Simpan sebagai Draft bila data belum lengkap — draf hanya terlihat oleh Anda dan KUI. Ajukan untuk mengirimnya ke KUI agar didisposisikan ke approver.",
      },
    ],
  },
  {
    id: "catat",
    judul: "Catat Dokumen",
    cocok: (p) => p === "/catat",
    langkah: [
      {
        target: "buat-pilihan",
        judul: "Catat langsung",
        isi: "Halaman ini untuk dokumen yang sudah ditandatangani di luar sistem. Dokumen langsung tercatat aktif — tanpa pengajuan, disposisi, atau approval.",
      },
      {
        target: "catat-mitra",
        judul: "I–IV. Data kerja sama",
        isi: "Isi mitra, unit pengusul, rincian kerja sama dan lingkupnya, sama seperti formulir pengajuan.",
      },
      {
        target: "catat-dokumen",
        judul: "V. Dokumen bertanda tangan",
        isi: "Nomor dokumen, tanggal penandatanganan, masa berlaku, dan file dokumen yang sudah ditandatangani.",
      },
      {
        target: "catat-aksi",
        judul: "Simpan",
        isi: "Menyimpan dokumen sebagai kerja sama aktif.",
      },
    ],
  },
  {
    id: "detail",
    judul: "Detail Dokumen",
    cocok: (p) => /^\/kerja-sama\/\d+$/.test(p),
    langkah: [
      {
        target: "detail-header",
        judul: "Identitas dokumen",
        isi: "Nomor dokumen (atau nomor draf), status saat ini, jenis kerja sama, dan mitranya. Tautan di bawahnya membuka laporan lengkap dokumen ini.",
      },
      {
        target: "detail-info",
        judul: "Detail & lingkup",
        isi: "Periode, tanggal, unit pengusul, serta fakultas/prodi yang tercakup dalam kerja sama.",
      },
      {
        target: "detail-approval",
        judul: "Alur approval",
        isi: "Status persetujuan per tier dan per approver, lengkap dengan berapa lama setiap approver sudah menunggu. Approver yang mendapat giliran memberi keputusan di sini.",
      },
      {
        target: "detail-disposisi",
        judul: "Kirim disposisi",
        isi: "KUI memilih jabatan approver yang perlu menyetujui dokumen ini, lalu mengirimkannya.",
      },
      {
        target: "detail-siap-ttd",
        judul: "Tandai Siap TTD",
        isi: "Setelah semua tier menyetujui, tandai dokumen siap ditandatangani.",
      },
      {
        target: "detail-aktivasi",
        judul: "Aktivasi dokumen",
        isi: "Isi nomor dokumen, tanggal tanda tangan, dan unggah file final untuk mengaktifkan kerja sama.",
      },
      {
        target: "detail-akhiri",
        judul: "Akhiri lebih awal",
        isi: "Menghentikan kerja sama sebelum masa berlakunya habis. Tindakan ini tidak bisa dibatalkan.",
      },
      {
        target: "detail-rantai",
        judul: "Rantai pembaruan",
        isi: "Tautan ke dokumen sebelum dan sesudah perpanjangan.",
      },
      {
        target: "detail-riwayat",
        judul: "Riwayat",
        isi: "Catatan setiap kejadian pada dokumen ini — siapa melakukan apa, dan kapan.",
      },
    ],
  },
  {
    id: "master-data",
    judul: "Master Data",
    cocok: (p) => p === "/master-data",
    langkah: [
      {
        target: "md-tab",
        judul: "Jenis data",
        isi: "Pilih tabel yang ingin dikelola: mitra, jabatan, pegawai, unit, negara, dan daftar pilihan formulir.",
      },
      {
        target: "md-isi",
        judul: "Tambah, ubah, hapus",
        isi: "Formulir di atas menambah atau mengubah data; daftar di bawahnya menampilkan isi tabel. Perubahan langsung berlaku di semua formulir. Pada tab Mitra, Anda juga bisa menggabungkan mitra duplikat.",
      },
    ],
  },
  {
    id: "admin",
    judul: "Pengaturan",
    cocok: (p) => p === "/admin",
    langkah: [
      {
        target: "admin-tab",
        judul: "Bagian pengaturan",
        isi: "Tier Approval: tingkat persetujuan setiap jabatan. Ambang & Cadence: batas hari SLA dan jadwal pengingat.",
      },
      {
        target: "admin-isi",
        judul: "Ubah nilai",
        isi: "Nilai di sini mengubah perilaku alur kerja untuk semua dokumen. Ubah dengan hati-hati, lalu tekan Simpan pada barisnya.",
      },
    ],
  },
];

export const babUntuk = (pathname: string) => BAB_HALAMAN.find((b) => b.cocok(pathname)) ?? null;
