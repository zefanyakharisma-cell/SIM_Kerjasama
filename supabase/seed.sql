-- Seed: reference data plus the minimum org structure the tests and a first
-- login need. Applied by `supabase db reset`.
--
-- The pre-launch data prerequisites (PRD §18) that this only starts:
--   * every position's tier            — the 7 positions below are examples
--   * every approver's role email      — likewise
--   * the holiday calendar             — 2026 Indonesian public holidays below
--   * the unit parent-child hierarchy  — a real import is still owed
--   * the country dropdown             — a starter list below
-- The full ~379 units, ~41 positions, ~64 agenda types and complete country
-- list come from the import, not from here.

-- Countries ------------------------------------------------------------------
-- Full list (NEGARA.csv, the import mentioned above). is_domestic is the
-- authoritative domestic/international source and is true for exactly one row
-- (Indonesia, kept as id 1 — supabase/tests/domain_functions.sql inserts a
-- partner with id_negara=1); nothing anywhere compares country names (BR-16,
-- DR-07). kode is a display-only ISO 3166-1 alpha-3 (or a 3-letter stand-in
-- for the handful of non-ISO rows the source list carries, e.g. England);
-- lat/long from the source are not seeded here — negara has no such columns,
-- only partner.latitude/longitude (geocoded per partner) backs the map.
insert into negara (kode, nama, is_domestic) values
  ('IDN','Indonesia',true),
  ('AFG','Afghanistan',false), ('ALA','Aland Islands',false), ('ALB','Albania',false),
  ('DZA','Algeria',false), ('ASM','American Samoa',false), ('AND','Andorra',false),
  ('AGO','Angola',false), ('AIA','Anguilla',false), ('ATA','Antarctica',false),
  ('ATG','Antigua And Barbuda',false), ('ARG','Argentina',false), ('ARM','Armenia',false),
  ('ABW','Aruba',false), ('AUS','Australia',false), ('AUT','Austria',false),
  ('AZE','Azerbaijan',false), ('BHS','Bahamas',false), ('BHR','Bahrain',false),
  ('BGD','Bangladesh',false), ('BRB','Barbados',false), ('BLR','Belarus',false),
  ('BEL','Belgium',false), ('BLZ','Belize',false), ('BEN','Benin',false),
  ('BMU','Bermuda',false), ('BTN','Bhutan',false), ('BOL','Bolivia',false),
  ('BES','Bonaire, Saint Eustatius and Saba',false), ('BIH','Bosnia And Herzegovina',false),
  ('BWA','Botswana',false), ('BVT','Bouvet Island',false), ('BRA','Brazil',false),
  ('IOT','British Indian Ocean Territory',false), ('BRN','Brunei Darussalam',false),
  ('BGR','Bulgaria',false), ('BFA','Burkina Faso',false), ('BDI','Burundi',false),
  ('KHM','Cambodia',false), ('CMR','Cameroon',false), ('CAN','Canada',false),
  ('CPV','Cape Verde',false), ('CYM','Cayman Islands',false),
  ('CAF','Central African Republic',false), ('TCD','Chad',false), ('CHL','Chile',false),
  ('CHN','China',false), ('CXR','Christmas Island',false),
  ('CCK','Cocos (Keeling) Islands',false), ('COL','Colombia',false), ('COM','Comoros',false),
  ('COG','Congo',false), ('COD','Congo, The Democratic Republic Of The',false),
  ('COK','Cook Islands',false), ('CRI','Costa Rica',false), ('CIV','Cote D Ivoire',false),
  ('HRV','Croatia',false), ('CUB','Cuba',false), ('CUW','Curacao',false),
  ('CYP','Cyprus',false), ('CZE','Czech Republic',false), ('DNK','Denmark',false),
  ('DJI','Djibouti',false), ('DMA','Dominica',false), ('DOM','Dominican Republic',false),
  ('ECU','Ecuador',false), ('EGY','Egypt',false), ('SLV','El Salvador',false),
  ('ENG','England',false), ('GNQ','Equatorial Guinea',false), ('ERI','Eritrea',false),
  ('EST','Estonia',false), ('ETH','Ethiopia',false),
  ('FLK','Falkland Islands (Malvinas)',false), ('FRO','Faroe Islands',false),
  ('FJI','Fiji',false), ('FIN','Finland',false), ('FRA','France',false),
  ('GUF','French Guiana',false), ('PYF','French Polynesia',false),
  ('ATF','French Southern Territories',false), ('GAB','Gabon',false),
  ('GMB','Gambia',false), ('GEO','Georgia',false), ('DEU','Germany',false),
  ('GHA','Ghana',false), ('GIB','Gibraltar',false), ('GRC','Greece',false),
  ('GRL','Greenland',false), ('GRD','Grenada',false), ('GLP','Guadeloupe',false),
  ('GUM','Guam',false), ('GTM','Guatemala',false), ('GGY','Guernsey',false),
  ('GIN','Guinea',false), ('GNB','Guinea-Bissau',false), ('GUY','Guyana',false),
  ('HTI','Haiti',false), ('HMD','Heard Island And Mcdonald Islands',false),
  ('VAT','Holy See (Vatican City State)',false), ('HND','Honduras',false),
  ('HKG','Hong Kong',false), ('HUN','Hungary',false), ('ISL','Iceland',false),
  ('IND','India',false), ('IRN','Iran, Islamic Republic Of',false), ('IRQ','Iraq',false),
  ('IRL','Ireland',false), ('IMN','Isle Of Man',false), ('ISR','Israel',false),
  ('ITA','Italy',false), ('JAM','Jamaica',false), ('JPN','Japan',false),
  ('JEY','Jersey',false), ('JOR','Jordan',false), ('KAZ','Kazakhstan',false),
  ('KEN','Kenya',false), ('KIR','Kiribati',false),
  ('PRK','Korea, Democratic People Republic Of',false), ('KOR','Korea, Republic Of',false),
  ('KWT','Kuwait',false), ('KGZ','Kyrgyzstan',false),
  ('LAO','Lao People Democratic Republic',false), ('LVA','Latvia',false),
  ('LBN','Lebanon',false), ('LSO','Lesotho',false), ('LBR','Liberia',false),
  ('LBY','Libyan Arab Jamahiriya',false), ('LIE','Liechtenstein',false),
  ('LTU','Lithuania',false), ('LUX','Luxembourg',false), ('MAC','Macao',false),
  ('MKD','Macedonia, The Former Yugoslav Republic Of',false), ('MDG','Madagascar',false),
  ('MWI','Malawi',false), ('MYS','Malaysia',false), ('MDV','Maldives',false),
  ('MLI','Mali',false), ('MLT','Malta',false), ('MHL','Marshall Islands',false),
  ('MTQ','Martinique',false), ('MRT','Mauritania',false), ('MUS','Mauritius',false),
  ('MYT','Mayotte',false), ('MEX','Mexico',false),
  ('FSM','Micronesia, Federated States Of',false), ('MDA','Moldova, Republic Of',false),
  ('MCO','Monaco',false), ('MNG','Mongolia',false), ('MNE','Montenegro',false),
  ('MSR','Montserrat',false), ('MAR','Morocco',false), ('MOZ','Mozambique',false),
  ('MMR','Myanmar',false), ('NAM','Namibia',false), ('NRU','Nauru',false),
  ('NPL','Nepal',false), ('NLD','Netherlands',false), ('ANT','Netherlands Antilles',false),
  ('NCL','New Caledonia',false), ('NZL','New Zealand',false), ('NIC','Nicaragua',false),
  ('NER','Niger',false), ('NGA','Nigeria',false), ('NIU','Niue',false),
  ('NFK','Norfolk Island',false), ('MNP','Northern Mariana Islands',false),
  ('NOR','Norway',false), ('OMN','Oman',false), ('PAK','Pakistan',false),
  ('PLW','Palau',false), ('PSE','Palestinian Territory, Occupied',false),
  ('PAN','Panama',false), ('PNG','Papua New Guinea',false), ('PRY','Paraguay',false),
  ('PER','Peru',false), ('PHL','Philippines',false), ('PCN','Pitcairn',false),
  ('POL','Poland',false), ('PRT','Portugal',false), ('PRI','Puerto Rico',false),
  ('QAT','Qatar',false), ('REU','Reunion',false), ('ROU','Romania',false),
  ('RUS','Russian Federation',false), ('RWA','Rwanda',false),
  ('BLM','Saint Bartelemey',false), ('SHN','Saint Helena',false),
  ('KNA','Saint Kitts And Nevis',false), ('LCA','Saint Lucia',false),
  ('MAF','Saint Martin',false), ('SPM','Saint Pierre And Miquelon',false),
  ('VCT','Saint Vincent And The Grenadines',false), ('WSM','Samoa',false),
  ('SMR','San Marino',false), ('STP','Sao Tome And Principe',false),
  ('SAU','Saudi Arabia',false), ('SEN','Senegal',false), ('SRB','Serbia',false),
  ('SCG','Serbia And Montenegro',false), ('SYC','Seychelles',false),
  ('SLE','Sierra Leone',false), ('SGP','Singapore',false), ('SXM','Sint Maarten',false),
  ('SVK','Slovakia',false), ('SVN','Slovenia',false), ('SLB','Solomon Islands',false),
  ('SOM','Somalia',false), ('ZAF','South Africa',false),
  ('SGS','South Georgia And The South Sandwich Islands',false), ('SSD','South Sudan',false),
  ('ESP','Spain',false), ('LKA','Sri Lanka',false), ('SDN','Sudan',false),
  ('SUR','Suriname',false), ('SJM','Svalbard And Jan Mayen',false), ('SWZ','Swaziland',false),
  ('SWE','Sweden',false), ('CHE','Switzerland',false), ('SYR','Syrian Arab Republic',false),
  ('TWN','Taiwan, Province Of China',false), ('TJK','Tajikistan',false),
  ('TZA','Tanzania, United Republic Of',false), ('THA','Thailand',false),
  ('TLS','Timor-Leste',false), ('TGO','Togo',false), ('TKL','Tokelau',false),
  ('TON','Tonga',false), ('TTO','Trinidad And Tobago',false), ('TUN','Tunisia',false),
  ('TUR','Turkey',false), ('TKM','Turkmenistan',false),
  ('TCA','Turks And Caicos Islands',false), ('TUV','Tuvalu',false), ('UGA','Uganda',false),
  ('UKR','Ukraine',false), ('ARE','United Arab Emirates',false),
  ('GBR','United Kingdom',false), ('USA','United States',false),
  ('UMI','United States Minor Outlying Islands',false), ('URY','Uruguay',false),
  ('UZB','Uzbekistan',false), ('VUT','Vanuatu',false), ('VEN','Venezuela',false),
  ('VNM','Viet Nam',false), ('VGB','Virgin Islands, British',false),
  ('VIR','Virgin Islands, U.S.',false), ('WLF','Wallis And Futuna',false),
  ('ESH','Western Sahara',false), ('YEM','Yemen',false), ('ZMB','Zambia',false),
  ('ZWE','Zimbabwe',false);

-- Fields of cooperation ------------------------------------------------------
insert into bidang_kerjasama (nama) values
  ('Pembelajaran'), ('Penelitian'), ('Abdimas'), ('Kemahasiswaan'), ('Kelembagaan');

-- Partner categories (JENIS_MITRA.csv) ---------------------------------------
insert into jenis_mitra (nama) values
  ('Pendidikan'), ('Industri'), ('Organisasi/Yayasan/Asosiasi'),
  ('Lembaga Pemerintahan'), ('Perorangan/Kedutaan/Gereja');

-- Cooperation agenda ---------------------------------------------------------
-- Full list (AGENDA_KERJASAMA.csv, the import mentioned above). is_amendment
-- flags the addendum path so it is detected by a boolean, never by matching
-- the Indonesian string (BR-16).
insert into agenda (nama, is_amendment) values
  ('Tridharma Perguruan Tinggi', false), ('Kuliah Tamu/Guest Lecturer', false),
  ('Gelar Bersama/Joint Degree', false), ('Gelar Ganda/Double Degree', false),
  ('Gelar Percepatan/Fast Track', false), ('Student Exchange', false),
  ('Study Abroad', false), ('Magang/Internship', false), ('Immersion', false),
  ('Short Program', false), ('Studi Ekskursi', false), ('Tugas Akhir', false),
  ('Thesis Writing', false), ('Academic Visit', false), ('Academic Exchange', false),
  ('Cultural Exchange', false), ('Facilities Exchange', false),
  ('Staf/Faculty Exchange', false), ('Joint Curriculum', false),
  ('Credit Transfer', false), ('Joint Lecturer/ Kuliah Bersama', false),
  ('Joint Projects (Konferensi/Seminar/Workshop/Lomba/pameran)', false),
  ('Joint Research', false), ('Publikasi Jurnal Ilmiah', false),
  ('Merdeka Belajar Kampus Merdeka (MBKM)', false), ('Rekrutmen Lulusan', false),
  ('Pengabdian Kepada Masyarakat/ Service Learning', false), ('Beasiswa', false),
  ('Hibah/Donasi', false), ('Educational and Training Program', false),
  ('Sertifikasi', false), ('Akreditasi', false), ('Program Sejong Korean', false),
  ('Penerimaan mahasiswa baru', false), ('Pemanfaatan e-AMITRA', false),
  ('Penyelenggaraan Pusat Dukungan Teknologi dan Inovasi', false),
  ('Penyelenggaraan IELTS Off-site Testing', false),
  ('Penyelenggaraan Tax Center', false),
  ('Pelaksanaan Asesor BKD Sertifikasi Dosen', false),
  ('Pendayagunaan Aparatur Negara dan Pelaksanaan Reformasi Birokrasi', false),
  ('Pemberdayaan dan pemanfaatan perpustakaan', false),
  ('Website Bursa Informasi Pendidikan Tinggi (BIDikTi)', false),
  ('Layanan Transaksi Online', false), ('Asuransi', false),
  ('Penyediaan Layanan Telekomunikasi', false), ('Promosi Kegiatan', false),
  ('Pembuatan Website', false), ('Proyek pendukung untuk Penelitian', false),
  ('Perjanjian Kerahasiaan', false), ('Pelatihan Guru', false),
  ('Pengembangan dan kerahasiaan layanan komputasi, server, perangkat lunak, penyimpanan data, database, dan jaringan modul digital dalam Platform LMS Gamifikasi', false),
  ('Pengembangan modul digital ke dalam Platform LMS Gamifikasi', false),
  ('Pemanfaatan LMS Gamifikasi sebagai medium pembelajaran di universitas masing-masing.', false),
  ('Layanan Digital', false), ('Pemanfaatan Sistem Pembelajaran Petraverse', false),
  ('Pelatihan', false), ('Program ODP (Officer Development Program)', false),
  ('Product & Design Development Center', false),
  ('Software Application Development Center', false),
  ('Perlindungan anak, kesehatan masyarakat, sosial, ekonomi, lingkungan, kebencanaan', false),
  ('Pelayanan pendaftaran HAKI pada lingkup sektor industri yang tersedia', false),
  ('Pemanfaatan Vending Machine', false), ('Joint Project (Pemberian Jasa)', false),
  ('Pendirian Fakultas Kedokteran Gigi', false), ('Adendum/Amandemen', true),
  ('Online Course', false), ('Program Darmasiswa', false),
  ('Falling Walls Lab Indonesia', false), ('Business Class with PBS', false),
  ('Kegiatan Mata Kuliah Wajib Kurikulum (MKWK)', false),
  ('Perekrutan mahasiswa', false), ('Dual Degree', false);

-- Tujuan Kerjasama / Manfaat pools --------------------------------------------
-- Dedicated dropdown tables (see 20260917001300_split_tujuan_manfaat.sql) from
-- the historical import (TUJUAN_KERJASAMA.csv, MANFAAT_BAGI_PETRA.csv,
-- MANFAAT_BAGI_MITRA.csv). JENIS-DOKUMEN (MoU/MoA) from the tujuan source is
-- per-proposal (proposal_dokumen.jenis_kerjasama), not part of this shared
-- text pool, so it is not carried over here.
insert into tujuan_kerjasama (nilai) values
  ('Mendukung visi/misi Para Pihak'),
  ('Mampu menawarkan sertifikasi PMP dan menyiapkan dosen-dosen menjadi trainer kelas persiapannya'),
  ('untuk melaksanakan suatu kegiatan yang bersifat saling membantu dan meningkatkan potensi PARA PIHAK dengan prinsip saling memberi dan mendapatkan manfaat.'),
  ('Untuk mendukung peningkatan pengembangan mahasiswa dari berbagai aspek, khususnya di bidang wawasan global dan apresiasi budaya'),
  ('Untuk mengembangkan kerjasama akademik dan Pendidikan dan untuk mempromosikan saling pengertian antara kedua universitas.'),
  ('Meningkatkan dan mengembangkan kualitas pendidikan profesi Keinsinyuran, serta Penelitian Bersama'),
  ('meningkatkan mutu penyelenggaraan, serta mutu dan jumlah lulusan Program Studi Program Profesi Insinyur di Indonesia'),
  ('Untuk saling menguntungkan dan saling mendukung antara PARA PIHAK'),
  ('Pelaksanaan program Pemantapan Guru Muda (PGM) untuk Mahasiswa FKIP'),
  ('Membangun Test Center di UK Petra untuk pelaksanaan Ujian Profesi Akuntan Publik CPA bagi Mahasiswa UK Petra.'),
  ('untuk saling menunjang dan saling memberi manfaat bagi kedua belah pihak.'),
  ('Memajukan dan mengembangkan kerjasama di bidang akademik, penelitian, dan administrasi dalam rangka penyelenggaraan rangkap sarjana.'),
  ('Bekerjasama dalam hal untuk menyediakan dan menjelaskan data yang dibutuhkan oleh UK Petra'),
  ('Sebagai landasan dan pedoman dalam melakukan eksplorasi kolaborasi digital atas pengembangan Smart Urban Farming.'),
  ('Menempatkan dan memberikan beasiswa kepada beberapa orang calon mahasiswa yang akan studi di PGPAUD atau PGSD FKIP.'),
  ('Untuk meningkatkan performa dan kualitas petraverse dari segi teknis dan sistem serta pengembangan modul dan upgrade sistem database dari Petraverse'),
  ('Menyinergikan dan mengoptimalkan potensi & sumber daya PARA PIHAK dalam rangka pengembangan kelembagaan dan pengembangan sumber daya manusia.'),
  ('Menyinergikan dan mengoptimalkan potensi dan sumber daya PARA PIHAK dalam rangka pengembangan kelembagaan, dan pengembangan sumber daya manusia di tingkat Fakultas dan Program Studi.'),
  ('Meningkatkan tampilan dan fungsi website yang lebih menarik dan mudah digunakan'),
  ('c. Menjalin kerja sama yang bersifat kemitraan dalam bidang pengabdian kepada masyarakat bagi mahasiswa dan/atau dosen di FKIP UKSW dan FKIP UK Petra'),
  ('Menjalin kerja sama yang bersifat kemitraan dalam bidang penguatan keilmuan dalam pendidikan dan pengajaran bagi mahasiswa dan/atau dosen di FKIP UKSW dan FKIP UK Petra dengan semangat Whole Person Education dalam kerangka Merdeka Belajar Kampus Merdeka'),
  ('b. Menjalin kerja sama yang bersifat kemitraan dalam bidang penelitian dan publikasi ilmiah bagi mahasiswa dan/atau dosen di FKIP UKSW dan FKIP UK Petra'),
  ('Memenuhi kebutuhan guru bahasa Tionghoa dalam meningkatkan kemampuan bahasa Tionghoa dan keterampilan mengajar bahasa Tionghoa'),
  ('Mengirimkan Mahasiswa S1 dan S2 untuk study abroad ke Monash University'),
  ('Menyepakati hak dan kewajiban Para Pihak'),
  ('Menyelenggarakan kerjasama pelaksanaan Tridharma Perguruan Tinggi dalam Program Sinergitas Pembangunan Kota Surabaya.'),
  ('Terlaksananya program kelas kolaborasi yaitu pembelajaran oleh dosen dan praktisi kepada mahasiswa.'),
  ('Magang dan Rekrutmen'),
  ('Berafiliasi agar mendapatkan jangkauan yang lebih lagi untuk kedua Pihak.'),
  ('Pemanfaatan dan pengembangan sistem pembelajaran Petraverse di universitas'),
  ('untuk menawarkan program magister gelar bersama untuk mahasiswa dari Program Studi Magister Teknik Sipil, PCU'),
  ('Menyepakati hak dan kewajiban masing-masing UKP dan Saxion IFA.'),
  ('Sebagai landasan dalam pelaksanaan Pendidikan Sertifikasi Internasional Pemasar Digital Profesional (Certified Digital Marketing Professional - CDMP)'),
  ('Kegiatan bersama dalam rangka mengedukasi masyarakat terkait literasi budaya dan sains'),
  ('Karya Esensi Data / QED Research Consulting, membantu Career Center untuk melaksanakan riset focus group discussion bagi alumni Petra'),
  ('Kolaborasi dg dunia industri dalam hal transfer pengetahuan/pengalaman dlm menghasilkan SDM yang lebih berkualitas'),
  ('Memberikan beasiswa serta menyediakan tempat magang bagi Mahasiswa FKIP'),
  ('mengembangkan kerja sama berdasarkan kebutuhan akademik, ilmiah dan pendidikan masing – masing'),
  ('Memanfaatkan pembelajaran dalam jaringan (daring) pada Petraverse.'),
  ('Melengkapi kompetensi lulusan Universitas Kristen Petra.'),
  ('Melengkapi kompetensi lulusan Universitas Kristen Petra'),
  ('menetapkan peran dan tanggung jawab masing-masing Pihak dalam bekerja sama untuk memajukan kepentingan satu sama lain dan kepentingan bersama dengan mempromosikan CPA Australia dan penunjukan CPA di Organisasi Partisipan'),
  ('Meningkatkan kesadaran, kemauan dan kemampuan untuk hidup sehat bagi setiap orang agar terwujudnya derajat kesehatan masyarakat yang optimal'),
  ('Melaksanakan Program Matching Fund "Kedaireka" 2023'),
  ('Meningkatkan kualitas keilmuan desain dan kreatif, serta mendorong industri kreatif, khususnya produk alas kaki di Indonesia.'),
  ('untuk meningkatkan hubungan kelembagaan PARA PIHAK dalam kegiatan Pendidikan, Penelitian, dan Pengabdian Kepada Masyarakat, dan kegiatan penunjang lainnya.'),
  ('Memperkuat, mempromosikan, dan mengembangkan hubungan kolaborasi riset dan inovasi antara PARA PIHAK'),
  ('Penyelenggaraan Magang atau Pelatihan Kerja'),
  ('Perekrutan lulusan Universitas Kristen Petra'),
  ('Mengoptimalkan penyelenggaraan Pendidikan, Penelitian, Pengabdian kepada Masyarakat, serta Pengembangan Sumber Daya Institusi di lingkungan PARA PIHAK;'),
  ('Pembinaan Program Studi Sarjana Pendidikan Dokter dan Program Studi Profesi Gigi yang baru'),
  ('Pelaksanaaan Enrichment Talk dengan narasumber oleh Dekan FKG UGM'),
  ('Pelaksanaan program magang'),
  ('Mengadakan kerja sama dalam berbagai bidang pelayanan dan kesaksian sesuai dengan Visi dan Misi yang diemban.'),
  ('Pembentukkan pendidikan kedokteran dan menciptakan tenaga profesional di bidang kedokteran'),
  ('Mendukung persiapan pendirian FKG'),
  ('Menawarkan sertifikasi internasional dan nasional dalam bidang manajemen risiko dan audit internal'),
  ('UKP sebagai pelaksana pemantauan pelatihan dalam ekosistem prakerja'),
  ('Pelaksanaan pendidikan non gelar di bidang seni dan budaya serta bahasa Indonesia bagi WNA'),
  ('Melakukan tes psikologi'),
  ('Sebagai landasan dalam pelaksanaan Pendidikan Sertifikasi Internasional Perencana Keuangan Personal (Certified of Financial Planner) dan RFP'),
  ('Melahirkan lulusan yang berkompeten dan berintegritas untuk melayani masyarakat melalui bidang keilmuan masing-masing.'),
  ('kegiatan pembelajaran mengaplikasikan faith and learning integration di tempat PIHAK KEDUA dalam rangka penelitian dan penyelenggaraan pengabdian kepada masyarakat.'),
  ('Membangun kerja sama strategis dalam pengembangan pendidikan, riset, pelatihan, serta pengabdian masyarakat di bidang keamanan siber.'),
  ('promosi'),
  ('Memanfaatkan sumber daya yang dimiliki masing-masing sesuai dengan fungsi dan kewenangan masing-masing'),
  ('Memberikan donasi untuk pelaksanaan kelas di UK Petra'),
  ('Melaksanakan Penelitian Bersama guna mendukung pengembangan ilmu pengetahuan dan industri.'),
  ('Mendukung pengembangan Program Studi Teknik Sipil, Universitas Kristen Petra, khususnya dalam menghasilkan Sarjana Teknik Sipil yang berkualitas, serta dilandasi itikad baik para pihak.'),
  ('Penyediaan produk dan/atau jasa Layanan Perbankan yang terintegrasi dengan Layanan Digitalisasi yang dikembangkan dan dikelola partner yang ditunjuk, yang diperuntukkan untuk memenuhi kebutuhan Universitas'),
  ('Meningkatkan kualitas pelaksanaan tugas dan fungsi para pihak sesuai dengan kewenangan yang dimiliki.'),
  ('Mengembangkan kerja sama berdasarkan kebutuhan akademiik, ilmiah, dan pendidikan masing-masing'),
  ('Melakukan kerja sama dengan memanfaatkan sumber daya yang dimiliki oleh masing-masing pihak.'),
  ('Mendukung pengembangan SDM/Fakultas serta mahasiswa dari masing-masing pihak khususnya dalam ranah global dan peningkatan/kemajuan akademik.'),
  ('Melaksanakan kegiatan Bakti Sosial Pelayanan Kesehatan Gigi dan Mulut bagi Anak dan Masyarakat di Wilayah Waingapu, Sumba Timur'),
  ('Bekerja sama dalam hal penyelenggaraan pelatihan dan kegiatan peningkatan kompetensi bidang kesehatan'),
  ('Saling mendukung pengembangan institusi dan SDM bidang kedokteran gigi serta menguatkan kemitraan dengan universitas LN.'),
  ('Magang dan Rekrutmen Lulusan'),
  ('Menjalin kerja sama dalam bidang penelitian bersama dan pengembangan akademik untuk mencapai visi dan misi masing-masing pihak'),
  ('Pengakuan Internasional dan Standarisasi Global Melalui Sertifikasi Internasional'),
  ('Meningkatkan kemampuan softsfkill dan hardskill mahasiswa');

insert into manfaat_petra (nilai) values
  ('Meningkatkan kerjasama dengan berbagai pihak guna memperkaya pelaksanaan Tridharma Perguruan Tinggi'),
  ('Mendukung misi UK Petra dalam mempertahankan Integritas UK Petra sebagai perguruan tinggi Kristen'),
  ('Manfaat bagi UKP Dapat melengkapi kompetensi lulusan Universitas Kristen Petra.'),
  ('Mengembangkan wawasan global dan apresiasi budaya dari mahasiswa UK Petra'),
  ('Mempererat hubungan kerjasama dengan universitas di China.'),
  ('Membekali calon insinyur lulusan UK Petra dengan kualitas pendidikan profesi Keinsinyuran dengan mutu yang terjamin.'),
  ('Mendukung peningkatan pendidikan dan kompetensi UK Petra'),
  ('Meningkatkan kualitas pendidikan calon guru muda lulusan FKIP secara akademik, emosional, dan spiritual.'),
  ('Memperluas kesempatan Mahasiswa UK Petra untuk mengikuti Ujian Profesi Akuntan Publik Certified Public Accountant of Indonesia.'),
  ('Menunjang kualitas sistem pembelajaran sumber daya, kelembagaan dalam dunia pendidikan pada umumnya'),
  ('Memperoleh data akurat dan terpercaya sesuai dengan kebutuhan melalui lembaga yang kredibel'),
  ('Meningkatkan kerja sama dengan berbagai pihak dalam rangka mendukung pelaksanaan Tridarma Perguruan Tinggi'),
  ('Memperoleh kemampuan dan sumber daya yang dapat diberikan untuk pengembangan Smart Urban Farming.'),
  ('Memberikan beasiswa bagi calon mahasiswa UK Petra dan mendukung program Tri Dharma perguruan tinggi.'),
  ('Mendapatkan calon mahasiswa untuk studi di PGPAUD atau PGSD FKIP.'),
  ('Melindungi kerahasiaan informasi penting yang berhubungan dengan kerja sama juga mengembangkan kualitas Petraverse menjadi lebih sempurna.'),
  ('menyinergikan dan mengoptimalkan potensi dan sumber daya PARA PIHAK dalam rangka pengembangan kelembagaan dan pengembangan sumber daya manusia.'),
  ('Kesempatan melakukan kegiatan Tridarma Perguruan Tinggi (pendidikan, penelitian, dan pengabdian kepada masyarakat)'),
  ('Meningkatkan tampilan dan fungsi website yang lebih menarik dan mudah digunakan'),
  ('Membangun relasi yang saling menguntungkan dengan mitra SMA di Indonesia dan meningkatkan sistem pendidikan yang memadai dan semakin berkualitas'),
  ('Mengembangkan layanan untuk kelas IELTS preparation khususnya simulasi test IELTS'),
  ('Memperlengkapi guru bahasa Tionghoa di Prodi Bahasa Mandarin agar menjadi guru Tionghoa yang lebih terampil'),
  ('Menambah relasi mitra dan mendukung program Tri Dharma perguruan tinggi.'),
  ('Meningkatkan pendidikan akademik dan pendidikan vokasi mahasiswa UK Petra'),
  ('Meningkatkan kompetensi mahasiswa dan dosen, menyiapkan lulusan sebagai pemimpin masa depan bangsa yang unggul dan berkepribadian, serta mewadahi kegiatan pembelajaran, penelitian, dan pengabdian kepada masyarakat oleh mahasiswa dan dosen.'),
  ('Agar lulusan dapat memperoleh ilmu dan kecakapan sesuai dengan kebutuhan dan tantangan di dunia kerja dan profesional.'),
  ('Mempercepat masa tunggu lulusan dengan menyediakan tempat magang dan bekerja bagi para lulusan.'),
  ('Mempererat hubungan dengan mitra PT. Grab Teknologi Indonesia agar mempermudah kerjasama di kemudian hari.'),
  ('Mengembangkan sistem pembelajran Petraverse lebih luas lagi.'),
  ('Menyediakan pilihan program internasional bagi mahasiswa'),
  ('Meningkatkan layanan komunikasi bagi mahasiswa dan calon mahasiswa'),
  ('Sebagai salah satu sarana memastikan lulusan Prodi MM UK Petra peminatan Branding and Digital Marketing menjadi pemimpin dan praktisi pemasaran digital yang handal dan profesional khususnya di tengah persaingan bisnis di era digital saat ini di Indonesia.'),
  ('Meningkatkan layanan dan manfaat bagi lulusan'),
  ('Mendukung FKIP untuk menemukan putra/i daerah yang bisa kembali melayani daerah/sekolah pengutus setelah lulus'),
  ('Kesempatan bagi dosen untuk meningkatkan kompetensi social media management melalui penelitian bersama'),
  ('Memperlengkapi mahasiswa menjadi pendidik Kristen yang berkualitas akademik, emosional, dan spiritual terbaik di zamannya.'),
  ('Mahasiswa mendapatkan pengalaman di luar kampus dan dosen dapat melaksanakan P2M'),
  ('Membuka kesempatan PKL bagi mahasiswa dan meningkatkan kualitas pendidikan dan keilmuan'),
  ('Meningkatkan pemanfaatan modul Petraverse dan publikasi dalam penggunaan petraverse di lingkup eksternal.'),
  ('Mendapatkan benefit berupa Vending Machine yang dapat diakses dengan mudah oleh civitas PCU dan menjadi tempat untuk mempromosikan informasi penting.'),
  ('Memberikan kesempatan bagi dosen/mahasiswa prodi Desain Fashion dan Tekstil untuk berkarya dan meningkatkan skill.'),
  ('Mendapatkan exposure dari segi internasionalisasi dan memperoleh inbound student.'),
  ('Mendapatkan pembinaan yang layak dan terarah oleh salah satu kampus kredibel di Indonesia dalam membentuk Fakultas Kedokteran dan Kedokteran Gigi'),
  ('Mendukung penyebaran Alkitab terutama versi bahasa daerah ke pelosok - pelosok Indonesia dan membangun komunitas pemahaman akan Alkitab di UK Petra'),
  ('Membangun hubungan dengan mitra yang dapat membantu dalam proses pembentukan fakultas kedokteran yang berkualitas'),
  ('Mendapatkan calon mahasiswa FK UKP dan membantu dalam peningkatan pelayanan dan kualitas Kab. Maluku Tengah'),
  ('Mendapatkan calon mahasiswa FK UKP dan membantu dalam peningkatan pelayanan dan kualitas Kesehatan Kab. Sumba Timur'),
  ('Mendapatkan calon mahasiswa FK UKP dan membantu dalam peningkatan pelayanan dan kualitas kesehatan di Kab. Sumba Barat Daya'),
  ('Meningkatkan exposure dan keterlibatan PCU dalam pembangunan SDM Indonesia'),
  ('Memperluas kesempatan bagi mahasiswa UKP untuk mendapat pengalaman internasional.'),
  ('Menjalin kerjasama dengan TedX Surabaya dan mendapatkan insight dari para profesional melalui seminar oleh TEDX yang dihadiri oleh narasumber yang bagus'),
  ('Memperoleh informasi dan pengetahuan baru untuk mengembangkan kualitas kelembagaan di UK Petra.'),
  ('Memperoleh pegawai magang yang dapat mendukung berjalannya operasional universitas'),
  ('Berkesempatan melakukan penelitian dan meningkatkan IKP2M'),
  ('Mempromosikan KSI semakin luas ke khalayak umum'),
  ('Memperkenalkan program di Petra kepada calon mahasiswa serta mendapatkan calon mahasiswa baru untuk bergabung di UK Petra'),
  ('Meningkatkan kompetensi mahasiswa melalui kegiatan peningkatan kompetensi dan membantu mahasiswa Kristen dapat berkontribusi bagi bangsa.'),
  ('mendapatkan data hasil tes psikologi dengan lebih cepat dan akurat'),
  ('mendapatkan data hasil tes psikologi dari program OMNI'),
  ('Sebagai salah satu sarana memastikan lulusan Prodi MM UK Petra peminatan Wealth and Personal Finance menjadi pemimpin dan praktisi perencanaan keuangan pribadi yang kredibel, berintegritas dan berdampak bagi masyarakat'),
  ('Mendapatkan informasi dan pengembangan pelayanan misi'),
  ('Memperoleh jumlah masukan mahasiswa ke PBS sedini mungkin melalui kegiatan belajar di program Foundation'),
  ('Memperoleh mahasiswa dari Tanah Papua dan Sumba dengan tingkat kompetensi yang tinggi'),
  ('Koordinasi dan kolaborasi penanganan serangan siber'),
  ('Mendapatkan bantuan beasiswa bagi mahasiswa FKIP yang akan menjadi calon guru berkualitas.'),
  ('Mahasiswa dapat melakukan Joint Degree di universitas ranking dunia'),
  ('Penyediaan ruang untuk pembelajaran mahasiswa'),
  ('Promosi dan pameran di lokasi mitra, kerja sama antara Fakultas/Prodi dengan mitra terkait Tridharma Perguruan Tinggi, serta pemberian beasiswa'),
  ('Memberikan beasiswa dan penghargaan bagi mahasiswa S1 Teknik Sipil UK Petra'),
  ('Mempermudah UK Petra untuk menjangkau civitas akademika (termasuk alumni) yang tergerak untuk berdonasi, mempererat relasi dengan alumni, melalui aplikasi'),
  ('Saling menjaga dan mengetahui cara pengelolaan Informasi Rahasia yang diperoleh tiap pihak terkait realisasi kerja sama'),
  ('Memperoleh informasi, dukungan, dan bantuan perihal layanan digitalisasi dan perbankan'),
  ('Meningkatkan internasionalisasi serta menambah mahasiswa baru dari luar negeri'),
  ('Mengembangkan kerja sama berdasarkan kebutuhan akademik, ilmiah, dan pendidikan masing-masing.'),
  ('Berkontribusi dalam kegiatan sosial serta memperluas dan memperkuat jaringan kerja sama.'),
  ('Meningkatkan presentasi siswa bergabung di UK Petra dan mengikuti program JD dengan IMI'),
  ('Sebagai pusat ujian resmi TOEIC, TOEFL dan Certiport'),
  ('Meningkatkan kompetensi akademik mahasiswa, co-ass, dan staf pengajar FKG melalui pembaruan ilmu dan fasilitas teknologi medis terkini'),
  ('Merekrut mahasiswa asing menjadi mahasiswa di UK Petra'),
  ('Perekrutan calon mahasiswa dalam negeri di UK Petra'),
  ('Meningkatkan publikasi jurnal penelitian di forum international');

insert into manfaat_mitra (nilai) values
  ('Meningkatkan kerjasama dengan berbagai pihak guna memperkaya pelaksanaan Tridharma Perguruan Tinggi'),
  ('Menyembangkan channel promosi sertifikasi yang dimiliki'),
  ('Mendukung misi BAMAG dalam menyelenggarakan koordinasi dengan instansi terkait dalam mewujudkan kesatuan dan persatuan NKRI.'),
  ('Manfaat bagi Calon Mitra Memperkuat kerja sama dan membuka kesempatan magang bagi calon lulusan Universitas Kristen Petra'),
  ('Mengembangkan wawasan global dan apresiasi budaya dari mahasiswa ZYU'),
  ('Mempererat hubungan kerjasama degan universitas di Indonesia.'),
  ('Membekali calon insinyur Indonesia dari UK Petra dengan kualitas pendidikan profesi Keinsinyuran.'),
  ('Mendukung misi PT Kamdjaja Logistics dalam memiliki hubungan mutual yang menguntungkan dengan pihak mitra.'),
  ('Mendukung pengembangan institusi pendidikan tinggi yang berkualitas dan mendapatkan calon guru muda yang bermuut'),
  ('Mendukung misi IAPI yaitu menyediakan standar profesi akuntan publik dan kode etik yang berstandar internasional.'),
  ('Mengembangkan wawasan global dan apresiasi budaya dari mahasiswa Taiwan Tech'),
  ('Mendapatkan klien untuk penggunaan jasa penyedia data ESGI Dataset'),
  ('Mendukung tercapainya visi misi organisasi'),
  ('Mendukung misi WILL dalam meningkatkan kemampuan individu, tim, dan organisasi untuk berhasil dalam pengeksekusian akan suatu hal'),
  ('Mendukung proses pengembangan salah satu use case IoT yaitu Smart Urban Farming.'),
  ('Memperoleh calon - calon guru berkualitas untuk pelayanan di sekolah dalam naungan Yayasan Exodus.'),
  ('Memperoleh calon - calon guru dengan ikatan dinas untuk mengajar di sekolah dalam naungan Yayasan Exodus.'),
  ('Melindungi kerahasiaan informasi penting yang berhubungan dengan kerja sama dan mendapatkan klien untuk penggunaan jasa cloud transformation.'),
  ('Melindungi kerahasiaan informasi penting yang berhubungan dengan kerja sama dan mendapatkan klien untuk penggunaan jasa pengembangan teknologi produk.'),
  ('menyinergikan dan mengoptimalkan potensi dan sumber daya PARA PIHAK dalam rangka pengembangan kelembagaan dan pengembangan sumber daya manusia.'),
  ('Dukungan untuk pelaksanaan tridarma PT dan Kampus Merdeka'),
  ('Membangun relasi yang saling menguntungkan dengan mitra dan meningkatkan sistem pendidikan yang memadai dan semakin berkualitas'),
  ('Memperkuat guru-guru Tionghoa yang ada di Indonesia terkhususnya di UK Petra sebagai salah satu universitas terkemuka di Indonesia'),
  ('Mendukung RSM Indonesia untuk memperluas talent pool dan mendapatkan talenta berbakat.'),
  ('Mendapatkan mahasiswa dari universitas ternama serta meningkatkan pendidikan akademik serta pendidikan vokasi mahasiswa'),
  ('Menambah jumlah mahasiswa asing dan mendukung kualitas pembelajaran terutama dalam hal penelitian'),
  ('Mendukung kegiatan pemerintah kota Surabaya di bidang pembangunan dan pemberdayaan masyarakat.'),
  ('Mendukung pengembangan institusi pendidikan tinggi yang berkualitas terutama Tri Dharma perguruan tinggi.'),
  ('Memeroleh SDM berkualitas'),
  ('Mendapatkan jangkauan lebih dari mahasiswa PCU.'),
  ('Mendapatkan sistem pembelajaran Petraverse dan kesempatan untuk andil dalam pengembangan Petraverse.'),
  ('Menjalin kerja sama dengan universitas di Indonesia'),
  ('Mempromosikan program pembelajaran, serta berkolaborasi dengan UKP.'),
  ('Mendukung layanan komunikasi mitra pendidikan tinggi'),
  ('Mendapatkan klien untuk mengikuti program persiapan Sertifikasi Internasional Pemasar Digital Profesional (Certified Digital Marketing Professional - CDMP)'),
  ('Mendukung layanan Perguruan Tinggi'),
  ('Memfasilitasi lulusan untuk melanjutkan studi sebagai calon guru'),
  ('Pelaksanaan CSR dan kerja sama dengan institusi pendidikan tinggi dalam rangka rekrutmen staf yang sesuai kebutuhan'),
  ('Sebagai salah satu bentuk CSR dan sarana promosi'),
  ('Mitra pendapatkan penghasilan dari proyek penelitian yang dilakukan.'),
  ('Mendapatkan insights dari sisi akademis terkait perkembangan teori & konsep social media management. Magang mahasiswa juga akan memberi manfaat bagi perusahaan utk proses rekrutmen lulusan'),
  ('Mendukung visi di atas dan mendapatkan calon guru yang memadai untuk mengajar di MSC'),
  ('Meningkatkan citra positif PT Bakels'),
  ('Mendukung misi dalam mengembangkan kemitraan strategis yang saling mendukung dan mempromosikan produk dan layanan berkualitas.'),
  ('Tenaga Ahli dan Pendampingan Kegiatan / Program Sosial'),
  ('Melakukan kolaborasi dan advokasi untuk dampak yang lebih luas dalam kegiatan perlindungan anak, peningkatan kesehatan masyarakat, sosial serta ekonomi'),
  ('Mendukung peningkatan kualitas keilmuan dan mendorong industri persepatuan'),
  ('Mendapat kesempatan seleksi pegawai lebih awal melalui kegiatan PKL dan Kesempatan untuk memperoleh solusi bagi permasalahan perusahaan.'),
  ('Kolaborasi riset dan inovasi pada bidang-bidang yang relevan dengan visi, misi, dan rencana strategis'),
  ('Mendapatkan tempat untuk menjual produk - produk yang dimiliki serta bertambahnya jumlah konsumen yang akan membeli produk tersebut.'),
  ('Mendapatkan seragam dengan desain dan kualitas yang baik untuk branding dan kenyamanan pegawai.'),
  ('Mendapat sumber daya untuk mengikuti kegiatan PKL dan kesempatan untuk memperoleh solusi bagi permasalahan perusahaan.'),
  ('Mendapatkan dukungan dalam pelaksanaan Program Kartu Prakerja'),
  ('Mendukung misi Epsindo sebagai perusahaan IT provider yang mampu memberikan nilai tambah kepada customer maupun mitra'),
  ('Memperoleh calon - calon guru berkualitas untuk pelayanan di sekolah'),
  ('Memperoleh pengalaman internasional melalui kunjungan dna pertuakran budaya yang dilakuka.'),
  ('Mendapatkan hak untuk disebutkan sebagai pembina pembentuk fakultas kedokteran baru serta meningkatkan presetase kegiatan Tri Dharma'),
  ('Mendapat dukungan dalam melaksanan visi dan misi pelayanan terutama penyebaran Alkitab dan membangun komunitas LAI di seluruh Indonesia'),
  ('Mendukung Program Tridharma untuk Fakultas kedokteran UK Petra kedepannya dalam melahirkan calon dokter yang profesional'),
  ('Meningkatkan kualitas SDM terutama dalam hal kesehatan dengan pengadaan dokter dari putra/putri Maluku Tengah di Maluku Tengah'),
  ('Meningkatkan kualitas SDM terutama dalam hal kesehatan dengan pengadaan dokter dari putra/putri Sumba Timur di Sumba Timur'),
  ('Meningkatkan kualitas SDM terutama dalam hal kesehatan dengan pengadaan dokter dari putra/putri Sumba Barat Daya di Sumba Barat Daya'),
  ('Memperoleh informasi dan pengetahuan baru untuk mengembangkan kualitas kelembagaan di UK Petra.'),
  ('Mendapatkan dukungan dalam bidang pelayanan terutama untuk lansia'),
  ('Mendapatkan sumber daya dalam membantu melaksanakan pembangunan/renovasi/perawatan rumah bagi masyarakat yang membutuhkan'),
  ('Menyediakan tempat magang dan bekerja bagi para calon lulusan SMK Kristen Petra'),
  ('Mendapatkan solusi dan meningkatkan kualitas mengenai bidang yang dijalankan perusahaan'),
  ('Mendapatkan kursus peningkatan skill Bahasa Korea bagi siswa - siswa SMP dan SMA di PPPK Petra'),
  ('Meningkatkan kualitas kerja sama Penerimaan Mahasiswa Baru (PMB)'),
  ('Melaksanakan penelitian bersama untuk meningkatkan IKP2M'),
  ('Mendukung tercapainya visi dan misinya'),
  ('Meningkatkan kompetensi mahasiswa melalui kegiatan peningkatan kompetensi dan membantu mahasiswa Kristen dapat berkontribusi bagi bangsa.'),
  ('Mendapat data untuk pengembangan alat tes psikologi'),
  ('Mendapatkan narasumber untuk pengembangan kualitas SDM'),
  ('Mencapai tujuan pemberdayaan sumber daya manusia dari Tanah Papua dan Sumba melalui dukungan pendidikan yang berkualitas di Universitas Kristen Petra'),
  ('Koordinasi dan kolaborasi penanganan serangan siber'),
  ('Memanfaatkan sumber daya yang dimiliki masing-masing sesuai dengan fungsi dan kewenangan masing-masing'),
  ('Meningkatkan jumlah mahasiswa dan internasionalisasi'),
  ('Mendukung almamater dengan menjadi berkat bagi mahasiswa yang berkuliah di jurusan yang sama dengan mitra donatur'),
  ('Dapat bekerja sama menyediakan jasa pembuatan aplikasi bagi universitas'),
  ('Saling menjaga dan mengetahui cara pengelolaan Informasi Rahasia yang diperoleh tiap pihak terkait realisasi kerja sama'),
  ('Memperoleh informasi, dukungan, dan bantuan perihal promosi dan nasabah layanan digitalisasi dan perbankan'),
  ('Penggunaan jasa untuk bisa menghubungkan dengan universitas luar dan merekrut mahasiswa luar bagi UK Petrea'),
  ('Meningkatkan dan mengembangkan kerja sama akademik dengan Universitas di Indonesia'),
  ('Memperluas jaringan kerja sama, memperoleh peluang kolaborasi riset dan inovasi, saling mendukung dalam program/kegiatan pelayanan kesehatan'),
  ('Mengembangkan kerja sama berdasarkan kebutuhan akademik, ilmiah, dan pendidikan masing-masing.'),
  ('Berkontribusi dalam kegiatan sosial serta memperluas dan memperkuat jaringan kerja sama.'),
  ('Menarik minta mahasiswa untuk mengikuti program JD dan bisa studi di IMI selama satu tahun'),
  ('Memperluas jaringan kerja sama dan saling mendukung dalam program pelayanan kesehatan'),
  ('Memperluas jaringan kerja sama global dan saling mendukung dalam program academic exchange'),
  ('Memperluas jaringan kerja sama yang saling menguntungkan dalam ruang lingkup pendidikan, pelatihan, dan pengembangan teknologi kedokteran gigi'),
  ('Memperluas jaringan kerja sama global dan saling mendukung dalam program joint projects'),
  ('Mempererat kerja sama, memperoleh edukasi dan layanan kesehatan mulut dan gigi serta informasi PMB dan prospek karir bagi siswa'),
  ('Mendapatkan client serta komisi dari proses perekrutan'),
  ('Mendapat siswa untuk bisa mengambil pelatihan di SMARCH yang berujung pada penyaluran ke UK Petra sebagai mahasiswa baru'),
  ('Mendapat perserta yang ikut mengirimkan jurnal penelitian');

-- Unit types and hierarchy ---------------------------------------------------
insert into jenis_unit (jenis) values ('Unit Akademik'), ('Unit Pembantu');

insert into unit (nama, id_parent_unit, id_jenis_unit) values
  ('Universitas Kristen Petra', null, 2),                        -- 1
  ('Kantor Kerja Sama dan Urusan Internasional', 1, 2),          -- 2
  ('Sekretariat Rektorat', 1, 2),                                -- 3
  ('School of Business and Management', 1, 1),                   -- 4
  ('Prodi Manajemen', 4, 1),                                     -- 5
  ('Prodi Akuntansi', 4, 1),                                     -- 6
  ('International Business Management', 5, 1),                   -- 7
  ('Hotel Management', 5, 1);                                    -- 8

-- Positions ------------------------------------------------------------------
-- Tier is stored, never inferred: "Kepala Bagian Sekretariat Rektorat" is tier 1
-- while every other "Kepala" is tier 2 (BR-15, BR-16). NULL means the position
-- is not an approver at all.
insert into jabatan (nama, id_unit, tier_disposisi) values
  ('Kepala Kantor Kerja Sama dan Urusan Internasional', 2, 1),   -- 1
  ('Kepala Bagian Sekretariat Rektorat', 3, 1),                  -- 2
  ('Dekan School of Business and Management', 4, 2),             -- 3
  ('Kepala Program Studi Manajemen', 5, null),                   -- 4 (submit-only, not an approver)
  ('Wakil Rektor Bidang Akademik', 1, 3),                        -- 5
  ('Rektor', 1, 3),                                              -- 6
  ('Staf Kantor Kerja Sama', 2, null),                           -- 7
  ('Pimpinan Yayasan (Viewer)', 1, null);                        -- 8

-- Accounts -------------------------------------------------------------------
-- The account IS the position, so an office-holder change needs no data change
-- (DR-06). auth_user_id is filled when the Supabase Auth user is created.
insert into akun (id_jabatan, email, role) values
  (1, 'kepala-kui@petra.ac.id',            'io_admin'),
  (2, 'sekretariat-rektorat@petra.ac.id',  'submitter'),
  (3, 'dekan-sbm@petra.ac.id',             'submitter'),
  (4, 'kaprodi-manajemen@petra.ac.id',     'submitter'),
  (5, 'warek-akademik@petra.ac.id',        'submitter'),
  (6, 'rektor@petra.ac.id',                'submitter'),
  (7, 'staf-kui@petra.ac.id',              'io_staff'),
  (8, 'viewer@petra.ac.id',                'viewer');

-- Thresholds -----------------------------------------------------------------
-- Every threshold in the system reads from here; no magic numbers in code (DR-04).
insert into settings (key, value) values
  ('expiring_soon_months',    '6'),
  ('expiry_cadence',          'monthly_then_weekly_2mo'),
  ('sla_yellow_days',         '2'),
  ('sla_red_days',            '4'),
  ('renewal_reminder_days',   '30'),
  ('renewal_yellow_days',     '60'),
  ('renewal_red_days',        '90'),
  ('kpi_turnaround_basis',    'final_approved');

-- Holiday calendar -----------------------------------------------------------
-- Business-day SLA is wrong without this, and an empty table makes the SLA
-- function warn (BR-19). 2026 Indonesian public holidays.
insert into holidays (tanggal, keterangan) values
  ('2026-01-01','Tahun Baru Masehi'),
  ('2026-01-17','Isra Mikraj Nabi Muhammad SAW'),
  ('2026-02-17','Tahun Baru Imlek'),
  ('2026-03-19','Hari Raya Nyepi'),
  ('2026-03-21','Hari Raya Idul Fitri'),
  ('2026-03-22','Hari Raya Idul Fitri'),
  ('2026-04-03','Wafat Isa Almasih'),
  ('2026-05-01','Hari Buruh'),
  ('2026-05-14','Kenaikan Isa Almasih'),
  ('2026-05-27','Hari Raya Idul Adha'),
  ('2026-06-01','Hari Lahir Pancasila'),
  ('2026-06-16','Tahun Baru Islam'),
  ('2026-08-17','Hari Kemerdekaan RI'),
  ('2026-08-25','Maulid Nabi Muhammad SAW'),
  ('2026-12-25','Hari Raya Natal');

-- Historical proposals from the TUJUAN_KERJASAMA.csv import --------------
-- One proposal_dokumen per source row, so every tujuan/manfaat value in the
-- pools above is actually referenced by a document rather than sitting
-- unused (these dropdown tables exist to be picked, not to be an orphan list).
-- manfaat_bagi_petra/manfaat_bagi_mitra have no shared key with the tujuan
-- rows (81 and 96 distinct values against 99 tujuan rows), so they are
-- cycled on rather than a real historical pairing -- this is a seeding
-- device, not a claim that document #N actually cited that manfaat pair.
-- Draft status and no partner/unit/agenda links: none of the four source
-- CSVs name a partner, date, or unit, so none is invented here.
with tujuan_docs(seq, jenis, tujuan) as (values
  (1,'MoU','Mendukung visi/misi Para Pihak'),
  (2,'MoA','Mampu menawarkan sertifikasi PMP dan menyiapkan dosen-dosen menjadi trainer kelas persiapannya'),
  (3,'MoA','untuk melaksanakan suatu kegiatan yang bersifat saling membantu dan meningkatkan potensi PARA PIHAK dengan prinsip saling memberi dan mendapatkan manfaat.'),
  (4,'MoA','Untuk mendukung peningkatan pengembangan mahasiswa dari berbagai aspek, khususnya di bidang wawasan global dan apresiasi budaya'),
  (5,'MoU','Untuk mengembangkan kerjasama akademik dan Pendidikan dan untuk mempromosikan saling pengertian antara kedua universitas.'),
  (6,'MoU','Meningkatkan dan mengembangkan kualitas pendidikan profesi Keinsinyuran, serta Penelitian Bersama'),
  (7,'MoA','meningkatkan mutu penyelenggaraan, serta mutu dan jumlah lulusan Program Studi Program Profesi Insinyur di Indonesia'),
  (8,'MoA','Untuk saling menguntungkan dan saling mendukung antara PARA PIHAK'),
  (9,'MoA','Pelaksanaan program Pemantapan Guru Muda (PGM) untuk Mahasiswa FKIP'),
  (10,'MoA','Membangun Test Center di UK Petra untuk pelaksanaan Ujian Profesi Akuntan Publik CPA bagi Mahasiswa UK Petra.'),
  (11,'MoU','untuk saling menunjang dan saling memberi manfaat bagi kedua belah pihak.'),
  (12,'MoA','Memajukan dan mengembangkan kerjasama di bidang akademik, penelitian, dan administrasi dalam rangka penyelenggaraan rangkap sarjana.'),
  (13,'MoU','Bekerjasama dalam hal untuk menyediakan dan menjelaskan data yang dibutuhkan oleh UK Petra'),
  (14,'MoU','Sebagai landasan dan pedoman dalam melakukan eksplorasi kolaborasi digital atas pengembangan Smart Urban Farming.'),
  (15,'MoA','Menempatkan dan memberikan beasiswa kepada beberapa orang calon mahasiswa yang akan studi di PGPAUD atau PGSD FKIP.'),
  (16,'MoA','Untuk meningkatkan performa dan kualitas petraverse dari segi teknis dan sistem serta pengembangan modul dan upgrade sistem database dari Petraverse'),
  (17,'MoU','Menyinergikan dan mengoptimalkan potensi & sumber daya PARA PIHAK dalam rangka pengembangan kelembagaan dan pengembangan sumber daya manusia.'),
  (18,'MoA','Menyinergikan dan mengoptimalkan potensi dan sumber daya PARA PIHAK dalam rangka pengembangan kelembagaan, dan pengembangan sumber daya manusia di tingkat Fakultas dan Program Studi.'),
  (19,'MoA','Meningkatkan tampilan dan fungsi website yang lebih menarik dan mudah digunakan'),
  (20,'MoA','c. Menjalin kerja sama yang bersifat kemitraan dalam bidang pengabdian kepada masyarakat bagi mahasiswa dan/atau dosen di FKIP UKSW dan FKIP UK Petra'),
  (21,'MoA','Menjalin kerja sama yang bersifat kemitraan dalam bidang penguatan keilmuan dalam pendidikan dan pengajaran bagi mahasiswa dan/atau dosen di FKIP UKSW dan FKIP UK Petra dengan semangat Whole Person Education dalam kerangka Merdeka Belajar Kampus Merdeka'),
  (22,'MoA','b. Menjalin kerja sama yang bersifat kemitraan dalam bidang penelitian dan publikasi ilmiah bagi mahasiswa dan/atau dosen di FKIP UKSW dan FKIP UK Petra'),
  (23,'MoU','Mendukung visi/misi Para Pihak'),
  (24,'MoA','Memenuhi kebutuhan guru bahasa Tionghoa dalam meningkatkan kemampuan bahasa Tionghoa dan keterampilan mengajar bahasa Tionghoa'),
  (25,'MoA','Mengirimkan Mahasiswa S1 dan S2 untuk study abroad ke Monash University'),
  (26,'MoA','Menyepakati hak dan kewajiban Para Pihak'),
  (27,'MoA','Menyelenggarakan kerjasama pelaksanaan Tridharma Perguruan Tinggi dalam Program Sinergitas Pembangunan Kota Surabaya.'),
  (28,'MoA','Terlaksananya program kelas kolaborasi yaitu pembelajaran oleh dosen dan praktisi kepada mahasiswa.'),
  (29,'MoU','Magang dan Rekrutmen'),
  (30,'MoU','Berafiliasi agar mendapatkan jangkauan yang lebih lagi untuk kedua Pihak.'),
  (31,'MoU','Mendukung visi/misi Para Pihak'),
  (32,'MoU','Pemanfaatan dan pengembangan sistem pembelajaran Petraverse di universitas'),
  (33,'MoA','untuk menawarkan program magister gelar bersama untuk mahasiswa dari Program Studi Magister Teknik Sipil, PCU'),
  (34,'MoA','Menyepakati hak dan kewajiban masing-masing UKP dan Saxion IFA.'),
  (35,'MoA','Sebagai landasan dalam pelaksanaan Pendidikan Sertifikasi Internasional Pemasar Digital Profesional (Certified Digital Marketing Professional - CDMP)'),
  (36,'MoU','Kegiatan bersama dalam rangka mengedukasi masyarakat terkait literasi budaya dan sains'),
  (37,'MoA','Menyepakati hak dan kewajiban Para Pihak'),
  (38,'MoA','Karya Esensi Data / QED Research Consulting, membantu Career Center untuk melaksanakan riset focus group discussion bagi alumni Petra'),
  (39,'MoU','Kolaborasi dg dunia industri dalam hal transfer pengetahuan/pengalaman dlm menghasilkan SDM yang lebih berkualitas'),
  (40,'MoA','Memberikan beasiswa serta menyediakan tempat magang bagi Mahasiswa FKIP'),
  (41,'MoA','mengembangkan kerja sama berdasarkan kebutuhan akademik, ilmiah dan pendidikan masing – masing'),
  (42,'MoA','Memanfaatkan pembelajaran dalam jaringan (daring) pada Petraverse.'),
  (43,'MoA','Melengkapi kompetensi lulusan Universitas Kristen Petra.'),
  (44,'MoA','Melengkapi kompetensi lulusan Universitas Kristen Petra.'),
  (45,'MoA','menetapkan peran dan tanggung jawab masing-masing Pihak dalam bekerja sama untuk memajukan kepentingan satu sama lain dan kepentingan bersama dengan mempromosikan CPA Australia dan penunjukan CPA di Organisasi Partisipan'),
  (46,'MoU','Meningkatkan kesadaran, kemauan dan kemampuan untuk hidup sehat bagi setiap orang agar terwujudnya derajat kesehatan masyarakat yang optimal'),
  (47,'MoA','Melaksanakan Program Matching Fund "Kedaireka" 2023'),
  (48,'MoU','Meningkatkan kualitas keilmuan desain dan kreatif, serta mendorong industri kreatif, khususnya produk alas kaki di Indonesia.'),
  (49,'MoA','Mendukung visi/misi Para Pihak'),
  (50,'MoA','untuk meningkatkan hubungan kelembagaan PARA PIHAK dalam kegiatan Pendidikan, Penelitian, dan Pengabdian Kepada Masyarakat, dan kegiatan penunjang lainnya.'),
  (51,'MoA','untuk meningkatkan hubungan kelembagaan PARA PIHAK dalam kegiatan Pendidikan, Penelitian, dan Pengabdian Kepada Masyarakat, dan kegiatan penunjang lainnya.'),
  (52,'MoA','untuk meningkatkan hubungan kelembagaan PARA PIHAK dalam kegiatan Pendidikan, Penelitian, dan Pengabdian Kepada Masyarakat, dan kegiatan penunjang lainnya.'),
  (53,'MoA','untuk meningkatkan hubungan kelembagaan PARA PIHAK dalam kegiatan Pendidikan, Penelitian, dan Pengabdian Kepada Masyarakat, dan kegiatan penunjang lainnya.'),
  (54,'MoU','Memperkuat, mempromosikan, dan mengembangkan hubungan kolaborasi riset dan inovasi antara PARA PIHAK'),
  (55,'MoA','Menyepakati hak dan kewajiban Para Pihak'),
  (56,'MoA','Menyepakati hak dan kewajiban Para Pihak'),
  (57,'MoA','Penyelenggaraan Magang atau Pelatihan Kerja'),
  (58,'MoA','Perekrutan lulusan Universitas Kristen Petra'),
  (59,'MoU','Mengoptimalkan penyelenggaraan Pendidikan, Penelitian, Pengabdian kepada Masyarakat, serta Pengembangan Sumber Daya Institusi di lingkungan PARA PIHAK;'),
  (60,'MoU','Mendukung visi/misi Para Pihak'),
  (61,'MoA','Pelaksanaan program Pemantapan Guru Muda (PGM) untuk Mahasiswa FKIP'),
  (62,'MoA','Menyepakati hak dan kewajiban Para Pihak'),
  (63,'MoA','Pembinaan Program Studi Sarjana Pendidikan Dokter dan Program Studi Profesi Gigi yang baru'),
  (64,'MoA','Pelaksanaaan Enrichment Talk dengan narasumber oleh Dekan FKG UGM'),
  (65,'MoA','Menyepakati hak dan kewajiban Para Pihak'),
  (66,'MoA','Pelaksanaan program magang'),
  (67,'MoA','Mengadakan kerja sama dalam berbagai bidang pelayanan dan kesaksian sesuai dengan Visi dan Misi yang diemban.'),
  (68,'MoA','Pembentukkan pendidikan kedokteran dan menciptakan tenaga profesional di bidang kedokteran'),
  (69,'MoA','Mendukung visi/misi Para Pihak'),
  (70,'MoU','Mendukung persiapan pendirian FKG'),
  (71,'MoA','Menawarkan sertifikasi internasional dan nasional dalam bidang manajemen risiko dan audit internal'),
  (72,'MoA','UKP sebagai pelaksana pemantauan pelatihan dalam ekosistem prakerja'),
  (73,'MoU','Mendukung visi/misi Para Pihak'),
  (74,'MoA','Pelaksanaan pendidikan non gelar di bidang seni dan budaya serta bahasa Indonesia bagi WNA'),
  (75,'MoA','Menyepakati hak dan kewajiban Para Pihak'),
  (76,'MoU','Melakukan tes psikologi'),
  (77,'MoA','Sebagai landasan dalam pelaksanaan Pendidikan Sertifikasi Internasional Perencana Keuangan Personal (Certified of Financial Planner) dan RFP'),
  (78,'MoA','Melahirkan lulusan yang berkompeten dan berintegritas untuk melayani masyarakat melalui bidang keilmuan masing-masing.'),
  (79,'MoA','kegiatan pembelajaran mengaplikasikan faith and learning integration di tempat PIHAK KEDUA dalam rangka penelitian dan penyelenggaraan pengabdian kepada masyarakat.'),
  (80,'MoU','Membangun kerja sama strategis dalam pengembangan pendidikan, riset, pelatihan, serta pengabdian masyarakat di bidang keamanan siber.'),
  (81,'MoA','promosi'),
  (82,'MoA','Mendukung visi/misi Para Pihak'),
  (83,'MoU','Memanfaatkan sumber daya yang dimiliki masing-masing sesuai dengan fungsi dan kewenangan masing-masing'),
  (84,'MoA','Memberikan donasi untuk pelaksanaan kelas di UK Petra'),
  (85,'MoA','Melaksanakan Penelitian Bersama guna mendukung pengembangan ilmu pengetahuan dan industri.'),
  (86,'MoA','Mendukung pengembangan Program Studi Teknik Sipil, Universitas Kristen Petra, khususnya dalam menghasilkan Sarjana Teknik Sipil yang berkualitas, serta dilandasi itikad baik para pihak.'),
  (87,'MoA','Penyediaan produk dan/atau jasa Layanan Perbankan yang terintegrasi dengan Layanan Digitalisasi yang dikembangkan dan dikelola partner yang ditunjuk, yang diperuntukkan untuk memenuhi kebutuhan Universitas'),
  (88,'MoA','Melengkapi kompetensi lulusan Universitas Kristen Petra'),
  (89,'MoU','Meningkatkan kualitas pelaksanaan tugas dan fungsi para pihak sesuai dengan kewenangan yang dimiliki.'),
  (90,'MoU','Mengembangkan kerja sama berdasarkan kebutuhan akademiik, ilmiah, dan pendidikan masing-masing'),
  (91,'MoU','Melakukan kerja sama dengan memanfaatkan sumber daya yang dimiliki oleh masing-masing pihak.'),
  (92,'MoA','Mendukung pengembangan SDM/Fakultas serta mahasiswa dari masing-masing pihak khususnya dalam ranah global dan peningkatan/kemajuan akademik.'),
  (93,'MoA','Melaksanakan kegiatan Bakti Sosial Pelayanan Kesehatan Gigi dan Mulut bagi Anak dan Masyarakat di Wilayah Waingapu, Sumba Timur'),
  (94,'MoU','Bekerja sama dalam hal penyelenggaraan pelatihan dan kegiatan peningkatan kompetensi bidang kesehatan'),
  (95,'MoA','Saling mendukung pengembangan institusi dan SDM bidang kedokteran gigi serta menguatkan kemitraan dengan universitas LN.'),
  (96,'MoU','Magang dan Rekrutmen Lulusan'),
  (97,'MoA','Menjalin kerja sama dalam bidang penelitian bersama dan pengembangan akademik untuk mencapai visi dan misi masing-masing pihak'),
  (98,'MoA','Pengakuan Internasional dan Standarisasi Global Melalui Sertifikasi Internasional'),
  (99,'MoA','Meningkatkan kemampuan softsfkill dan hardskill mahasiswa')
),
petra_opsi as (
  select nilai, (row_number() over (order by id) - 1) as rn,
         count(*) over () as n
  from manfaat_petra
),
mitra_opsi as (
  select nilai, (row_number() over (order by id) - 1) as rn,
         count(*) over () as n
  from manfaat_mitra
)
insert into proposal_dokumen
  (jenis_kerjasama, status_proposal, tujuan_kerjasama, manfaat_bagi_petra, manfaat_bagi_mitra, id_akun_pembuat)
select
  td.jenis::jenis_kerjasama_t, 'Draft', td.tujuan, mp.nilai, mm.nilai,
  (select id from akun where email = 'staf-kui@petra.ac.id')
from tujuan_docs td
join petra_opsi mp on mp.rn = (td.seq - 1) % mp.n
join mitra_opsi mm on mm.rn = (td.seq - 1) % mm.n;

-- MoU/MoA type-specific rows are NOT NULL; the source CSVs carry none of this
-- detail, so each gets one honest placeholder rather than inventing content.
insert into proposal_dokumen_mou (id_proposal_dokumen, ringkasan_kegiatan)
select pd.id, 'Data historis hasil impor (TUJUAN_KERJASAMA.csv); ringkasan kegiatan belum diisi ulang.'
from proposal_dokumen pd
where pd.jenis_kerjasama = 'MoU'
  and not exists (select 1 from proposal_dokumen_mou m where m.id_proposal_dokumen = pd.id);

insert into proposal_dokumen_moa
  (id_proposal_dokumen, hak_petra, hak_calon_mitra, kewajiban_petra, kewajiban_calon_mitra)
select pd.id,
  'Data historis hasil impor; hak PETRA belum diisi ulang.',
  'Data historis hasil impor; hak mitra belum diisi ulang.',
  'Data historis hasil impor; kewajiban PETRA belum diisi ulang.',
  'Data historis hasil impor; kewajiban mitra belum diisi ulang.'
from proposal_dokumen pd
where pd.jenis_kerjasama = 'MoA'
  and not exists (select 1 from proposal_dokumen_moa m where m.id_proposal_dokumen = pd.id);
