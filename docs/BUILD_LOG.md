# Build log

Each entry is one commit. Newest last.

## 1 — Repository scaffold

Next.js 15 (App Router) + TypeScript + Tailwind, Supabase client deps, PCU brand
tokens in `tailwind.config.ts` (Formal register, Midnight base — PRD §16), and
this log.

No framework beyond the four documented dependencies: `@supabase/supabase-js`,
`@supabase/ssr`, `next`, `react`. Charts and the map arrive with Phase 2.

## 2 — Schema v3 as Postgres migrations

Four migrations covering the whole `.mwb`-aligned schema v3, ported to Postgres
(identity keys, `boolean`, `timestamptz`) with the Indonesian names kept.

Three deliberate deviations from schema v3, each commented at the column:

- `akun` has no `password` column — Supabase Auth owns credentials; `akun` joins
  to `auth.users` and carries the authorization identity.
- `riwayat_approval.id_disposisi_target` is nullable, with `id_proposal_dokumen`
  added, so document-level events ("Proposal dibuat") can be logged. The
  Activity Log reads this table and needs them.
- `disposisi_target.status` gains `'removed'`. A removed approver cannot be
  DELETEd — `riwayat_approval` hangs off the row and the audit is append-only.

One table added beyond schema v3: `keputusan_pembaruan`, the split-decision
override. PRD §14 lists it; the schema's table list omits it.

Invariants already enforced in the database: archived implies a reason, Auto
Renewed implies no end date (trigger, since the rule spans two tables), one
lead partner per document, one open pending span per proposal, and a
disposition's subject matching its kind.
