# SIM Kerja Sama (SIM-KS)

Partnership Document Management System for the **Kantor Kerja Sama dan Urusan
Internasional (KUI)**, Petra Christian University.

SIM-KS covers the whole life of PCU's partnership documents (MoU/MoA): proposing
them, approving them, signing and activating them, measuring them, and renewing
or archiving them. It is the authoritative dataset behind the PCU
Internasionalisasi KPI Dashboard, and the Partnership Realization System reads
from it.

---

## Contents

- [Features](#features)
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
- [Excel exports](#excel-exports)
- [Realization read API](#realization-read-api)
- [Database & migrations](#database--migrations)
- [Testing](#testing)
- [Deployment](#deployment)
- [Ground rules for contributors](#ground-rules-for-contributors)
- [Documentation](#documentation)

---

## Features

### Proposal (Buat Kerja Sama)

- **Two ways in.** *Ajukan* starts a new proposal that goes through approval.
  *Catat langsung* (Pencatatan Langsung, `/catat`) lets KUI record a document
  that was already signed before or outside the system, with no approval chain.
  It keeps the real signing date so turnaround KPIs stay honest.
- **Structured form** in sections: Jenis (MoU/MoA), Periode (years + months) and
  Sifat Periode (fixed or Auto Renewed), Tujuan, Manfaat Mitra, Manfaat Petra,
  Bidang, Agenda, Ringkasan Kegiatan or Hak & Kewajiban (depending on Jenis),
  and the **17 UN SDGs** the agreement serves.
- **Calon Mitra.** Any number of partners, all equal (there is no "Mitra Utama").
  Picking an existing partner shows its country, type, address and contacts
  inline. Picking an existing Kontak Mitra previews its position, email and
  phone. New partners and contacts can be created in place.
- **Jabatan Pengusul picker** shows the chosen position's unit and approval
  tier. Any account can add a new position (name + unit) without leaving the
  form. Only Admin can edit an existing one.
- **Lingkup unit tree.** A recursive tri-state tree (university → faculty →
  program/unit) with cascade selection.
- **Draft vs. Ajukan.** A draft can be saved incomplete. Submitting refuses any
  missing required field with a per-field message. Required fields are marked
  `(*)`.
- **Document upload** to private Supabase Storage, served through signed URLs.

### Approval (Disposisi)

- **Three-tier disposition** enforced by the database, with Tier 3 (Wakil
  Rektor, Rektor) in parallel. An empty tier is skipped instead of blocking.
- **Four approver actions**: approve, reject, request a revision, set Pending.
  Each carries an optional message.
- **Revision loop.** Any approver can request a revision. Only Admin (KUI)
  uploads the fix, which overwrites the draft in place and is logged.
- **Pending** freezes the document and pauses the clock. Reactivation starts a
  new round from Tier 1.
- **Live disposition editing.** While approval is in progress, Admin can add
  approvers (they join the current tier) or remove pending ones. Approved
  targets cannot be removed.
- **Siap TTD.** After full approval, Admin marks the document *Siap TTD* once it
  is printed and in the signing process. Only then can it be activated.
- **Activation** records the signatories on both sides, the signed PDF, dates,
  the KUI folder and the LAPORKERMA filing number.

### Batas Waktu (SLA)

- Per-approver clock in **business days**, excluding weekends, `holidays` and
  time spent Pending. Yellow at 2 days and red at 4 days by default.
- Renewal requests use a calendar-day scale (30 / 60 / 90 days).
- Every threshold is configurable under **Pengaturan**.
- On screen it is called **Batas Waktu**. The internal names (`status_sla`,
  `batas_waktu_sla`) are unchanged.

### Antrean Saya (personal queue)

- Every task waiting on the signed-in account in one list: approvals,
  revisions to upload, activations, renewal requests and evaluations. It is
  sorted red first, then yellow, then the rest, and shows the document or
  proposal number on each row.
- A **personal activity summary**: a donut of pending tasks by type, a
  red/yellow/normal Batas Waktu breakdown, and the account's own approval
  completion rate.

### Cari Kerja Sama (search & lists)

- Lifecycle tabs: **Proposal Kerja Sama**, **Kerja Sama Aktif**, **Disetujui**
  (includes Siap TTD), **Akan Berakhir**, **Pembaruan**, **Arsip**.
- Filters on every tab: Jenis, Status, Sifat Periode (to isolate Auto Renewed
  documents), No. Dokumen, Mitra, Negara, Agenda, Unit Pengusul, Pengusul,
  Lingkup and date ranges. Sortable columns and server-side pagination.
- Colour-coded action icons (view in blue, edit in green).
- **Four template-based Excel downloads** (see [Excel exports](#excel-exports)).

### Document report (`/kerja-sama/[id]/laporan`)

Tabs: **Detail**, **Approval** (tier progress per round), **History**,
**Implementasi**, **Disposisi** and **Pembaruan** (shown once renewal is
relevant).

- **Implementasi** lists the agreement's Implementation Arrangements: periode
  (Ganjil/Genap YYYY/YYYY), activity name and type, executing unit, participant
  count, and the Implementation Report file. The Realization System writes this
  data and SIM-KS reads it.

### Renewal & evaluation (Pembaruan)

- **Expiry reminders** start 6 months before the end date: monthly, then weekly
  for the last 2 months.
- **Disposisi Evaluasi.** Admin sends the renewal request either
  *automatically* to the head of the proposing unit, or to **manually chosen
  positions** from a searchable list. This works from the Akan Berakhir list and
  from the Pembaruan tab.
- **Faculty evaluation**: a structured Likert form filled by the unit.
- **Partner evaluation**: Admin activates a no-login, bilingual link
  (`/evaluasi/[token]`) for the partner. If a submission is refused, the answers
  the partner typed are kept and shown again.
- **Renewal gate.** When both evaluations recommend continuing, the document
  becomes *Siap Memulai Pembaruan*. Admin then clicks **Mulai Proses
  Pembaruan**, which sends the signed PDF and final draft to the unit and opens
  the upload. If the two evaluations disagree, Admin must record an override
  with a reason.
- **Renewal chain.** Activating the successor archives the predecessor as
  `superseded_by_renewal` in the same transaction, and the chain can be followed
  forward through the API.

### Dashboard

- Tabs: **Dashboard**, **Activity Log**, **Discussion** and, for Admin only,
  **In Process**.
- **KPI cards**: MoU/MoA domestic vs. international, active agreements,
  international partners, the "< 1 month" completion KPI, and Batas Waktu
  overruns.
- **Peta Mitra Global**: a Leaflet world map of partners per country.
- **Studio Grafik**: a configurable ECharts builder. Each account has its own
  saved charts, grouped by unit level, UA/UP, status, dates and more.
- **Rekap Evaluasi Kerja Sama** (Admin only).
- **Activity Log**: every action with document, from, to, filters by
  document/partner, action and date range.
- **In Process** (Admin only): every not-yet-active document grouped by stage
  from Diajukan to Siap TTD, as cards showing the worst open Batas Waktu flag.
- **Bottleneck analysis** (`/dashboard/bottleneck`, Admin only, linked from the
  *Melewati Batas Waktu* card):
  - a time-in-status funnel (average and median days per stage)
  - a per-position leaderboard of overdue approvals
  - a per-unit breakdown of how long in-flight documents have waited
  - a month-over-month Batas Waktu trend

### Notifications

- In-app notifications plus email through Resend. Notifications cover new
  dispositions, revisions, reminders, escalations, expiry and renewal events.
- A **floating notification bell** you can drag anywhere. It snaps to the
  nearest side, remembers its position, and opens the inbox as a popup. It
  works with the keyboard (Enter/Space). `/notifikasi` is still available as a
  full page.

### Master Data & Pengaturan (Admin)

- **Master Data**: full create / edit / (de)activate / delete for Mitra (with
  partner merge), Jabatan (including the *kepala unit* flag), Pegawai, Unit,
  Negara (with coordinates), Jenis Mitra, Bidang, Agenda, Tujuan, Manfaat Mitra
  and Manfaat Petra.
- **Pengaturan**: Jabatan & approval tier, and *Ambang & Cadence* (Batas Waktu
  thresholds and the expiry-reminder rhythm). The `holidays` table is filled in
  the database.

### Platform

- Row-Level Security on every table. Business rules live in Postgres functions.
- Append-only audit trail, and documents are never hard-deleted.
- A read-only, API-key protected **Realization API**.
- A responsive layout with a sticky sidebar or top bar and a collapsible drawer.
  The UI is in Bahasa Indonesia and follows PCU brand colours.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router, typed routes), React 18, TypeScript, Tailwind CSS 3 |
| Backend | Supabase: Postgres 17, Auth, Storage, Row-Level Security, Edge Functions, `pg_cron` |
| Domain logic | Postgres functions (tier gating, business-day SLA with pause, unit cascade, renewal gate) |
| Charts / map | ECharts (Studio Grafik, Antrean summary, bottleneck), Leaflet (Peta Mitra Global) |
| Exports | ExcelJS (`.xlsx`, template layouts) |
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
- **Server Components read and Server Actions write.** There are no internal
  API routes for the app itself. Each action is a thin call into the Postgres
  function that owns the rule.
- A refused transition is never swallowed. Actions return `{ ok: false, pesan }`
  with the database's own message, and the page shows it.
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
  sim_kerjasama_erd.sql    ERD script (MySQL Workbench)
  sim_kerjasama_mysql.sql  MySQL translation of the live schema (42 tables, 65 FKs)
  superpowers/specs/   feature design notes
src/
  app/
    (app)/             authenticated app shell (sidebar + topbar) and its pages
    login/             sign-in page
    evaluasi/[token]/  public partner evaluation page (no login)
    api/ekspor/        Excel export download endpoint (session-scoped)
    api/v1/            read API for the Realization System (API key)
  components/          UI components (Lingkup tree, Likert grid, map, chart studio,
                       pickers, notification bell, queue summary, …)
  lib/
    actions/           Server Actions: proposal, pencatatan, workflow, pembaruan,
                       jabatan, master data, notifikasi, auth
    supabase/          browser, server and service-role clients
    laporan.ts         list tabs, filters, sorting and paging
    ekspor-template.ts template-based Excel workbooks
    notifikasi.ts      notification titles, colours and links (bell + page)
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
**position-based**: each one belongs to a position (`jabatan`), not to a person.
For example, the Dean of SBM signs in as `dekan-sbm@petra.ac.id`, and a change
of office-holder needs no data change. The seed creates the `akun` rows but not
the Auth users. To sign in as a seeded account:

1. Create a user with the same email in Supabase Studio (local: <http://localhost:54323>
   → Authentication → Add user).
2. Link that user to the account:

   ```sql
   update akun set auth_user_id = '<auth user uuid>'
   where email = 'staf-kui@petra.ac.id';
   ```

Seeded accounts:

| Email | Position | Tier | Role |
|---|---|---|---|
| `kepala-kui@petra.ac.id` | Head of KUI | 1 | `admin` |
| `staf-kui@petra.ac.id` | KUI staff | – | `admin` |
| `direktur-kui@petra.ac.id` | Director of KUI | – | `admin` |
| `sekretariat-rektorat@petra.ac.id` | Kepala Bagian Sekretariat Rektorat | 1 | `approver` |
| `dekan-sbm@petra.ac.id` | Dean, School of Business and Management | 2 | `user` |
| `kaprodi-manajemen@petra.ac.id` | Head of Management study program | – | `user_staff` |
| `warek-akademik@petra.ac.id` | Vice Rector for Academic Affairs | 3 | `approver` |
| `rektor@petra.ac.id` | Rector | 3 | `approver` |
| `viewer@petra.ac.id` | Foundation leadership | – | `user_staff` |

## Environment variables

Copy [.env.example](.env.example) to `.env.local`.

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS. Used only by `/api/v1` via [src/lib/supabase/service.ts](src/lib/supabase/service.ts) |
| `DATABASE_URL` | local | Postgres URL for `npm run db:test` (local default: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`) |
| `NEXT_PUBLIC_APP_URL` | public | Public origin used to build partner evaluation links. Falls back to the request host |
| `REALIZATION_API_KEY` | **server only** | Shared key for the Realization System read API |

Edge Function secrets (set with `supabase secrets set`, not in `.env.local`):
`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (`eslint .`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:reset` | `supabase db reset`: rebuild the local DB from migrations and seed |
| `npm run db:test` | Run [supabase/tests/domain_functions.sql](supabase/tests/domain_functions.sql) against `$DATABASE_URL` |

## Application routes

The UI is in Bahasa Indonesia. Sidebar order: Dashboard, Antrean Saya, Cari
Kerja Sama, Buat Kerja Sama, Master Data, Pengaturan.

| Route | Page | Who |
|---|---|---|
| `/login` | Sign-in | everyone |
| `/dashboard` | Dashboard, Activity Log, Discussion, In Process tabs | all (In Process: admin) |
| `/dashboard/bottleneck` | Bottleneck analysis | admin |
| `/antrean` | **Antrean Saya**: personal queue + activity summary | all |
| `/kerja-sama` | **Cari Kerja Sama**: lifecycle tabs, filters, exports | all |
| `/kerja-sama/[id]` | Document detail: tier progress, approver actions, live disposition editing, discussion, activity | per RLS |
| `/kerja-sama/[id]/laporan` | Document report: Detail, Approval, History, Implementasi, Disposisi, Pembaruan | per RLS |
| `/kerja-sama/[id]/aktivasi` | Activation after offline signing (requires Siap TTD) | admin |
| `/buat` | **Buat Kerja Sama**: proposal form | all except approver |
| `/catat` | **Pencatatan Langsung**: record an already-signed document | admin |
| `/pembaruan`, `/pembaruan/[no]` | Renewal requests, faculty evaluation, renewal gate | per routing |
| `/notifikasi` | Full notification inbox (also a popup from the bell) | all |
| `/master-data` | Master Data CRUD | admin |
| `/admin` | **Pengaturan**: tiers, thresholds, cadence | admin |
| `/evaluasi/[token]` | **Public** partner evaluation page (bilingual, no login) | token holder |
| `/api/ekspor/[jenis]` | Excel downloads (see below) | signed-in |
| `/api/v1/kerja-sama…` | Realization read API (see below) | API key |

## Roles & access

Authorization has two independent axes.

**1. Application role**, stored on `akun.role`, decides what an account can do
in general:

| Role | Who | Can |
|---|---|---|
| `admin` | KUI (Kantor Kerja Sama) | Everything: Master Data, Pengaturan, live disposition editing, revision uploads, Siap TTD, activation, Pencatatan Langsung, renewal start, In Process and bottleneck views, evaluation recap |
| `user` | Unit heads (Dekan, Kepala Unit Pendukung; `jabatan.kepala_unit`) | Create proposals, receive Disposisi Evaluasi, approve when routed |
| `user_staff` | Everyone else | Create proposals, approve when routed |
| `approver` | Rektorat | Approve only, never authors a document |

`current_akun_is_io()` means "is admin" and `current_akun_dapat_buat()` means
"is not approver". Both are used by RLS and by the app.

**2. Approver status** is derived and never stored. An account can act on a
document only while an open `disposisi_target` is routed to its position and
that target is `pending_action`. The RLS update policy on `disposisi_target`
enforces this.

Read access: every authenticated user can read Active documents. Admin can read
everything. A proposer can read their own proposals. An approver can read the
documents routed to their position.

The **public surface** is exactly two `anon`-executable functions:
`resolusi_token_evaluasi` and `kirim_evaluasi_partner`. Both require a 256-bit
token and are scoped to a single evaluation.

## Core workflows

### Lifecycle

```
Draft → Diajukan → Disposisi Tier 1 → Tier 2 → Tier 3 → Disetujui → Siap TTD
      → (offline signing) → Aktif → Akan Berakhir → Pembaruan / Diarsipkan
```

Proposal statuses: `Draft`, `Diajukan`, `Diproses`, `Disposisi - Tier 1/2/3`,
`Pending`, `Disetujui`, `Siap TTD`, `Ditolak`.

Documents are **never hard-deleted**. Every archival records a reason:
`rejected`, `expired_without_renewal`, `superseded_by_renewal` or
`terminated_early`. Auto Renewed documents have no end date and the expiry sweep
skips them.

A document entered through **Pencatatan Langsung** skips the approval chain. It
is stored as `Disetujui` with a flag on `proposal_dokumen`, and its document row
exists from the start, so it appears straight away in Kerja Sama Aktif.

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
- **Revision**: a lightweight, in-place request. Admin uploads a new draft,
  which overwrites the old one and is logged in `revisi_proposal`. No other
  target is affected and the clock keeps running.
- **Pending**: freezes the document and stops the clock. When Admin reactivates
  it, a **new round starts from Tier 1**, including tiers that had already
  approved.
- **Reject**: terminal. The document is archived with `alasan_arsip = 'rejected'`.
- **Live editing**: Admin can add targets (they join the current tier, which
  then waits for them) or remove pending ones. An approved target cannot be
  removed.
- **Siap TTD → Aktif**: Admin marks the approved document Siap TTD, then
  activates it with the signed file, signatories and dates.

### Batas Waktu (SLA)

Tracked per target, starting when the target unlocks. It counts business days,
excluding weekends, `holidays` and time spent Pending. Approval thresholds are
yellow at 2 days and red at 4 days. Renewal requests use a separate
calendar-day scale of 30, 60 and 90 days. All thresholds are read from the
`settings` table. Status changes are recorded in `proposal_status_history`,
which feeds the bottleneck funnel.

### Renewal & evaluation

1. As the end date approaches, the expiry sweep moves the document to *Akan
   Berakhir* and sends reminders: monthly from 6 months out, then weekly for the
   last 2 months.
2. Admin sends a **Disposisi Evaluasi**, either automatically to the head of the
   proposing unit or to positions picked by hand. This kind of disposition
   shares tables with approval but not logic: it has no tiers and no gating.
3. The unit fills the faculty evaluation. Admin activates the partner link, and
   a partner contact fills the partner evaluation at `/evaluasi/[token]`.
4. **Gate**: when both evaluations are submitted and both recommend continuing,
   the document is *Siap Memulai Pembaruan*. If they disagree, Admin must
   record an override with a reason.
5. Admin clicks **Mulai Proses Pembaruan**. The unit receives the signed PDF and
   the final draft, and only then can it upload the renewal proposal
   (`buat_proposal_perpanjangan` enforces this). The successor copies the
   predecessor's partners, scope, SDGs and other child data.
6. When the renewed document is activated, one transaction links it to its
   predecessor and archives the predecessor as `superseded_by_renewal`.

## Scheduled jobs & email

| Job | Schedule | Does |
|---|---|---|
| `simks-sapu-sla` → `sapu_sla()` | `pg_cron`, 22:00 UTC (05:00 WIB) | Recompute Batas Waktu, set flags, queue yellow/red/escalation reminders |
| `simks-sapu-kedaluarsa` → `sapu_kedaluarsa()` | `pg_cron`, 22:15 UTC | Move documents to *Akan Berakhir*, archive expired ones, queue expiry reminders |
| `kirim-email` Edge Function | every 5 minutes (Supabase Cron) | Send pending rows from the `notifikasi` queue via Resend |

Both sweeps are idempotent. A unique index on the notification queue stops
duplicate reminders. Email is sent **after** the transaction commits, so a mail
provider outage can never roll back a workflow transition. If a row has no
address, or no mail provider is configured, it stays `pending`.

## Excel exports

Cari Kerja Sama offers four downloads from `/api/ekspor/[jenis]`, all built
with ExcelJS and all honouring the filters on screen:

| `jenis` | Name | Content |
|---|---|---|
| `laporan-aktif` | Laporan Kerja Sama Aktif | `Table_Database_Kerjasama` layout: merged multi-row header, Jenis Mitra (Luar/Dalam Negeri), Bidang and faculty/prodi/unit checklist columns built from master data |
| `laporan-proses` | Laporan Proses Kerja Sama | `Table_Database_SLA` layout: one row per submitted proposal with disposition, per-tier approval and activation dates, total processing time in business days |
| `data-aktif` | Data Kerja Sama Aktif | Every raw field of the active documents |
| `data-sla` | Data SLA | Raw approval record, one row per approver per round |

They read the views `v_laporan_dokumen`, `v_proses_dokumen` and `v_sla_dokumen`.

## Realization read API

This is a read-only API for the Partnership Realization System. Send the key
from `REALIZATION_API_KEY` in either an `x-api-key` header or an
`Authorization: Bearer <key>` header. The key is compared in constant time.

| Endpoint | Returns |
|---|---|
| `GET /api/v1/kerja-sama?halaman=&per_halaman=&jenis=MoU\|MoA&unit=` | Active agreements only (incl. *Akan Berakhir*), paginated (max 200/page) |
| `GET /api/v1/kerja-sama/{no}` | One agreement, archived ones included |
| `GET /api/v1/kerja-sama/{no}/penerus` | Follows the renewal chain forward to the current Active successor. `perlu_dipindahkan` says whether a reference must be re-pointed |

```bash
curl -H "x-api-key: $REALIZATION_API_KEY" "http://localhost:3000/api/v1/kerja-sama?jenis=MoU"
```

## Database & migrations

- The schema follows the team's `database-SIMKS.mwb` model (schema v3), ported
  from MySQL to Postgres. Table and column names are kept in Indonesian.
- Migrations live in [supabase/migrations/](supabase/migrations/) and are named
  `YYYYMMDDHHMMSS_description.sql`. Add new ones in that format and never edit
  one that has already been applied.
- Schema documentation: [documentation/schema.md](documentation/schema.md).
- ERD: open [docs/sim_kerjasama_erd.sql](docs/sim_kerjasama_erd.sql) or
  [docs/sim_kerjasama_mysql.sql](docs/sim_kerjasama_mysql.sql) in MySQL Workbench
  and reverse-engineer it. The MySQL file was generated from the live catalog.
  RLS, the Postgres functions and ten views that rely on Postgres-only features
  have no MySQL equivalent and are left out, as the file header explains.
- The UN SDG list is seeded inside its migration, not `seed.sql`, because
  production applies migrations with `db push`, which never runs the seed.

> **Security note for new migrations.** A new function is executable by
> `PUBLIC`, and therefore by `anon`, unless you revoke it. The earlier
> `alter default privileges` line does not cover functions created later. In the
> same migration that creates a function, run
> `revoke execute … from public` and grant it only to `authenticated`.
> Afterwards, run Supabase's security advisors.

> **Changing a function signature.** `create or replace` cannot change an
> argument list. Drop and recreate the function, or the old overload stays
> behind and calls become ambiguous.

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

Before you commit, also run `npm run lint`, `npm run typecheck` and
`npm run build`.

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
  - Populate `jabatan.tier_disposisi` and `jabatan.kepala_unit` for every position.
  - Assign each account its role (`admin`, `user`, `user_staff`, `approver`).
  - Seed `holidays`.
  - Import the full unit tree.
  - Geocode partner coordinates.
  - Migrate the existing SIMKS agreements (Pencatatan Langsung can take them one
    by one).

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
- A refused transition is **never swallowed**. Show the database's message.
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
| [docs/superpowers/specs/](docs/superpowers/specs/) | Feature design notes |
| `SIM-KS UI Design.pdf` | UI mockups |
