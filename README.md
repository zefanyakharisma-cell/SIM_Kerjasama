# SIM Kerja Sama (SIM-KS)

Partnership Document Management System for the **Kantor Kerja Sama dan Urusan
Internasional (KUI)**, Petra Christian University.

SIM-KS creates, approves, measures and renews PCU's partnership documents
(MoU/MoA). It is the authoritative dataset behind the PCU Internasionalisasi KPI
Dashboard, and the future Partnership Realization System reads from it.

- **Proposal & approval.** A three-tier disposition process enforced by the
  database. Approvers can approve, reject, request a revision or set the
  document to pending. IO can edit the approver list while approval is in
  progress. Every action is recorded in an append-only audit trail.
- **Dashboard & reporting.** KPI cards, a world partner map (Peta Mitra Global),
  a configurable chart studio (Studio Grafik), SLA flags, and filtered Excel
  exports.
- **Renewal & evaluation.** Expiry reminders start 6 months ahead. Renewal
  requests go to the owning unit. The faculty fills a structured evaluation, and
  the external partner fills one through a no-login token link. Both must agree
  before a renewal proposal can be created.

---

## Contents

- [Tech stack](#tech-stack)
- [Architecture at a glance](#architecture-at-a-glance)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Application routes](#application-routes)
- [Roles & access](#roles--access)
- [Core workflows](#core-workflows)
- [Scheduled jobs & email](#scheduled-jobs--email)
- [Realization read API](#realization-read-api)
- [Database & migrations](#database--migrations)
- [Testing](#testing)
- [Deployment](#deployment)
- [Ground rules for contributors](#ground-rules-for-contributors)
- [Documentation](#documentation)

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router, typed routes), React 18, TypeScript, Tailwind CSS 3 |
| Backend | Supabase: Postgres 17, Auth, Storage, Row-Level Security, Edge Functions, `pg_cron` |
| Domain logic | Postgres functions (tier gating, business-day SLA with pause, unit cascade, renewal gate) |
| Charts / map | ECharts (Studio Grafik), Leaflet (Peta Mitra Global) |
| Exports | ExcelJS (`.xlsx`) |
| Email | `kirim-email` Supabase Edge Function via Resend |
| Hosting | Vercel (frontend), Supabase (database and functions) |

## Architecture at a glance

```
Browser ──► Next.js on Vercel
             ├─ Server Components  ── read ──►┐
             ├─ Server Actions     ── write ─►├─► Supabase Postgres (RLS on every table)
             ├─ /api/ekspor        (session) ─┤     ├─ domain functions: recompute_tiers, SLA, cascade, renewal gate
             ├─ /api/v1            (API key) ─┘     ├─ pg_cron: SLA sweep, expiry sweep
             └─ /evaluasi/[token]  (public, anon)   └─ notifikasi queue ──► kirim-email Edge Function ──► Resend
```

The main design choice is to put the rules in the database. **Access control is
RLS, and tier gating and SLA are Postgres functions.** They behave the same way
whether a call comes from a Server Action, a scheduled sweep or the read API.
UI checks only control what is shown and never enforce anything. Middleware
redirects unauthenticated users to `/login` for convenience, and RLS decides
which rows each request can reach.

Conventions:
- **Server Components read and Server Actions write.** There is no client-side
  data fetching and there are no internal API routes. Each action is a thin call
  into the Postgres function that owns the rule.
- `revalidatePath` after each mutation.
- Views are `security_invoker = true`, so RLS still decides which rows they return.
- The list screens and the exports build the same query (`terapkanFilter` in
  [src/lib/laporan.ts](src/lib/laporan.ts)), so an export contains exactly the
  filtered rows on screen.

See [documentation/architecture.md](documentation/architecture.md) for the full picture.

## Repository layout

```
documentation/         the specification: PRD, schema, architecture, design, rules
  data/                source CSVs (countries with coordinates, cooperation agendas)
docs/
  BUILD_LOG.md         what was built, phase by phase, and why
  sim_kerjasama_erd.sql  ERD script (MySQL Workbench) generated from the live schema
  superpowers/specs/   feature design notes
src/
  app/
    (app)/             authenticated app shell (sidebar + topbar) and its pages
    login/             sign-in page
    evaluasi/[token]/  public partner evaluation page (no login)
    api/ekspor/        Excel export download endpoint (session-scoped)
    api/v1/            read API for the Realization System (API-key)
  components/          UI components (Lingkup tree, Likert grid, map, chart studio, …)
  lib/
    actions/           Server Actions: proposal, workflow, renewal, master data, auth
    supabase/          browser, server and service-role clients
    laporan.ts         list filters, sorting, tabs and export
  middleware.ts        session refresh + redirect to /login
supabase/
  migrations/          versioned SQL: schema, functions, RLS, sweeps, views, hardening
  functions/kirim-email/  email dispatch Edge Function
  tests/               SQL assertion tests for the domain functions
  seed.sql             reference data + minimum org structure
```

## Getting started

### Prerequisites

- Node.js 20+ and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker (for the local stack)
- `psql` (for `npm run db:test`)

### Local setup

```bash
npm install
cp .env.example .env.local     # fill in the keys printed by `supabase start`
supabase start                 # local Postgres, Auth and Storage
supabase db reset              # apply all migrations and seed.sql
npm run db:test                # run the domain-function assertions
npm run dev                    # http://localhost:3000
```

### Creating a login

Sign-in uses email and password through Supabase Auth. Accounts are
**role-based**: each one belongs to a position (`jabatan`), not to a person. For
example, the Dean of SBM signs in as `dekan-sbm@petra.ac.id`. The seed creates
the `akun` rows but not the Auth users. To sign in as a seeded account:

1. Create a user with the same email in Supabase Studio (local: <http://localhost:54323>
   → Authentication → Add user).
2. Link that user to the account:

   ```sql
   update akun set auth_user_id = '<auth user uuid>'
   where email = 'staf-kui@petra.ac.id';
   ```

Seeded accounts:

| Email | Position | Role |
|---|---|---|
| `kepala-kui@petra.ac.id` | Head of KUI (tier 1) | `io_admin` |
| `staf-kui@petra.ac.id` | KUI staff | `io_admin` |
| `direktur-kui@petra.ac.id` | Director of KUI | `io_admin` |
| `sekretariat-rektorat@petra.ac.id` | Kepala Bagian Sekretariat Rektorat (tier 1) | `submitter` |
| `dekan-sbm@petra.ac.id` | Dean, School of Business and Management (tier 2) | `submitter` |
| `kaprodi-manajemen@petra.ac.id` | Head of Management study program | `submitter` |
| `warek-akademik@petra.ac.id` | Vice Rector for Academic Affairs (tier 3) | `submitter` |
| `rektor@petra.ac.id` | Rector (tier 3) | `submitter` |
| `viewer@petra.ac.id` | Foundation leadership | `viewer` |

## Environment variables

Copy [.env.example](.env.example) to `.env.local`.

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS; used only by `/api/v1` via [src/lib/supabase/service.ts](src/lib/supabase/service.ts) |
| `DATABASE_URL` | local | Postgres URL for `npm run db:test` (local default: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`) |
| `NEXT_PUBLIC_APP_URL` | public | Public origin used to build partner evaluation links; falls back to the request host |
| `REALIZATION_API_KEY` | **server only** | Shared key for the Realization System read API |

Edge Function secrets (set with `supabase secrets set`, not in `.env.local`):
`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint via `next lint` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:reset` | `supabase db reset`: rebuild the local DB from migrations and seed |
| `npm run db:test` | Run [supabase/tests/domain_functions.sql](supabase/tests/domain_functions.sql) against `$DATABASE_URL` |

## Application routes

The UI is in Bahasa Indonesia.

| Route | Page |
|---|---|
| `/login` | Sign-in |
| `/dashboard` | KPI cards (MoU/MoA domestic vs international, the "< 1 month" completion KPI, SLA overruns), Peta Mitra Global, Studio Grafik |
| `/kerja-sama` | **Cari Kerja Sama**: lifecycle tabs (Aktif, Proposal, Disetujui, Akan Berakhir, Pembaruan, Arsip) with per-column filters and export |
| `/kerja-sama/[id]` | Document detail: tier progress, approver actions, live disposition editing, discussion, activity log |
| `/kerja-sama/[id]/aktivasi` | Activation after offline signing (signatories, signed file, dates) |
| `/kerja-sama/[id]/laporan` | Per-document report |
| `/buat` | **Buat Kerja Sama**: proposal form with the recursive tri-state Lingkup unit tree |
| `/antrean` | **Antrean Saya**: personal approval queue, sorted red, then yellow, then the rest |
| `/pembaruan`, `/pembaruan/[no]` | Renewal requests, faculty evaluation, renewal gate |
| `/notifikasi` | In-app notifications |
| `/master-data` | Units, positions/tiers, partners (incl. merge), countries, agendas, managed lists *(admin)* |
| `/admin` | Settings and thresholds *(admin)* |
| `/evaluasi/[token]` | **Public** partner evaluation page (bilingual, no login) |
| `/api/ekspor/[jenis]` | Excel exports: `aktif`, `sla`, `proses` |
| `/api/v1/kerja-sama…` | Realization read API (see below) |

## Roles & access

Authorization has two axes:

1. **Application role**, stored on `akun.role`: `submitter`, `io_staff`,
   `io_admin` or `viewer`. It decides what an account can do in general.
2. **Approver status**, which is derived and never stored. An account can act on
   a document only while an open `disposisi_target` is routed to the account's
   position (`jabatan`) and that target is `pending_action`. The RLS update
   policy on `disposisi_target` enforces this.

Read access: every authenticated user can read Active documents. IO can read
everything. A submitter can read their own proposals. An approver can read the
documents routed to their position.

The **public surface** is exactly two `anon`-executable functions:
`resolusi_token_evaluasi` and `kirim_evaluasi_partner`. Both require a 256-bit
token and are scoped to a single evaluation.

## Core workflows

### Approval (three tiers)

| Tier | Positions |
|---|---|
| 1 | Head of KUI, Kepala Bagian Sekretariat Rektorat |
| 2 | Dekan, Ka. Prodi, Ka. Program, Ka. UP |
| 3 | Wakil Rektor, Rektor (parallel) |

- **Tier gating means "no blockers below".** A target unlocks when no
  lower-tier target in the current round is still unapproved, so an empty tier
  is skipped instead of blocking. `recompute_tiers` is the single idempotent
  writer of this state.
- **Approve**: the next tier unlocks when this tier is clear.
- **Revision**: a lightweight, in-place request. IO uploads a new draft, which
  overwrites the old one and is logged in `revisi_proposal`. No other target is
  affected and the SLA clock keeps running.
- **Pending**: freezes the document and stops the SLA clock. When IO reactivates
  it, a **new round starts from tier 1**, including tiers that had already
  approved.
- **Reject**: terminal. The document is archived with `alasan_arsip = 'rejected'`.
- **Live editing**: while a document is in disposition, IO can add targets
  (they join the current tier, which then waits for them) or remove pending
  targets. An approved target cannot be removed.

### SLA

SLA is tracked per target, starting when the target unlocks. It counts business
days, excluding weekends, `holidays` and time spent in Pending. The approval
thresholds are yellow at 2 days and red at 4 days. Renewal requests use a
separate calendar-day scale of 30, 60 and 90 days. All thresholds are read from
the `settings` table.

### Lifecycle

`Draft → Disposisi (tier 1–3) → Disetujui → offline signing → Aktif → Akan
Berakhir → archived`. Documents are **never hard-deleted**. Every archival
records a reason: `rejected`, `expired_without_renewal`,
`superseded_by_renewal` or `terminated_early`. Auto Renewed documents have no
end date and the expiry sweep skips them.

### Renewal & evaluation

1. As the end date approaches, the expiry sweep moves the document to *Akan
   Berakhir* and sends reminders: monthly from 6 months out, then weekly for the
   last 2 months.
2. KUI dispositions a **renewal request** to the owning unit's head. This kind
   of disposition shares tables with approval but not logic: it has no tiers
   and no gating.
3. The unit fills the faculty evaluation, and KUI activates the partner link.
   The lead partner fills the partner evaluation at `/evaluasi/[token]`.
4. **Gate**: the renewal proposal can be created only when both evaluations are
   submitted and both recommend continuing. If they disagree, KUI must record an
   override with a reason. The database enforces this in
   `buat_proposal_perpanjangan`.
5. When the renewed document is activated, one transaction links it to its
   predecessor and archives the predecessor as `superseded_by_renewal`.

## Scheduled jobs & email

| Job | Schedule | Does |
|---|---|---|
| `simks-sapu-sla` → `sapu_sla()` | `pg_cron`, 22:00 UTC (05:00 WIB) | Recompute SLA, set flags, queue yellow/red/escalation reminders |
| `simks-sapu-kedaluarsa` → `sapu_kedaluarsa()` | `pg_cron`, 22:15 UTC | Move documents to *Akan Berakhir*, archive expired ones, queue expiry reminders |
| `kirim-email` Edge Function | every 5 minutes (Supabase Cron) | Send pending rows from the `notifikasi` queue via Resend |

Both sweeps are idempotent. A unique index on the notification queue stops
duplicate reminders. Email is sent **after** the transaction commits, so a mail
provider outage can never roll back a workflow transition. If a row has no
address, or no mail provider is configured, it stays `pending`.

## Realization read API

This is a read-only API for the Partnership Realization System. Send the key
from `REALIZATION_API_KEY` in either an `x-api-key` header or an
`Authorization: Bearer <key>` header. The key is compared in constant time.

| Endpoint | Returns |
|---|---|
| `GET /api/v1/kerja-sama?halaman=&per_halaman=&jenis=MoU\|MoA&unit=` | Active agreements only (incl. *Akan Berakhir*), paginated (max 200/page) |
| `GET /api/v1/kerja-sama/{no}` | One agreement, archived ones included |
| `GET /api/v1/kerja-sama/{no}/penerus` | Follows the renewal chain forward to the current Active successor; `perlu_dipindahkan` says whether a reference must be re-pointed |

```bash
curl -H "x-api-key: $REALIZATION_API_KEY" "http://localhost:3000/api/v1/kerja-sama?jenis=MoU"
```

## Database & migrations

- The schema follows the team's `database-sim-ks-2.mwb` model (schema v3),
  ported from MySQL to Postgres. Table and column names are kept in Indonesian.
- Migrations live in [supabase/migrations/](supabase/migrations/) and are named
  `YYYYMMDDHHMMSS_description.sql`. Add new ones in that format and never edit
  one that has already been applied.
- Documentation of the schema: [documentation/schema.md](documentation/schema.md).
  To get an ERD, open [docs/sim_kerjasama_erd.sql](docs/sim_kerjasama_erd.sql) in
  MySQL Workbench and reverse-engineer it.

> **Security note for new migrations.** A new function is executable by
> `PUBLIC`, and therefore by `anon`, unless you revoke it. The earlier
> `alter default privileges` line does not cover functions created later. In the
> same migration that creates a function, run
> `revoke execute … from public` and grant it only to `authenticated`.
> Afterwards, run Supabase's security advisors.

## Testing

[supabase/tests/domain_functions.sql](supabase/tests/domain_functions.sql) runs
assertions against a real Postgres database, covering the highest-risk paths
listed in `documentation/rules.md` §9:

- tier gating when a tier is empty
- pending reset and the new round
- SLA pause netting and business-day arithmetic
- revision isolation
- live edit (add, remove, removing an approved target is refused)
- sweep idempotency
- transaction rollback
- the evaluation gate
- reopening a partner evaluation (supersedes the old one)
- token scope
- the RLS boundary
- the Lingkup cascade
- renewal-chain resolution

```bash
supabase db reset && npm run db:test
```

Before you commit, also run `npm run typecheck` and `npm run build`.

## Deployment

- **Frontend**: Vercel deploys `main` automatically, with a preview deploy for
  each PR. Set the environment variables above in the Vercel project.
- **Database**: `supabase link --project-ref <ref>` and then `supabase db push`.
  Use separate Supabase projects for staging and production.
- **Email**: `supabase functions deploy kirim-email --no-verify-jwt`, set its
  secrets, and schedule it every 5 minutes.
- **Storage**: private buckets only. Files are served through signed URLs after
  an authorization check.
- **Before launch**:
  - Enable leaked-password protection in Supabase Auth.
  - Populate `jabatan.tier_disposisi` for every position.
  - Seed `holidays`.
  - Import the full unit tree.
  - Geocode partner coordinates.
  - Migrate the existing SIMKS agreements.

## Ground rules for contributors

Read [documentation/rules.md](documentation/rules.md) before you change
anything. Rules are numbered (for example `BR-06`) so reviews can cite them. The
short version:

- The **database enforces approval order**. Hiding a button is not enough.
- **Pending freezes the document and resets approval**. **Revision** is
  lightweight, in place and logged. They are not the same thing.
- **Documents are never hard-deleted**. Archiving always records a reason.
- **Never derive behavior from Indonesian text**. Tier comes from
  `jabatan.tier_disposisi`, domestic or international from `negara.is_domestic`,
  and the amendment path from `agenda.is_amendment`.
- **Thresholds come from `settings`**. Do not hard-code them.
- A notification failure **never rolls back** a transition.
- `no_dokumen` is always entered by a person. The system never generates it.
- Nothing ships without its migration, its RLS policies and its tests.

## Documentation

| Document | Covers |
|---|---|
| [partnership-system-master-prd.md](documentation/partnership-system-master-prd.md) | Product requirements: goals, personas, processes, KPIs |
| [architecture.md](documentation/architecture.md) | System architecture, domain functions, RLS model, rollout |
| [schema.md](documentation/schema.md) | Database schema v3 |
| [design.md](documentation/design.md) | UI/UX design and PCU brand application |
| [rules.md](documentation/rules.md) | Numbered development rules and mandatory tests |
| [docs/BUILD_LOG.md](docs/BUILD_LOG.md) | Build history and decisions, phase by phase |
| `SIM-KS UI Design.pdf` | UI mockups |
