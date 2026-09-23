-- Implementasi tab as an activity list (client revision 2026-09-23).
--
-- Each row is now one Implementation Arrangement -- one planned activity --
-- listed as No., Periode, Nama Kegiatan, Jenis Kegiatan, Unit Pelaksana and
-- Jumlah Peserta. The Implementation Report is no longer a row of its own: it
-- is the realization file uploaded against its arrangement, so it becomes a
-- column (berkas_laporan) and `jenis` goes. The table held no rows when this
-- was written, so nothing is migrated.
--
-- Nama Kegiatan stays `judul`; renaming it would only churn the Realization
-- Form's contract for no change in meaning.

drop index implementasi_dokumen_idx;
alter table implementasi_dokumen drop column jenis;

alter table implementasi_dokumen
  -- Academic semester, "Ganjil 2026/2027" / "Genap 2026/2027": the two years
  -- must be consecutive, so a typo like 2026/2028 is refused, not listed.
  add column periode           varchar(20)
    check (periode ~ '^(Ganjil|Genap) [0-9]{4}/[0-9]{4}$'
           and split_part(split_part(periode, ' ', 2), '/', 2)::int
             = split_part(split_part(periode, ' ', 2), '/', 1)::int + 1),
  -- Free text for now; a managed list can replace it once the Realization
  -- Form settles the vocabulary.
  add column jenis_kegiatan    varchar(100),
  add column id_unit_pelaksana int references unit (id),
  add column jumlah_peserta    int check (jumlah_peserta >= 0),
  -- The Implementation Report: a path in the dokumen-kerjasama bucket, set
  -- once the activity has been carried out.
  add column berkas_laporan    varchar(500);

-- The tab's only query: one document, newest first. "Genap 2026/2027" and
-- "Ganjil 2026/2027" share an academic year, so the tab orders by tanggal
-- (which stays required) rather than by the periode string.
create index implementasi_dokumen_idx
  on implementasi_dokumen (no_dokumen_kerjasama, tanggal desc);
create index implementasi_unit_idx on implementasi_dokumen (id_unit_pelaksana);

comment on table implementasi_dokumen is
  'Implementation Arrangements (one planned activity per row) for a signed
   cooperation document; berkas_laporan is its Implementation Report file.
   Read-only in the app for now: the Implementasi tab lists it, the
   Realization Form project writes it.';
