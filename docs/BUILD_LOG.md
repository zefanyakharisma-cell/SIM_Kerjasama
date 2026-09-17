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

## 6 — Phase 2: SLA sweeps, notifications, filters and exports

The scheduler the PRD names as a hard prerequisite is now real: `pg_cron` runs
the SLA sweep at 22:00 UTC and the expiry sweep fifteen minutes later — 05:00
and 05:15 WIB, before the office opens.

**Idempotency is structural, not conventional.** A sweep that is idempotent
only because someone remembered to check stops being idempotent the first time
it is edited. So `notifikasi` gained `id_disposisi_target` and a unique index
over `(target, severity, recipient)`: the second run of the day cannot insert a
duplicate reminder because the index refuses it. The expiry cadence uses the
same trick in time — a reminder is skipped while a recent one exists, monthly
from six months out and weekly once two months remain.

The two SLA scales stay separate in the sweep itself. An approval target is
counted in business days net of weekends, holidays and frozen spans; a renewal
request runs on the 30/60/90 calendar-day scale (BR-32). Resolved targets are
never touched — their duration was frozen when they resolved, so editing the
holiday calendar cannot rewrite history (DR-03).

**Notifications come from one trigger, not nine call sites.** Every workflow
event already writes exactly one `riwayat_approval` row, and that log is
append-only, so a single trigger over it catches every event on every path,
including paths written later. A second trigger fires when a `disposisi_target`
actually *opens* rather than when it is created: telling a tier-3 approver to
act while tier 1 is still running would be telling them to do something the
database will refuse.

Email leaves the transaction entirely. The Edge Function drains pending
notifications on a schedule, so a mail provider being down can never roll back
an approval (BR-21). A row with no address and no configured provider stays
`pending` rather than being marked sent — nothing is silently dropped.

**The lists, the filters and the exports read one query.** The export button
promises to export "what I am looking at", and the only way to keep that
promise is for the screen and the download to build the identical query. Both
now call `terapkanFilter` over `v_daftar_dokumen`; the export differs only in
taking every page instead of one.

Two details in those views are load-bearing:

- `security_invoker = true`. Without it a view runs as its owner and silently
  bypasses every RLS policy underneath. With it, the view is only a shape and
  RLS still decides the rows.
- The filter row is a plain GET form, which puts filter state in the URL. That
  is what makes a filtered view reloadable, shareable, and exportable by
  handing the same query string to the download endpoint.

Exports are CSV with a BOM rather than a binary workbook: Excel opens it
natively and the alternative was a zip-and-XML dependency for the same columns.
The BOM is what stops Excel mangling "Universität" on a Windows machine.

An empty filtered list says something different from an empty list — users
mistake the first for a broken system (Design §6).

### Verification

Two more of the mandatory tests now exist and pass against Postgres 17:

| rules §9 | Check | Result |
|---|---|---|
| 9.7 | Sweep idempotency — SLA and expiry twice in a day | pass |
| 9.8 | Transaction rollback — a failed reactivation leaves nothing | pass |

§9.8 uses a plpgsql exception block, which *is* a subtransaction, so it
exercises the real rollback path rather than simulating one. The earlier suite
still passes, and `next build` compiles all nine routes.

The test blocks share one `bersihkan_proposal_uji` cleanup function — the only
place in the schema that deletes a proposal. EXECUTE is granted to nobody, so
no route can reach it and BR-09 is untouched.

**Still owed outside SQL:** deploy `kirim-email` and set `RESEND_API_KEY`,
`EMAIL_FROM` and `APP_URL`; schedule it every five minutes.

## 7 — Phase 3: renewal, evaluation, the partner page, admin and analytics

The half of the system that makes renewal proactive instead of remembered.

**A renewal request shares tables with an approval and shares no logic.** It
carries no tier, never enters `recompute_tiers`, gates nothing, and completes
when the unit uploads the draft — not by an approve or a reject, which it never
had. Its SLA runs on the 30/60/90 calendar-day scale, never the 2/4
business-day approval scale. Every function branches on `jenis_disposisi`
before anything else (BR-24, BR-25, BR-32).

**The gate is the piece most likely to be built wrong.** It has four outcomes,
and the failure mode is letting a NULL fall through as agreement: an evaluation
that was never submitted is not a recommendation, and a NULL recommendation is
not a "continue". `status_gerbang_pembaruan` checks *submitted AND continue*
explicitly on both sides, and `buat_proposal_perpanjangan` refuses in the
database — so no route, no script and no future API can get past it (BR-26).

A split never resolves itself. It waits for an override that names a decision
*and* a reason, and the function refuses a blank one.

**Reopening supersedes; it never edits.** The prior answer stays exactly as the
partner submitted it, a fresh pending row takes its place with `id_supersedes`,
and a new token is issued. The gate reads the latest non-superseded answer, so a
partner who changes their mind changes the outcome without erasing the record
(BR-30, DR-08).

### One deliberate deviation from the architecture

The architecture specifies an Edge Function on the service role for the partner
token. This build resolves it in a Postgres function granted to `anon` instead.
The security property is identical — server-side resolution, scoped to exactly
one evaluation, exposing the prefilled header and nothing else — and it removes
a deployment surface and one more copy of the service-role key. `anon` can
execute exactly two functions in the schema and nothing else, both of which
require a 256-bit token.

The unknown-token, spent-token and revoked-token cases return the same message
on purpose. Distinguishing them would tell someone guessing tokens which guesses
were close.

### The partner page

Trust is a functional requirement on this one screen: a partner gets a bare
link by email and decides in about two seconds whether it is really from Petra.
So the header carries the full university wordmark on brand Midnight, and the
first thing under it is the partner's own institution named back to them — which
is what a phisher would not know.

The Likert grids are one component shared with the faculty form, because the
two answers are compared against each other and would otherwise drift apart.
They are radio groups with real row headers rather than a clickable matrix of
divs: the obvious build is mouse-only and unusable with a screen reader.

### Elsewhere

- **Activation and first disposition** existed as functions but had no UI at
  all — a real Phase 1 gap, now closed. Activation also closes the renewal
  chain: link the successor, archive the predecessor as superseded, in one
  transaction (BR-12).
- **Partner merge** re-points every reference and marks the loser merged; it
  never deletes. Documents the survivor is already on drop their duplicate join
  row rather than colliding on the primary key.
- **The chart studio** aggregates in SQL but never by concatenating a saved
  config into a query string. Grouping, metric and filter are matched against
  fixed sets and anything unrecognised is refused — an admin-saved config is
  data, and data must not become SQL.
- **Evaluation analytics** keep `id_dokumen_kerjasama` on every row of
  `v_evaluasi_gap`. That column is the drill-down: an aggregate that drops it
  cannot be repaired downstream (Q8).
- **Peta Mitra Global** omits partners with no coordinates rather than pinning
  them at 0°,0°, which looks like data instead of like missing data (O4).
- **Discussion and Activity Log** are read-only views over the append-only
  approval log. Discussion is a revision-requests list, not a chat.

### Verification

The remaining mandatory tests are written and pass against Postgres 17; all
thirteen now exist:

| rules §9 | Check | Result |
|---|---|---|
| 9.9 | Evaluation gate — refuses with none, with one, and on a split | pass |
| 9.10 | Reopen supersedes without editing; the gate reads the latest | pass |
| 9.11 | Token scope — unknown resolves to nothing, submitted goes inert | pass |
| 9.13 | RLS boundary — another unit's in-progress document is unreachable | pass |

§9.13 is exercised through `boleh_baca_proposal`, the predicate every read
policy delegates to, so it tests the rule rather than one policy's copy of it.

An end-to-end scenario was also run against the real database and rolled back:
one document through approval, activation, renewal request and both
evaluations populates every new view correctly — gate `terbuka`, ten gap rows
(two evaluations × five dimensions), one map pin. `next build` compiles all
fourteen routes.

**Still owed outside SQL:** geocode partner coordinates; confirm brand assets
with MRD (O3).

## 8 — Phase 4: the read API for the Realization System

Three read endpoints, and one question that needed a database function.

| Endpoint | Answers |
|---|---|
| `GET /api/v1/kerja-sama` | Which Active agreements can an arrangement be filed against? |
| `GET /api/v1/kerja-sama/{no}` | What is this agreement? |
| `GET /api/v1/kerja-sama/{no}/penerus` | My reference points at this — where should it point now? |

The third is the one that matters. An Implementation Arrangement must always
point at an **Active** document (BR-13), but the Realization System holds
references that renewal moves out from under it. `resolusi_penerus` walks the
chain forward — `id_dokumen_sebelumnya` points backwards, so following it in
reverse is what "who replaced me" means — and returns the document at the end,
with the number of renewals in between. `perlu_dipindahkan` is the answer in
one field, so the caller does not re-derive it by comparing ids and get it
subtly wrong. The walk is depth-limited: a data error that made the chain
circular should return an answer, not hang the caller.

The list returns Active documents only, and that is the contract rather than a
default — archived documents never appearing there is the cheapest way to keep
BR-13 true. Detail, by contrast, *does* serve archived documents, which is
exactly why archival is a status and not a deletion: a stale reference has to
resolve to something before it can be followed forward.

**The service-role client lives in one file with a warning on it.** It bypasses
RLS, which every other path in the system relies on, so it is confined to
`src/lib/supabase/service.ts`, imported only by `/api/v1`, and each handler
scopes its own rows. The API key is one shared secret compared in constant
time; a per-client table with revocation is the right shape once there is a
second consumer, and today there is exactly one.

The middleware now excludes `api/v1` — redirecting a machine client to `/login`
would turn a 401 into a 307 and an HTML page. `/api/ekspor` stays inside the
matcher deliberately: the exports run on the caller's own session so that RLS
decides their rows.

### Verification

A two-document renewal chain was built end to end against Postgres 17 and the
assertions kept as a regression test: activation archives the predecessor
`superseded_by_renewal` in the same transaction that creates the successor
(BR-12), a reference to the old document resolves forward to the Active one in
one step, and a reference that is already current resolves to itself in zero.
`next build` compiles all seventeen routes.

## 9 — A second hardening pass, and the trap that caused it

Running the security advisors after Phases 2–4 found sixteen functions
reachable with nothing but the anon key. The cause is worth recording, because
it will happen again to whoever writes the next migration.

Phase 1 ended with:

```sql
alter default privileges in schema public revoke execute on functions from public;
```

That governs objects created **by the role that set it**, from that point on.
It is not a property of the schema. Every function written in a later migration
got Postgres's normal default back — `EXECUTE` to `PUBLIC`, which `anon`
inherits through it.

Most of those functions check authority themselves and failed closed:
`current_akun()` is NULL for an unauthenticated caller, so every
`current_akun_is_io()` gate refuses. A few checked nothing, because they were
never meant to be reachable:

| Function | Exposure |
|---|---|
| `agregasi_grafik` | SECURITY DEFINER over the document view, so it bypasses RLS **by design** — aggregate counts across every document, to anyone with the anon key |
| `status_gerbang_pembaruan` | the renewal state of any document, by number |
| `jabatan_pemilik_dokumen` / `_proposal` / `jabatan_prefill_perpanjangan` | enumerate which positions are attached to which document |

None of them writes anything. All of them leak, and the first one leaks the
whole dataset in aggregate.

`anon` now executes exactly two functions in the schema — `resolusi_token_evaluasi`
and `kirim_evaluasi_partner` — both of which require a 256-bit token and are
scoped to one evaluation. That is the entire public surface (AR-07). The
trigger functions are revoked from everyone, since Postgres invokes them as the
table owner and nothing should reach them through PostgREST.

Verified after applying: `anon` holds EXECUTE on those two functions and
nothing else, and every function the app calls is still reachable by
`authenticated`.

The whole §9 suite was re-run against Postgres 17 afterwards and stays green.

**The standing lesson for the next migration:** a new SECURITY DEFINER function
is public until you say otherwise. Revoke explicitly in the same migration that
creates it; do not rely on the default-privileges line from an earlier one.

### Advisor notices left standing, deliberately

- `partner_eval_token` has RLS enabled with no policy. No logged-in account
  should ever read it; the token resolves through a SECURITY DEFINER function.
- The remaining `security_definer_function_executable` notices are for
  `authenticated`, which is the intended caller — each of those functions
  checks its own authority.

**Still owed outside SQL:** enable Supabase Auth's leaked-password protection
(HaveIBeenPwned) in project settings — carried over from Phase 1 and still off.
