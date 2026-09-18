-- Revisi V5 §6/§8 — agenda gets the same is_active flag as the other lookup
-- lists, so Master Data can retire an agenda (and the CSV import can replace
-- the list) without deleting rows that past proposals still reference (BR-23).
alter table agenda add column is_active boolean not null default true;
