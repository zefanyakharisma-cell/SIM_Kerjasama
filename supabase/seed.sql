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
-- is_domestic is the authoritative domestic/international source. It is true
-- for exactly one row; nothing anywhere compares country names (BR-16, DR-07).
insert into negara (kode, nama, is_domestic) values
  ('IDN','Indonesia',true),
  ('AUS','Australia',false), ('CHN','China',false), ('DEU','Germany',false),
  ('GBR','United Kingdom',false), ('JPN','Japan',false), ('KOR','South Korea',false),
  ('MYS','Malaysia',false), ('NLD','Netherlands',false), ('PHL','Philippines',false),
  ('SGP','Singapore',false), ('THA','Thailand',false), ('TWN','Taiwan',false),
  ('USA','United States',false), ('VNM','Vietnam',false);

-- Fields of cooperation ------------------------------------------------------
insert into bidang_kerjasama (nama) values
  ('Pembelajaran'), ('Penelitian'), ('Abdimas'), ('Kemahasiswaan'), ('Kelembagaan');

-- Cooperation agenda ---------------------------------------------------------
-- is_amendment flags the addendum path so it is detected by a boolean, never by
-- matching the Indonesian string (BR-16).
insert into agenda (nama, is_amendment) values
  ('Adendum/Amandemen', true),
  ('Student Exchange', false), ('Staff/Faculty Exchange', false),
  ('Joint Research', false), ('Joint Publication', false),
  ('Joint Degree/Double Degree', false), ('Guest Lecture', false),
  ('Internship/Magang', false), ('Community Service', false),
  ('Conference/Seminar', false), ('Curriculum Development', false),
  ('Scholarship', false), ('Laboratory/Facility Sharing', false);

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
