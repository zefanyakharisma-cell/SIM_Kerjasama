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
-- Seeds the grow-then-reuse dropdowns (schema.md 2.10) from the historical
-- import (TUJUAN_KERJASAMA.csv, MANFAAT_BAGI_PETRA.csv, MANFAAT_BAGI_MITRA.csv).
-- JENIS-DOKUMEN (MoU/MoA) from the tujuan source is per-proposal
-- (proposal_dokumen.jenis_kerjasama), not part of this shared text pool, so it
-- is not carried over here.
insert into managed_options (option_group, value) values
  ('tujuan', 'Mendukung visi/misi Para Pihak'),
  ('tujuan', 'Mampu menawarkan sertifikasi PMP dan menyiapkan dosen-dosen menjadi trainer kelas persiapannya'),
  ('tujuan', 'untuk melaksanakan suatu kegiatan yang bersifat saling membantu dan meningkatkan potensi PARA PIHAK dengan prinsip saling memberi dan mendapatkan manfaat.'),
  ('tujuan', 'Untuk mendukung peningkatan pengembangan mahasiswa dari berbagai aspek, khususnya di bidang wawasan global dan apresiasi budaya'),
  ('tujuan', 'Untuk mengembangkan kerjasama akademik dan Pendidikan dan untuk mempromosikan saling pengertian antara kedua universitas.'),
  ('tujuan', 'Meningkatkan dan mengembangkan kualitas pendidikan profesi Keinsinyuran, serta Penelitian Bersama'),
  ('tujuan', 'meningkatkan mutu penyelenggaraan, serta mutu dan jumlah lulusan Program Studi Program Profesi Insinyur di Indonesia'),
  ('tujuan', 'Untuk saling menguntungkan dan saling mendukung antara PARA PIHAK'),
  ('tujuan', 'Pelaksanaan program Pemantapan Guru Muda (PGM) untuk Mahasiswa FKIP'),
  ('tujuan', 'Membangun Test Center di UK Petra untuk pelaksanaan Ujian Profesi Akuntan Publik CPA bagi Mahasiswa UK Petra.'),
  ('tujuan', 'untuk saling menunjang dan saling memberi manfaat bagi kedua belah pihak.'),
  ('tujuan', 'Memajukan dan mengembangkan kerjasama di bidang akademik, penelitian, dan administrasi dalam rangka penyelenggaraan rangkap sarjana.'),
  ('tujuan', 'Bekerjasama dalam hal untuk menyediakan dan menjelaskan data yang dibutuhkan oleh UK Petra'),
  ('tujuan', 'Sebagai landasan dan pedoman dalam melakukan eksplorasi kolaborasi digital atas pengembangan Smart Urban Farming.'),
  ('tujuan', 'Menempatkan dan memberikan beasiswa kepada beberapa orang calon mahasiswa yang akan studi di PGPAUD atau PGSD FKIP.'),
  ('tujuan', 'Untuk meningkatkan performa dan kualitas petraverse dari segi teknis dan sistem serta pengembangan modul dan upgrade sistem database dari Petraverse'),
  ('tujuan', 'Menyinergikan dan mengoptimalkan potensi & sumber daya PARA PIHAK dalam rangka pengembangan kelembagaan dan pengembangan sumber daya manusia.'),
  ('tujuan', 'Menyinergikan dan mengoptimalkan potensi dan sumber daya PARA PIHAK dalam rangka pengembangan kelembagaan, dan pengembangan sumber daya manusia di tingkat Fakultas dan Program Studi.'),
  ('tujuan', 'Meningkatkan tampilan dan fungsi website yang lebih menarik dan mudah digunakan'),
  ('tujuan', 'c. Menjalin kerja sama yang bersifat kemitraan dalam bidang pengabdian kepada masyarakat bagi mahasiswa dan/atau dosen di FKIP UKSW dan FKIP UK Petra'),
  ('tujuan', 'Menjalin kerja sama yang bersifat kemitraan dalam bidang penguatan keilmuan dalam pendidikan dan pengajaran bagi mahasiswa dan/atau dosen di FKIP UKSW dan FKIP UK Petra dengan semangat Whole Person Education dalam kerangka Merdeka Belajar Kampus Merdeka'),
  ('tujuan', 'b. Menjalin kerja sama yang bersifat kemitraan dalam bidang penelitian dan publikasi ilmiah bagi mahasiswa dan/atau dosen di FKIP UKSW dan FKIP UK Petra'),
  ('tujuan', 'Memenuhi kebutuhan guru bahasa Tionghoa dalam meningkatkan kemampuan bahasa Tionghoa dan keterampilan mengajar bahasa Tionghoa'),
  ('tujuan', 'Mengirimkan Mahasiswa S1 dan S2 untuk study abroad ke Monash University'),
  ('tujuan', 'Menyepakati hak dan kewajiban Para Pihak'),
  ('tujuan', 'Menyelenggarakan kerjasama pelaksanaan Tridharma Perguruan Tinggi dalam Program Sinergitas Pembangunan Kota Surabaya.'),
  ('tujuan', 'Terlaksananya program kelas kolaborasi yaitu pembelajaran oleh dosen dan praktisi kepada mahasiswa.'),
  ('tujuan', 'Magang dan Rekrutmen'),
  ('tujuan', 'Berafiliasi agar mendapatkan jangkauan yang lebih lagi untuk kedua Pihak.'),
  ('tujuan', 'Pemanfaatan dan pengembangan sistem pembelajaran Petraverse di universitas'),
  ('tujuan', 'untuk menawarkan program magister gelar bersama untuk mahasiswa dari Program Studi Magister Teknik Sipil, PCU'),
  ('tujuan', 'Menyepakati hak dan kewajiban masing-masing UKP dan Saxion IFA.'),
  ('tujuan', 'Sebagai landasan dalam pelaksanaan Pendidikan Sertifikasi Internasional Pemasar Digital Profesional (Certified Digital Marketing Professional - CDMP)'),
  ('tujuan', 'Kegiatan bersama dalam rangka mengedukasi masyarakat terkait literasi budaya dan sains'),
  ('tujuan', 'Karya Esensi Data / QED Research Consulting, membantu Career Center untuk melaksanakan riset focus group discussion bagi alumni Petra'),
  ('tujuan', 'Kolaborasi dg dunia industri dalam hal transfer pengetahuan/pengalaman dlm menghasilkan SDM yang lebih berkualitas'),
  ('tujuan', 'Memberikan beasiswa serta menyediakan tempat magang bagi Mahasiswa FKIP'),
  ('tujuan', 'mengembangkan kerja sama berdasarkan kebutuhan akademik, ilmiah dan pendidikan masing – masing'),
  ('tujuan', 'Memanfaatkan pembelajaran dalam jaringan (daring) pada Petraverse.'),
  ('tujuan', 'Melengkapi kompetensi lulusan Universitas Kristen Petra.'),
  ('tujuan', 'Melengkapi kompetensi lulusan Universitas Kristen Petra'),
  ('tujuan', 'menetapkan peran dan tanggung jawab masing-masing Pihak dalam bekerja sama untuk memajukan kepentingan satu sama lain dan kepentingan bersama dengan mempromosikan CPA Australia dan penunjukan CPA di Organisasi Partisipan'),
  ('tujuan', 'Meningkatkan kesadaran, kemauan dan kemampuan untuk hidup sehat bagi setiap orang agar terwujudnya derajat kesehatan masyarakat yang optimal'),
  ('tujuan', 'Melaksanakan Program Matching Fund "Kedaireka" 2023'),
  ('tujuan', 'Meningkatkan kualitas keilmuan desain dan kreatif, serta mendorong industri kreatif, khususnya produk alas kaki di Indonesia.'),
  ('tujuan', 'untuk meningkatkan hubungan kelembagaan PARA PIHAK dalam kegiatan Pendidikan, Penelitian, dan Pengabdian Kepada Masyarakat, dan kegiatan penunjang lainnya.'),
  ('tujuan', 'Memperkuat, mempromosikan, dan mengembangkan hubungan kolaborasi riset dan inovasi antara PARA PIHAK'),
  ('tujuan', 'Penyelenggaraan Magang atau Pelatihan Kerja'),
  ('tujuan', 'Perekrutan lulusan Universitas Kristen Petra'),
  ('tujuan', 'Mengoptimalkan penyelenggaraan Pendidikan, Penelitian, Pengabdian kepada Masyarakat, serta Pengembangan Sumber Daya Institusi di lingkungan PARA PIHAK;'),
  ('tujuan', 'Pembinaan Program Studi Sarjana Pendidikan Dokter dan Program Studi Profesi Gigi yang baru'),
  ('tujuan', 'Pelaksanaaan Enrichment Talk dengan narasumber oleh Dekan FKG UGM'),
  ('tujuan', 'Pelaksanaan program magang'),
  ('tujuan', 'Mengadakan kerja sama dalam berbagai bidang pelayanan dan kesaksian sesuai dengan Visi dan Misi yang diemban.'),
  ('tujuan', 'Pembentukkan pendidikan kedokteran dan menciptakan tenaga profesional di bidang kedokteran'),
  ('tujuan', 'Mendukung persiapan pendirian FKG'),
  ('tujuan', 'Menawarkan sertifikasi internasional dan nasional dalam bidang manajemen risiko dan audit internal'),
  ('tujuan', 'UKP sebagai pelaksana pemantauan pelatihan dalam ekosistem prakerja'),
  ('tujuan', 'Pelaksanaan pendidikan non gelar di bidang seni dan budaya serta bahasa Indonesia bagi WNA'),
  ('tujuan', 'Melakukan tes psikologi'),
  ('tujuan', 'Sebagai landasan dalam pelaksanaan Pendidikan Sertifikasi Internasional Perencana Keuangan Personal (Certified of Financial Planner) dan RFP'),
  ('tujuan', 'Melahirkan lulusan yang berkompeten dan berintegritas untuk melayani masyarakat melalui bidang keilmuan masing-masing.'),
  ('tujuan', 'kegiatan pembelajaran mengaplikasikan faith and learning integration di tempat PIHAK KEDUA dalam rangka penelitian dan penyelenggaraan pengabdian kepada masyarakat.'),
  ('tujuan', 'Membangun kerja sama strategis dalam pengembangan pendidikan, riset, pelatihan, serta pengabdian masyarakat di bidang keamanan siber.'),
  ('tujuan', 'promosi'),
  ('tujuan', 'Memanfaatkan sumber daya yang dimiliki masing-masing sesuai dengan fungsi dan kewenangan masing-masing'),
  ('tujuan', 'Memberikan donasi untuk pelaksanaan kelas di UK Petra'),
  ('tujuan', 'Melaksanakan Penelitian Bersama guna mendukung pengembangan ilmu pengetahuan dan industri.'),
  ('tujuan', 'Mendukung pengembangan Program Studi Teknik Sipil, Universitas Kristen Petra, khususnya dalam menghasilkan Sarjana Teknik Sipil yang berkualitas, serta dilandasi itikad baik para pihak.'),
  ('tujuan', 'Penyediaan produk dan/atau jasa Layanan Perbankan yang terintegrasi dengan Layanan Digitalisasi yang dikembangkan dan dikelola partner yang ditunjuk, yang diperuntukkan untuk memenuhi kebutuhan Universitas'),
  ('tujuan', 'Meningkatkan kualitas pelaksanaan tugas dan fungsi para pihak sesuai dengan kewenangan yang dimiliki.'),
  ('tujuan', 'Mengembangkan kerja sama berdasarkan kebutuhan akademiik, ilmiah, dan pendidikan masing-masing'),
  ('tujuan', 'Melakukan kerja sama dengan memanfaatkan sumber daya yang dimiliki oleh masing-masing pihak.'),
  ('tujuan', 'Mendukung pengembangan SDM/Fakultas serta mahasiswa dari masing-masing pihak khususnya dalam ranah global dan peningkatan/kemajuan akademik.'),
  ('tujuan', 'Melaksanakan kegiatan Bakti Sosial Pelayanan Kesehatan Gigi dan Mulut bagi Anak dan Masyarakat di Wilayah Waingapu, Sumba Timur'),
  ('tujuan', 'Bekerja sama dalam hal penyelenggaraan pelatihan dan kegiatan peningkatan kompetensi bidang kesehatan'),
  ('tujuan', 'Saling mendukung pengembangan institusi dan SDM bidang kedokteran gigi serta menguatkan kemitraan dengan universitas LN.'),
  ('tujuan', 'Magang dan Rekrutmen Lulusan'),
  ('tujuan', 'Menjalin kerja sama dalam bidang penelitian bersama dan pengembangan akademik untuk mencapai visi dan misi masing-masing pihak'),
  ('tujuan', 'Pengakuan Internasional dan Standarisasi Global Melalui Sertifikasi Internasional'),
  ('tujuan', 'Meningkatkan kemampuan softsfkill dan hardskill mahasiswa');

insert into managed_options (option_group, value) values
  ('manfaat_petra', 'Meningkatkan kerjasama dengan berbagai pihak guna memperkaya pelaksanaan Tridharma Perguruan Tinggi'),
  ('manfaat_petra', 'Mendukung misi UK Petra dalam mempertahankan Integritas UK Petra sebagai perguruan tinggi Kristen'),
  ('manfaat_petra', 'Manfaat bagi UKP Dapat melengkapi kompetensi lulusan Universitas Kristen Petra.'),
  ('manfaat_petra', 'Mengembangkan wawasan global dan apresiasi budaya dari mahasiswa UK Petra'),
  ('manfaat_petra', 'Mempererat hubungan kerjasama dengan universitas di China.'),
  ('manfaat_petra', 'Membekali calon insinyur lulusan UK Petra dengan kualitas pendidikan profesi Keinsinyuran dengan mutu yang terjamin.'),
  ('manfaat_petra', 'Mendukung peningkatan pendidikan dan kompetensi UK Petra'),
  ('manfaat_petra', 'Meningkatkan kualitas pendidikan calon guru muda lulusan FKIP secara akademik, emosional, dan spiritual.'),
  ('manfaat_petra', 'Memperluas kesempatan Mahasiswa UK Petra untuk mengikuti Ujian Profesi Akuntan Publik Certified Public Accountant of Indonesia.'),
  ('manfaat_petra', 'Menunjang kualitas sistem pembelajaran sumber daya, kelembagaan dalam dunia pendidikan pada umumnya'),
  ('manfaat_petra', 'Memperoleh data akurat dan terpercaya sesuai dengan kebutuhan melalui lembaga yang kredibel'),
  ('manfaat_petra', 'Meningkatkan kerja sama dengan berbagai pihak dalam rangka mendukung pelaksanaan Tridarma Perguruan Tinggi'),
  ('manfaat_petra', 'Memperoleh kemampuan dan sumber daya yang dapat diberikan untuk pengembangan Smart Urban Farming.'),
  ('manfaat_petra', 'Memberikan beasiswa bagi calon mahasiswa UK Petra dan mendukung program Tri Dharma perguruan tinggi.'),
  ('manfaat_petra', 'Mendapatkan calon mahasiswa untuk studi di PGPAUD atau PGSD FKIP.'),
  ('manfaat_petra', 'Melindungi kerahasiaan informasi penting yang berhubungan dengan kerja sama juga mengembangkan kualitas Petraverse menjadi lebih sempurna.'),
  ('manfaat_petra', 'menyinergikan dan mengoptimalkan potensi dan sumber daya PARA PIHAK dalam rangka pengembangan kelembagaan dan pengembangan sumber daya manusia.'),
  ('manfaat_petra', 'Kesempatan melakukan kegiatan Tridarma Perguruan Tinggi (pendidikan, penelitian, dan pengabdian kepada masyarakat)'),
  ('manfaat_petra', 'Meningkatkan tampilan dan fungsi website yang lebih menarik dan mudah digunakan'),
  ('manfaat_petra', 'Membangun relasi yang saling menguntungkan dengan mitra SMA di Indonesia dan meningkatkan sistem pendidikan yang memadai dan semakin berkualitas'),
  ('manfaat_petra', 'Mengembangkan layanan untuk kelas IELTS preparation khususnya simulasi test IELTS'),
  ('manfaat_petra', 'Memperlengkapi guru bahasa Tionghoa di Prodi Bahasa Mandarin agar menjadi guru Tionghoa yang lebih terampil'),
  ('manfaat_petra', 'Menambah relasi mitra dan mendukung program Tri Dharma perguruan tinggi.'),
  ('manfaat_petra', 'Meningkatkan pendidikan akademik dan pendidikan vokasi mahasiswa UK Petra'),
  ('manfaat_petra', 'Meningkatkan kompetensi mahasiswa dan dosen, menyiapkan lulusan sebagai pemimpin masa depan bangsa yang unggul dan berkepribadian, serta mewadahi kegiatan pembelajaran, penelitian, dan pengabdian kepada masyarakat oleh mahasiswa dan dosen.'),
  ('manfaat_petra', 'Agar lulusan dapat memperoleh ilmu dan kecakapan sesuai dengan kebutuhan dan tantangan di dunia kerja dan profesional.'),
  ('manfaat_petra', 'Mempercepat masa tunggu lulusan dengan menyediakan tempat magang dan bekerja bagi para lulusan.'),
  ('manfaat_petra', 'Mempererat hubungan dengan mitra PT. Grab Teknologi Indonesia agar mempermudah kerjasama di kemudian hari.'),
  ('manfaat_petra', 'Mengembangkan sistem pembelajran Petraverse lebih luas lagi.'),
  ('manfaat_petra', 'Menyediakan pilihan program internasional bagi mahasiswa'),
  ('manfaat_petra', 'Meningkatkan layanan komunikasi bagi mahasiswa dan calon mahasiswa'),
  ('manfaat_petra', 'Sebagai salah satu sarana memastikan lulusan Prodi MM UK Petra peminatan Branding and Digital Marketing menjadi pemimpin dan praktisi pemasaran digital yang handal dan profesional khususnya di tengah persaingan bisnis di era digital saat ini di Indonesia.'),
  ('manfaat_petra', 'Meningkatkan layanan dan manfaat bagi lulusan'),
  ('manfaat_petra', 'Mendukung FKIP untuk menemukan putra/i daerah yang bisa kembali melayani daerah/sekolah pengutus setelah lulus'),
  ('manfaat_petra', 'Kesempatan bagi dosen untuk meningkatkan kompetensi social media management melalui penelitian bersama'),
  ('manfaat_petra', 'Memperlengkapi mahasiswa menjadi pendidik Kristen yang berkualitas akademik, emosional, dan spiritual terbaik di zamannya.'),
  ('manfaat_petra', 'Mahasiswa mendapatkan pengalaman di luar kampus dan dosen dapat melaksanakan P2M'),
  ('manfaat_petra', 'Membuka kesempatan PKL bagi mahasiswa dan meningkatkan kualitas pendidikan dan keilmuan'),
  ('manfaat_petra', 'Meningkatkan pemanfaatan modul Petraverse dan publikasi dalam penggunaan petraverse di lingkup eksternal.'),
  ('manfaat_petra', 'Mendapatkan benefit berupa Vending Machine yang dapat diakses dengan mudah oleh civitas PCU dan menjadi tempat untuk mempromosikan informasi penting.'),
  ('manfaat_petra', 'Memberikan kesempatan bagi dosen/mahasiswa prodi Desain Fashion dan Tekstil untuk berkarya dan meningkatkan skill.'),
  ('manfaat_petra', 'Mendapatkan exposure dari segi internasionalisasi dan memperoleh inbound student.'),
  ('manfaat_petra', 'Mendapatkan pembinaan yang layak dan terarah oleh salah satu kampus kredibel di Indonesia dalam membentuk Fakultas Kedokteran dan Kedokteran Gigi'),
  ('manfaat_petra', 'Mendukung penyebaran Alkitab terutama versi bahasa daerah ke pelosok - pelosok Indonesia dan membangun komunitas pemahaman akan Alkitab di UK Petra'),
  ('manfaat_petra', 'Membangun hubungan dengan mitra yang dapat membantu dalam proses pembentukan fakultas kedokteran yang berkualitas'),
  ('manfaat_petra', 'Mendapatkan calon mahasiswa FK UKP dan membantu dalam peningkatan pelayanan dan kualitas Kab. Maluku Tengah'),
  ('manfaat_petra', 'Mendapatkan calon mahasiswa FK UKP dan membantu dalam peningkatan pelayanan dan kualitas Kesehatan Kab. Sumba Timur'),
  ('manfaat_petra', 'Mendapatkan calon mahasiswa FK UKP dan membantu dalam peningkatan pelayanan dan kualitas kesehatan di Kab. Sumba Barat Daya'),
  ('manfaat_petra', 'Meningkatkan exposure dan keterlibatan PCU dalam pembangunan SDM Indonesia'),
  ('manfaat_petra', 'Memperluas kesempatan bagi mahasiswa UKP untuk mendapat pengalaman internasional.'),
  ('manfaat_petra', 'Menjalin kerjasama dengan TedX Surabaya dan mendapatkan insight dari para profesional melalui seminar oleh TEDX yang dihadiri oleh narasumber yang bagus'),
  ('manfaat_petra', 'Memperoleh informasi dan pengetahuan baru untuk mengembangkan kualitas kelembagaan di UK Petra.'),
  ('manfaat_petra', 'Memperoleh pegawai magang yang dapat mendukung berjalannya operasional universitas'),
  ('manfaat_petra', 'Berkesempatan melakukan penelitian dan meningkatkan IKP2M'),
  ('manfaat_petra', 'Mempromosikan KSI semakin luas ke khalayak umum'),
  ('manfaat_petra', 'Memperkenalkan program di Petra kepada calon mahasiswa serta mendapatkan calon mahasiswa baru untuk bergabung di UK Petra'),
  ('manfaat_petra', 'Meningkatkan kompetensi mahasiswa melalui kegiatan peningkatan kompetensi dan membantu mahasiswa Kristen dapat berkontribusi bagi bangsa.'),
  ('manfaat_petra', 'mendapatkan data hasil tes psikologi dengan lebih cepat dan akurat'),
  ('manfaat_petra', 'mendapatkan data hasil tes psikologi dari program OMNI'),
  ('manfaat_petra', 'Sebagai salah satu sarana memastikan lulusan Prodi MM UK Petra peminatan Wealth and Personal Finance menjadi pemimpin dan praktisi perencanaan keuangan pribadi yang kredibel, berintegritas dan berdampak bagi masyarakat'),
  ('manfaat_petra', 'Mendapatkan informasi dan pengembangan pelayanan misi'),
  ('manfaat_petra', 'Memperoleh jumlah masukan mahasiswa ke PBS sedini mungkin melalui kegiatan belajar di program Foundation'),
  ('manfaat_petra', 'Memperoleh mahasiswa dari Tanah Papua dan Sumba dengan tingkat kompetensi yang tinggi'),
  ('manfaat_petra', 'Koordinasi dan kolaborasi penanganan serangan siber'),
  ('manfaat_petra', 'Mendapatkan bantuan beasiswa bagi mahasiswa FKIP yang akan menjadi calon guru berkualitas.'),
  ('manfaat_petra', 'Mahasiswa dapat melakukan Joint Degree di universitas ranking dunia'),
  ('manfaat_petra', 'Penyediaan ruang untuk pembelajaran mahasiswa'),
  ('manfaat_petra', 'Promosi dan pameran di lokasi mitra, kerja sama antara Fakultas/Prodi dengan mitra terkait Tridharma Perguruan Tinggi, serta pemberian beasiswa'),
  ('manfaat_petra', 'Memberikan beasiswa dan penghargaan bagi mahasiswa S1 Teknik Sipil UK Petra'),
  ('manfaat_petra', 'Mempermudah UK Petra untuk menjangkau civitas akademika (termasuk alumni) yang tergerak untuk berdonasi, mempererat relasi dengan alumni, melalui aplikasi'),
  ('manfaat_petra', 'Saling menjaga dan mengetahui cara pengelolaan Informasi Rahasia yang diperoleh tiap pihak terkait realisasi kerja sama'),
  ('manfaat_petra', 'Memperoleh informasi, dukungan, dan bantuan perihal layanan digitalisasi dan perbankan'),
  ('manfaat_petra', 'Meningkatkan internasionalisasi serta menambah mahasiswa baru dari luar negeri'),
  ('manfaat_petra', 'Mengembangkan kerja sama berdasarkan kebutuhan akademik, ilmiah, dan pendidikan masing-masing.'),
  ('manfaat_petra', 'Berkontribusi dalam kegiatan sosial serta memperluas dan memperkuat jaringan kerja sama.'),
  ('manfaat_petra', 'Meningkatkan presentasi siswa bergabung di UK Petra dan mengikuti program JD dengan IMI'),
  ('manfaat_petra', 'Sebagai pusat ujian resmi TOEIC, TOEFL dan Certiport'),
  ('manfaat_petra', 'Meningkatkan kompetensi akademik mahasiswa, co-ass, dan staf pengajar FKG melalui pembaruan ilmu dan fasilitas teknologi medis terkini'),
  ('manfaat_petra', 'Merekrut mahasiswa asing menjadi mahasiswa di UK Petra'),
  ('manfaat_petra', 'Perekrutan calon mahasiswa dalam negeri di UK Petra'),
  ('manfaat_petra', 'Meningkatkan publikasi jurnal penelitian di forum international');

insert into managed_options (option_group, value) values
  ('manfaat_mitra', 'Meningkatkan kerjasama dengan berbagai pihak guna memperkaya pelaksanaan Tridharma Perguruan Tinggi'),
  ('manfaat_mitra', 'Menyembangkan channel promosi sertifikasi yang dimiliki'),
  ('manfaat_mitra', 'Mendukung misi BAMAG dalam menyelenggarakan koordinasi dengan instansi terkait dalam mewujudkan kesatuan dan persatuan NKRI.'),
  ('manfaat_mitra', 'Manfaat bagi Calon Mitra Memperkuat kerja sama dan membuka kesempatan magang bagi calon lulusan Universitas Kristen Petra'),
  ('manfaat_mitra', 'Mengembangkan wawasan global dan apresiasi budaya dari mahasiswa ZYU'),
  ('manfaat_mitra', 'Mempererat hubungan kerjasama degan universitas di Indonesia.'),
  ('manfaat_mitra', 'Membekali calon insinyur Indonesia dari UK Petra dengan kualitas pendidikan profesi Keinsinyuran.'),
  ('manfaat_mitra', 'Mendukung misi PT Kamdjaja Logistics dalam memiliki hubungan mutual yang menguntungkan dengan pihak mitra.'),
  ('manfaat_mitra', 'Mendukung pengembangan institusi pendidikan tinggi yang berkualitas dan mendapatkan calon guru muda yang bermuut'),
  ('manfaat_mitra', 'Mendukung misi IAPI yaitu menyediakan standar profesi akuntan publik dan kode etik yang berstandar internasional.'),
  ('manfaat_mitra', 'Mengembangkan wawasan global dan apresiasi budaya dari mahasiswa Taiwan Tech'),
  ('manfaat_mitra', 'Mendapatkan klien untuk penggunaan jasa penyedia data ESGI Dataset'),
  ('manfaat_mitra', 'Mendukung tercapainya visi misi organisasi'),
  ('manfaat_mitra', 'Mendukung misi WILL dalam meningkatkan kemampuan individu, tim, dan organisasi untuk berhasil dalam pengeksekusian akan suatu hal'),
  ('manfaat_mitra', 'Mendukung proses pengembangan salah satu use case IoT yaitu Smart Urban Farming.'),
  ('manfaat_mitra', 'Memperoleh calon - calon guru berkualitas untuk pelayanan di sekolah dalam naungan Yayasan Exodus.'),
  ('manfaat_mitra', 'Memperoleh calon - calon guru dengan ikatan dinas untuk mengajar di sekolah dalam naungan Yayasan Exodus.'),
  ('manfaat_mitra', 'Melindungi kerahasiaan informasi penting yang berhubungan dengan kerja sama dan mendapatkan klien untuk penggunaan jasa cloud transformation.'),
  ('manfaat_mitra', 'Melindungi kerahasiaan informasi penting yang berhubungan dengan kerja sama dan mendapatkan klien untuk penggunaan jasa pengembangan teknologi produk.'),
  ('manfaat_mitra', 'menyinergikan dan mengoptimalkan potensi dan sumber daya PARA PIHAK dalam rangka pengembangan kelembagaan dan pengembangan sumber daya manusia.'),
  ('manfaat_mitra', 'Dukungan untuk pelaksanaan tridarma PT dan Kampus Merdeka'),
  ('manfaat_mitra', 'Membangun relasi yang saling menguntungkan dengan mitra dan meningkatkan sistem pendidikan yang memadai dan semakin berkualitas'),
  ('manfaat_mitra', 'Memperkuat guru-guru Tionghoa yang ada di Indonesia terkhususnya di UK Petra sebagai salah satu universitas terkemuka di Indonesia'),
  ('manfaat_mitra', 'Mendukung RSM Indonesia untuk memperluas talent pool dan mendapatkan talenta berbakat.'),
  ('manfaat_mitra', 'Mendapatkan mahasiswa dari universitas ternama serta meningkatkan pendidikan akademik serta pendidikan vokasi mahasiswa'),
  ('manfaat_mitra', 'Menambah jumlah mahasiswa asing dan mendukung kualitas pembelajaran terutama dalam hal penelitian'),
  ('manfaat_mitra', 'Mendukung kegiatan pemerintah kota Surabaya di bidang pembangunan dan pemberdayaan masyarakat.'),
  ('manfaat_mitra', 'Mendukung pengembangan institusi pendidikan tinggi yang berkualitas terutama Tri Dharma perguruan tinggi.'),
  ('manfaat_mitra', 'Memeroleh SDM berkualitas'),
  ('manfaat_mitra', 'Mendapatkan jangkauan lebih dari mahasiswa PCU.'),
  ('manfaat_mitra', 'Mendapatkan sistem pembelajaran Petraverse dan kesempatan untuk andil dalam pengembangan Petraverse.'),
  ('manfaat_mitra', 'Menjalin kerja sama dengan universitas di Indonesia'),
  ('manfaat_mitra', 'Mempromosikan program pembelajaran, serta berkolaborasi dengan UKP.'),
  ('manfaat_mitra', 'Mendukung layanan komunikasi mitra pendidikan tinggi'),
  ('manfaat_mitra', 'Mendapatkan klien untuk mengikuti program persiapan Sertifikasi Internasional Pemasar Digital Profesional (Certified Digital Marketing Professional - CDMP)'),
  ('manfaat_mitra', 'Mendukung layanan Perguruan Tinggi'),
  ('manfaat_mitra', 'Memfasilitasi lulusan untuk melanjutkan studi sebagai calon guru'),
  ('manfaat_mitra', 'Pelaksanaan CSR dan kerja sama dengan institusi pendidikan tinggi dalam rangka rekrutmen staf yang sesuai kebutuhan'),
  ('manfaat_mitra', 'Sebagai salah satu bentuk CSR dan sarana promosi'),
  ('manfaat_mitra', 'Mitra pendapatkan penghasilan dari proyek penelitian yang dilakukan.'),
  ('manfaat_mitra', 'Mendapatkan insights dari sisi akademis terkait perkembangan teori & konsep social media management. Magang mahasiswa juga akan memberi manfaat bagi perusahaan utk proses rekrutmen lulusan'),
  ('manfaat_mitra', 'Mendukung visi di atas dan mendapatkan calon guru yang memadai untuk mengajar di MSC'),
  ('manfaat_mitra', 'Meningkatkan citra positif PT Bakels'),
  ('manfaat_mitra', 'Mendukung misi dalam mengembangkan kemitraan strategis yang saling mendukung dan mempromosikan produk dan layanan berkualitas.'),
  ('manfaat_mitra', 'Tenaga Ahli dan Pendampingan Kegiatan / Program Sosial'),
  ('manfaat_mitra', 'Melakukan kolaborasi dan advokasi untuk dampak yang lebih luas dalam kegiatan perlindungan anak, peningkatan kesehatan masyarakat, sosial serta ekonomi'),
  ('manfaat_mitra', 'Mendukung peningkatan kualitas keilmuan dan mendorong industri persepatuan'),
  ('manfaat_mitra', 'Mendapat kesempatan seleksi pegawai lebih awal melalui kegiatan PKL dan Kesempatan untuk memperoleh solusi bagi permasalahan perusahaan.'),
  ('manfaat_mitra', 'Kolaborasi riset dan inovasi pada bidang-bidang yang relevan dengan visi, misi, dan rencana strategis'),
  ('manfaat_mitra', 'Mendapatkan tempat untuk menjual produk - produk yang dimiliki serta bertambahnya jumlah konsumen yang akan membeli produk tersebut.'),
  ('manfaat_mitra', 'Mendapatkan seragam dengan desain dan kualitas yang baik untuk branding dan kenyamanan pegawai.'),
  ('manfaat_mitra', 'Mendapat sumber daya untuk mengikuti kegiatan PKL dan kesempatan untuk memperoleh solusi bagi permasalahan perusahaan.'),
  ('manfaat_mitra', 'Mendapatkan dukungan dalam pelaksanaan Program Kartu Prakerja'),
  ('manfaat_mitra', 'Mendukung misi Epsindo sebagai perusahaan IT provider yang mampu memberikan nilai tambah kepada customer maupun mitra'),
  ('manfaat_mitra', 'Memperoleh calon - calon guru berkualitas untuk pelayanan di sekolah'),
  ('manfaat_mitra', 'Memperoleh pengalaman internasional melalui kunjungan dna pertuakran budaya yang dilakuka.'),
  ('manfaat_mitra', 'Mendapatkan hak untuk disebutkan sebagai pembina pembentuk fakultas kedokteran baru serta meningkatkan presetase kegiatan Tri Dharma'),
  ('manfaat_mitra', 'Mendapat dukungan dalam melaksanan visi dan misi pelayanan terutama penyebaran Alkitab dan membangun komunitas LAI di seluruh Indonesia'),
  ('manfaat_mitra', 'Mendukung Program Tridharma untuk Fakultas kedokteran UK Petra kedepannya dalam melahirkan calon dokter yang profesional'),
  ('manfaat_mitra', 'Meningkatkan kualitas SDM terutama dalam hal kesehatan dengan pengadaan dokter dari putra/putri Maluku Tengah di Maluku Tengah'),
  ('manfaat_mitra', 'Meningkatkan kualitas SDM terutama dalam hal kesehatan dengan pengadaan dokter dari putra/putri Sumba Timur di Sumba Timur'),
  ('manfaat_mitra', 'Meningkatkan kualitas SDM terutama dalam hal kesehatan dengan pengadaan dokter dari putra/putri Sumba Barat Daya di Sumba Barat Daya'),
  ('manfaat_mitra', 'Memperoleh informasi dan pengetahuan baru untuk mengembangkan kualitas kelembagaan di UK Petra.'),
  ('manfaat_mitra', 'Mendapatkan dukungan dalam bidang pelayanan terutama untuk lansia'),
  ('manfaat_mitra', 'Mendapatkan sumber daya dalam membantu melaksanakan pembangunan/renovasi/perawatan rumah bagi masyarakat yang membutuhkan'),
  ('manfaat_mitra', 'Menyediakan tempat magang dan bekerja bagi para calon lulusan SMK Kristen Petra'),
  ('manfaat_mitra', 'Mendapatkan solusi dan meningkatkan kualitas mengenai bidang yang dijalankan perusahaan'),
  ('manfaat_mitra', 'Mendapatkan kursus peningkatan skill Bahasa Korea bagi siswa - siswa SMP dan SMA di PPPK Petra'),
  ('manfaat_mitra', 'Meningkatkan kualitas kerja sama Penerimaan Mahasiswa Baru (PMB)'),
  ('manfaat_mitra', 'Melaksanakan penelitian bersama untuk meningkatkan IKP2M'),
  ('manfaat_mitra', 'Mendukung tercapainya visi dan misinya'),
  ('manfaat_mitra', 'Meningkatkan kompetensi mahasiswa melalui kegiatan peningkatan kompetensi dan membantu mahasiswa Kristen dapat berkontribusi bagi bangsa.'),
  ('manfaat_mitra', 'Mendapat data untuk pengembangan alat tes psikologi'),
  ('manfaat_mitra', 'Mendapatkan narasumber untuk pengembangan kualitas SDM'),
  ('manfaat_mitra', 'Mencapai tujuan pemberdayaan sumber daya manusia dari Tanah Papua dan Sumba melalui dukungan pendidikan yang berkualitas di Universitas Kristen Petra'),
  ('manfaat_mitra', 'Koordinasi dan kolaborasi penanganan serangan siber'),
  ('manfaat_mitra', 'Memanfaatkan sumber daya yang dimiliki masing-masing sesuai dengan fungsi dan kewenangan masing-masing'),
  ('manfaat_mitra', 'Meningkatkan jumlah mahasiswa dan internasionalisasi'),
  ('manfaat_mitra', 'Mendukung almamater dengan menjadi berkat bagi mahasiswa yang berkuliah di jurusan yang sama dengan mitra donatur'),
  ('manfaat_mitra', 'Dapat bekerja sama menyediakan jasa pembuatan aplikasi bagi universitas'),
  ('manfaat_mitra', 'Saling menjaga dan mengetahui cara pengelolaan Informasi Rahasia yang diperoleh tiap pihak terkait realisasi kerja sama'),
  ('manfaat_mitra', 'Memperoleh informasi, dukungan, dan bantuan perihal promosi dan nasabah layanan digitalisasi dan perbankan'),
  ('manfaat_mitra', 'Penggunaan jasa untuk bisa menghubungkan dengan universitas luar dan merekrut mahasiswa luar bagi UK Petrea'),
  ('manfaat_mitra', 'Meningkatkan dan mengembangkan kerja sama akademik dengan Universitas di Indonesia'),
  ('manfaat_mitra', 'Memperluas jaringan kerja sama, memperoleh peluang kolaborasi riset dan inovasi, saling mendukung dalam program/kegiatan pelayanan kesehatan'),
  ('manfaat_mitra', 'Mengembangkan kerja sama berdasarkan kebutuhan akademik, ilmiah, dan pendidikan masing-masing.'),
  ('manfaat_mitra', 'Berkontribusi dalam kegiatan sosial serta memperluas dan memperkuat jaringan kerja sama.'),
  ('manfaat_mitra', 'Menarik minta mahasiswa untuk mengikuti program JD dan bisa studi di IMI selama satu tahun'),
  ('manfaat_mitra', 'Memperluas jaringan kerja sama dan saling mendukung dalam program pelayanan kesehatan'),
  ('manfaat_mitra', 'Memperluas jaringan kerja sama global dan saling mendukung dalam program academic exchange'),
  ('manfaat_mitra', 'Memperluas jaringan kerja sama yang saling menguntungkan dalam ruang lingkup pendidikan, pelatihan, dan pengembangan teknologi kedokteran gigi'),
  ('manfaat_mitra', 'Memperluas jaringan kerja sama global dan saling mendukung dalam program joint projects'),
  ('manfaat_mitra', 'Mempererat kerja sama, memperoleh edukasi dan layanan kesehatan mulut dan gigi serta informasi PMB dan prospek karir bagi siswa'),
  ('manfaat_mitra', 'Mendapatkan client serta komisi dari proses perekrutan'),
  ('manfaat_mitra', 'Mendapat siswa untuk bisa mengambil pelatihan di SMARCH yang berujung pada penyaluran ke UK Petra sebagai mahasiswa baru'),
  ('manfaat_mitra', 'Mendapat perserta yang ikut mengirimkan jurnal penelitian');

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
-- unused (managed_options exists to be picked, not to be an orphan list).
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
  select value, (row_number() over (order by id) - 1) as rn,
         count(*) over () as n
  from managed_options where option_group = 'manfaat_petra'
),
mitra_opsi as (
  select value, (row_number() over (order by id) - 1) as rn,
         count(*) over () as n
  from managed_options where option_group = 'manfaat_mitra'
)
insert into proposal_dokumen
  (jenis_kerjasama, status_proposal, tujuan_kerjasama, manfaat_bagi_petra, manfaat_bagi_mitra, id_akun_pembuat)
select
  td.jenis::jenis_kerjasama_t, 'Draft', td.tujuan, mp.value, mm.value,
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
