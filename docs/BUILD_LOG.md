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

## 4 — RLS, then a hardening pass that caught four real holes

RLS is enabled on all 28 tables and expresses the access model itself rather
than duplicating it in app code (EC-05). The two axes: a stored `role` on
`akun`, and a derived approver status — an open `disposisi_target` matching the
account's `jabatan`. No `approver` role is ever stored (AR-01).

The policy worth reading is on `disposisi_target`: an account may update a
target only when it is routed to that account's own position **and** the target
is `pending_action`. That is tier gating enforced at the database, underneath
every route (BR-01). Append-only logs get select and insert policies and no
others (DR-02). There is no delete policy anywhere (BR-09).

### The hardening pass

Running Supabase's security advisors after RLS landed surfaced that every
function in `public` is published as a PostgREST RPC endpoint, reachable with
just the anon key. Reading them back with that in mind, four checked no
authority at all:

| Function | Was | Now |
|---|---|---|
| `ajukan_proposal` | anyone could submit anyone's draft | IO or the proposal owner |
| `kirim_disposisi` | anyone could assign approvers | IO only |
| `catat_revisi` | anyone could overwrite a draft file | IO only |
| `arsipkan_dokumen` | **anyone could archive any document** | IO only |

`aksi_approval`, `aktivasi_dokumen`, `tambah_target`, `hapus_target` and
`reaktivasi_pending` already checked, and held.

Beyond the checks: `EXECUTE` is revoked from `PUBLIC` (revoking from `anon`
alone does nothing — it inherits through `PUBLIC`) and granted back function by
function to `authenticated`; `recompute_tiers` is granted to nobody, since it is
internal and called by the action functions as the owner; and `search_path` is
pinned on every function so a caller cannot shadow a table name.

`anon` can now execute nothing in the schema. The full §9 suite was re-run after
the hardening and stays green.

One advisor notice is left standing deliberately: `partner_eval_token` has RLS
enabled with no policy, because no logged-in account should ever read it — the
partner token resolves through an Edge Function on the service role (AR-07).

**Still owed, outside SQL:** enable Supabase Auth's leaked-password protection
(HaveIBeenPwned check) in project settings.

## 5 — The Phase 1 application

Next.js App Router on the verified backend. Server Components read, Server
Actions write, and no action re-implements a rule: each one is a thin call into
the Postgres function that owns the rule (EC-01, EC-04).

| Route | What it is |
|---|---|
| `/login` | Card over Midnight; role emails, not personal accounts |
| `/dashboard` | The KPI cards, including both team KPIs |
| `/kerja-sama` | The lifecycle as tabs, archive included as a tab |
| `/kerja-sama/[id]` | Tier progress, approver actions, live disposition editing, history |
| `/buat` | The proposal form with the recursive tri-state Lingkup tree |
| `/antrean` | The personal approval queue, red before yellow before the rest |

Three pieces where the specification is emphatic and the obvious build is wrong:

**The tri-state Lingkup tree.** Checking a faculty checks every descendant at
any depth, recursively. Unchecking one child leaves the parent *indeterminate*
— a real `indeterminate` DOM state with `aria-checked="mixed"`, not a binary
box that snaps the whole faculty off. The partial state is derived at render
time; only the explicit set of chosen unit ids is ever posted (BR-37, BR-38).

**Pending and Revision look as different as they are.** Pending is visually
heavier and its confirmation says the thing that is actually surprising: the
entire approval restarts from Tier 1, including tiers that already approved. A
user who expected a gentle pause and got a full reset will be angry, so the
consequence is stated at the moment of choosing, not in a generic
"Are you sure?" (Design §4.4, §4.8).

**A frozen document shows a paused indicator, not a ticking count.** The clock
really is stopped, and a number still climbing would read as overdue to whoever
is scanning the list.

Both `tsc --noEmit` and `next build` pass; all seven routes compile.

Not in this phase, by scope: the world map and chart studio, the scheduled SLA
and expiry sweeps, the three Excel exports, per-column filters, file upload to
Storage, and the whole renewal flow with its partner token page.
