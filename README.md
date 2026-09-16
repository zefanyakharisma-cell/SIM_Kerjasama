# SIM Kerja Sama (SIM-KS)

Partnership Document Management System for the International Office (KUI),
Petra Christian University.

The system creates, approves, measures and renews PCU's partnership documents
(MoU/MoA) and is the authoritative dataset behind the PCU Internasionalisasi KPI
Dashboard and the future Partnership Realization System.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) on Vercel |
| Backend | Supabase — Postgres, Auth, Storage, RLS, Edge/Scheduled Functions |
| Domain logic | Postgres functions (tier gating, SLA with pause, unit cascade) |

Access control is Row-Level Security; the two rules most likely to be built
wrong — **tier gating** and **business-day SLA with pause** — live in Postgres
where no route can bypass them.

## Layout

```
documentation/       the specification (PRD, schema, architecture, design, rules)
supabase/migrations/ versioned SQL — schema, functions, RLS, seed
supabase/tests/      SQL assertion tests for the domain functions
src/                 Next.js app
docs/BUILD_LOG.md    what was built, step by step
```

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in Supabase keys
supabase start                 # local Postgres + Auth
supabase db reset              # apply migrations + seed
npm run db:test                # domain-function assertions
npm run dev
```

## Ground rules

Read `documentation/rules.md` before changing anything. The short version:
approval order is enforced in the database, Pending freezes and resets, revision
is lightweight and in-place, documents are never hard-deleted, nothing derives
behavior from Indonesian text, and thresholds come from `settings`.
