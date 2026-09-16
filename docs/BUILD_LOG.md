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

## 3 — Domain functions, verified against real Postgres

Tier gating and business-day-SLA-with-pause now live in Postgres, where no
route can bypass them, plus the workflow actions that call them.

`recompute_tiers` is the single writer of `status_proposal` during disposition
and is idempotent: every action, every live edit and every reactivation calls
the same function rather than each site deciding "if this was the last one,
unlock the next" (BR-03). The unlock rule is **no blockers below** — a target
opens when no lower-tier target in the current round is un-approved — so an
empty tier skips instead of deadlocking (BR-02).

Two implementation decisions worth knowing:

- **Reactivation opens a new round of rows** rather than resetting the old ones.
  `round_ke` then means something, and `riwayat_approval` keeps pointing at the
  targets that actually acted.
- **Removal is `status = 'removed'`, not a DELETE** — the audit is append-only,
  so the row a log entry references has to survive.

A test seam lets a test act as a position: with no Auth session, `current_akun()`
honours a `simks.akun_id` session setting, but only for privileged roles. A
browser client connects as `authenticated` and can never reach that branch.

### Verification

Applied to Postgres 17 and executed. All assertions pass:

| rules §9 | Check | Result |
|---|---|---|
| 9.1 | Tier gating with a gap — tiers 1 and 3, tier 2 empty | pass |
| 9.2 | Pending reset — round bumps, no approval survives | pass |
| 9.3 | SLA pause — frozen days netted out exactly | pass |
| 9.4 | Revision leaves siblings untouched and does not freeze | pass |
| 9.5 | Live edit — add blocks, remove-last advances, approved refused | pass |
| 9.6 | Business days — holidays, weekends, Friday + 1 | pass |
| 9.12 | Lingkup cascade — recursive, with derived indeterminate state | pass |
| BR-01 | A locked target cannot be acted on | pass |

Remaining §9 tests (sweep idempotency, transaction rollback, the evaluation
gate, reopen, token scope, the RLS boundary) arrive with the features they test.

### Database note

The `simks-partnership` Supabase project already held a superseded English-named
v2 build with 729 documents. Rather than dropping it, that schema was renamed to
`v2_archived` — every row intact, reversible, and now the source for the schema
v3 data migration (Architecture §12.2). `public` is schema v3.
