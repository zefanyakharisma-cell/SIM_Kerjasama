# Development Rules
## Partnership Document Management System — SIM Kerja Sama (SIM-KS)

| | |
|---|---|
| **Version** | 3.0 — aligned to schema v3.0 (`.mwb`), Vercel/Supabase architecture, and the SIM-KS UI |
| **Audience** | Anyone writing code for SIM-KS — human or AI-assisted |
| **Companion documents** | Master PRD v2.2 · Schema v3.0 · Architecture v3.0 · Design v3.0 |

**How to use this.** The other docs say *what* to build; this says the rules that must hold *however* you build it. When a rule conflicts with convenience, the rule wins. When it conflicts with another doc, stop and raise it. Rules are numbered for review citation ("this violates BR-06"). Table/column names below are the schema v3 (Indonesian) names.

---

## 0. Ground rules for this build
- **G-1** Stack is **Vercel + Supabase (Postgres)**. It is a **fresh build**, not an extension of the live Laravel/MySQL SIMKS. Do not assume existing SIMKS auth, tables, or data are present — they are migrated (Architecture §12).
- **G-2** The schema is `database-sim-ks-2.mwb` **as amended by schema v3** (role-based `akun`, structured `evaluasi`, self-referential `unit`, the added columns/tables). Port MySQL types to Postgres per Architecture §0; keep the Indonesian names.
- **G-3** Tier gating, SLA-with-pause, the Lingkup cascade, and access control live in **Postgres (functions + RLS)**, not only in Next.js. UI checks are presentation, never enforcement.
- **G-4** Nothing ships without its migration, its RLS policies, and the tests named in §9.

---

## 1. Business invariants

- **BR-01 · Approval order is enforced in the database.** A `disposisi_target` may be acted on only when `status='pending_action'`; enforced by `recompute_tiers` + the target's RLS update policy, not by hiding a button.
- **BR-02 · Tier unlocking is "no blockers below," not "previous tier done."** A target unlocks when no lower-`tier` target in the current `round_ke` is un-approved. Never `tier = N-1`. Empty tiers skip. *The single most important line of logic.*
- **BR-03 · Tier recomputation is one idempotent function** (`recompute_tiers`) called after every target status change, every add/remove edit, and on reactivation. No incremental "if last one, unlock next" at call sites.
- **BR-04 · Three tiers.** 1 = Head of IO + Kepala Bagian Sekretariat Rektorat · 2 = Dekan / Ka. Prodi / Ka. Program / Ka. UP · 3 = Wakil Rektor + Rektor (parallel). No "tier 4 = Rektor" anywhere.
- **BR-05 · Reject is terminal.** Archives the document (`alasan_arsip='rejected'`); no resume, no un-reject. Continuing needs a new proposal.
- **BR-06 · Pending freezes and, on reactivation, resets the whole approval.** Choosing Pending freezes the document, opens a `pending_periods` row (stops the SLA clock), and awaits IO. Reactivation **bumps `disposisi.round_ke`**, resets every target to `waiting`, resumes the clock, and re-runs gating from tier 1. Never a per-approver pause.
- **BR-07 · Revision is lightweight, in-place, logged — and is NOT Pending.** Leaves the target `pending_action`, touches no other target, doesn't freeze. The draft file is overwritten (no version history) and a `revisi_proposal` row is written. The requesting approver then approves.
- **BR-08 · SLA excludes frozen time.** Elapsed = business days between unlock and resolution, minus weekends, `holidays`, and any `pending_periods` overlap.
- **BR-09 · Documents are never hard-deleted.** Past Draft, no delete path — not in tooling, not in cascades. Archival is a status.
- **BR-10 · Every archival records `alasan_arsip`** — one of rejected / expired_without_renewal / superseded_by_renewal / terminated_early. No generic archive.
- **BR-11 · Auto Renewed ⇒ no end date.** `sifat_periode_kerjasama='Auto Renewed'` ⇒ `dokumen_kerja_sama.tanggal_berakhir` is NULL; excluded from the expiry sweep.
- **BR-12 · Renewal linkage is atomic.** Link successor via `id_dokumen_sebelumnya`, archive predecessor `superseded_by_renewal`, transfer Implementation Arrangements — one transaction.
- **BR-13 · An Implementation Arrangement always points at an Active document** (survives archival only because renewal transfers the link).
- **BR-14 · Partner merge re-points references** (`partner_pengusul`, `partner_contact`, signatories, `evaluasi`) and sets `id_merged_into` + `is_active=0` — never deletes; one transaction.
- **BR-15 · Tier is read from `jabatan.tier_disposisi`.** If you snapshot it onto `disposisi_target`, it's frozen at send time so later re-tiering doesn't rewrite past routing.
- **BR-16 · Never derive behavior from Indonesian text.** Tier from `jabatan.tier_disposisi`; amendment path from `agenda.is_amendment`; domestic/international from `negara.is_domestic`→`partner.is_international`. `nama LIKE '%Kepala%'` is wrong (Kepala Bagian Sekretariat Rektorat is tier 1, others tier 2); `negara = 'Indonesia'` is wrong.
- **BR-17 · SLA is per target (per position), never per tier.** One slow approver flags only that approver.
- **BR-18 · Approval SLA clock starts at target unlock**, never at submission; a tier-3 approver isn't charged for tiers 1–2.
- **BR-19 · Business days require `holidays`.** An empty table must warn loudly, never silently count calendar days.
- **BR-20 · Sweeps are idempotent.** SLA / expiry / duplicate-scan re-run safely; guard with reminder timestamps, status checks, advisory-only output.
- **BR-21 · Notification failure never rolls back a transition.** Dispatch after commit.
- **BR-22 · `no_dokumen` is entered, never generated.** No auto-numbering, suggestion, or format validation.
- **BR-23 · `managed_options` values are deactivated or merged, never deleted while referenced.**

---

## 2. Two kinds of disposition

- **BR-24 · `disposisi.jenis_disposisi` is `approval` or `renewal_request`; they share tables but not logic.** A `renewal_request` has no tier, never enters `recompute_tiers`, never gates. Every read of `disposisi`/`disposisi_target` branches on `jenis_disposisi` first.
- **BR-25 · A renewal request targets the owning unit's head `jabatan`** (targets stay `jabatan`-based). It completes when a unit account uploads the renewal draft — not by approve/reject/pending.

---

## 3. Renewal & evaluation

- **BR-26 · The gate: both evaluations submitted AND both `rekomendasi='continue'`** before the Perpanjangan proposal can be created. Hard, server-side. A missing evaluation or a single "terminate" cannot be bypassed.
- **BR-27 · A split decision needs a recorded, reasoned override** (IO/Head chooses continue/terminate with a required reason; audited). No silent auto-resolution.
- **BR-28 · `evaluasi` is structured, never a single text blob.** The Likert columns back the gap analytics (G8); no file-upload path for the form.
- **BR-29 · One partner evaluation, for the lead partner** (`partner_pengusul.is_lead`) on a multi-partner renewal.
- **BR-30 · The partner token is the credential; valid until submitted; reopen supersedes, never edits.** Reopen marks the old `evaluasi` `superseded`, creates a new `pending` one (`id_supersedes`), issues a fresh token. Token resolved server-side, never in logs/URLs, no partner PII in the URL.
- **BR-31 · `form_revision` is frozen per submission**; a later form change never migrates old evaluations.
- **BR-32 · Renewal-request SLA is 30/60/90 days** from `settings`, never the 2/4 business-day approval scale.

---

## 4. Live disposition editing

- **BR-33 · Editing only while in-disposition** (`status_proposal` is a `Disposisi - Tier N` / `Diproses` state). Once `Disetujui` and in signing, the target list is frozen.
- **BR-34 · Add targets the current tier and makes it wait** — new `disposisi_target` in the current round, `pending_action`; the tier now waits for it before advancing.
- **BR-35 · Removing a pending target re-runs gating; removing the last blocker advances.** Add and remove both call `recompute_tiers`.
- **BR-36 · An already-approved target cannot be removed** — its approval stands in `riwayat_approval`.

---

## 5. Lingkup Kerja Sama (unit cascade)

- **BR-37 · The cascade is recursive over `unit.id_parent_unit`, not fixed-depth.** Faculty → Prodi → Program and deeper.
- **BR-38 · Store the selected set in `proposal_dokumen_unit`; derive the indeterminate state.** A parent is indeterminate when some-but-not-all descendants are selected — computed at read time, never stored.
- **BR-39 · The `unit` tree must be imported and valid before the cascade ships.**

---

## 6. Authorization (RLS)

- **AR-01 · "Approver" is derived, never stored** — an open `disposisi_target` matching the account's `id_jabatan`. No `approver` role on `akun`.
- **AR-02 · Every action authorized in RLS**, server-side. Client hiding is presentation only.
- **AR-03 · Scope queries, don't just hide links** — a faculty account must not reach another unit's in-progress document by URL.
- **AR-04 · Active documents readable by all authenticated users, files included** — a deliberate IO decision; do not faculty-scope the Active list.
- **AR-05 · In-progress documents restricted** to IO and accounts with a target on that document.
- **AR-06 · File access via signed URLs behind an auth check** — never public/guessable paths.
- **AR-07 · The partner token endpoint is unauthenticated but scoped to one `evaluasi`** via an Edge Function; reaches no document internals, no lists; rate-limited.
- **AR-08 · Any account of the owning unit may act on that unit's renewal** (fill the faculty evaluation, upload the draft) — scoped by the account's unit within the `unit` subtree; the renewal target is still the head `jabatan`.

---

## 7. Data handling

- **DR-01 · Use `partner_pengusul` even for one partner** — no shortcut partner column on the proposal.
- **DR-02 · `riwayat_approval` and `revisi_proposal` are append-only** (insert/select RLS only).
- **DR-03 · Frozen denormalized values** — resolved SLA durations and `form_revision` are written once, never recomputed.
- **DR-04 · Thresholds come from `settings`** — no magic 2/4/6/30/60/90 in code.
- **DR-05 · Capture all KPI timestamps** — `waktu_proposal_dokumen`, `waktu_disetujui`, `waktu_aktif`; the "< 1 bulan" KPI reads submission→`waktu_disetujui` (excludes signing).
- **DR-06 · Accounts are role-based (`akun` → `jabatan`)** — no person table. PETRA signatories are captured as `nama`/`jabatan` text on `penandatangan_petra`.
- **DR-07 · Domestic/international is a boolean** (`negara.is_domestic` → `partner.is_international`), never a country-name comparison.
- **DR-08 · Reopen creates rows, never mutates** — new `evaluasi` (`id_supersedes`) + new `partner_eval_token`; analytics read the latest non-superseded row.
- **DR-09 · The Lingkup selection is a set of `unit` ids**; tri-state parent status is derived, not stored.

---

## 8. Engineering conventions

- **EC-01 · Domain logic lives in Postgres functions or Server Actions, not in components.** Gating/SLA/lifecycle are callable from actions, sweeps, and the future API.
- **EC-02 · Branch on `jenis_disposisi` at the boundary** — separate handlers for approval vs renewal_request, not `if kind` threaded through shared code.
- **EC-03 · One transaction per multi-step op** — reactivation, renewal linkage, partner merge, evaluation reopen.
- **EC-04 · Server Components read; Server Actions write.** No client-side fetching, no internal API routes.
- **EC-05 · RLS is the access model, not a duplicate of it** — don't re-check the same rules in app code where they can drift.
- **EC-06 · No silent catch blocks** in a transition — log, surface, or propagate.
- **EC-07 · Prefer explicit state over inference** — store the current tier's targets/round; don't infer document state by counting rows at read time; don't infer tier from names.
- **EC-08 · Migrations are versioned and reversible**; every migration has a working down.
- **EC-09 · Keep the Indonesian schema names** — code that mixes `disposisi` and `disposition` for the same thing rots fast.
- **EC-10 · Follow PCU brand tokens** (PRD §16) for all UI — Inter, Midnight palette, unmodified logo; the partner page carries the full wordmark.

---

## 9. Mandatory tests (no feature ships without the relevant ones)
1. Tier gating with a gap (tiers 1 & 3 populated, 2 empty → skips, no deadlock).
2. Pending reset — reactivation bumps `round_ke` and clears all targets; nothing survives the reset.
3. SLA pause/resume — frozen-then-reactivated document accrues no SLA while frozen.
4. Revision vs Pending — revision leaves siblings untouched and doesn't freeze; pending freezes and resets.
5. Live edit — add→current tier waits; remove last blocker→unlocks; remove approved→refused; only in-disposition.
6. Business-day arithmetic — holidays adjacent to weekends, Friday starts, multi-day closures.
7. Sweep idempotency — SLA/expiry twice in a day, no double-send/double-archive.
8. Transaction rollback — mid-failure on reactivation, renewal linkage, partner merge → full rollback.
9. Evaluation gate — proposal refused unless both submitted + both continue; each split flags and waits for a reasoned override.
10. Reopen preserves history — a reopened partner evaluation supersedes without editing the prior row; gate reads the latest.
11. Token scope — a valid token reaches only its one `evaluasi`; a submitted token is inert until reopened; no document internals.
12. Lingkup cascade — Faculty selects all descendants recursively; unchecking one child → parent indeterminate.
13. RLS boundary — a submitter can't reach another unit's in-progress document by URL.

Tier gating and business-day-with-pause must be unit-testable directly against Postgres (if they need an HTTP cycle, EC-01 was violated).

---

## 10. What NOT to build

| Do not build | Why |
|---|---|
| Digital / e-signature | Signing is offline; the system records outcomes |
| Automatic `no_dokumen` generation | BR-22 |
| File version history | In-place replacement + `revisi_proposal` (BR-07) |
| A partner login/account | Scoped token only (AR-07) |
| A file-upload path for the evaluation | Structured `evaluasi` (BR-28) |
| Tier logic on renewal requests | Tasks, not gates (BR-24) |
| An un-reject / reopen-document path | BR-05 — the soft paths are Pending / Revision |
| A per-approver "pending" that doesn't reset | BR-06 |
| A global archive on/off toggle | Status is a per-view filter / tab |
| A free-form chat "Discussion" | The Discussion tab is a **revision-requests view**, not a chat |
| Automatic partner merging | Detection advisory; decision manual (BR-14) |
| Automatic disposition routing | IO selects targets manually |
| A stored `approver` role, or a `pegawai` person table | AR-01 / DR-06 |
| Behavior derived from Indonesian names or the country string | BR-16 |
| A second source of truth for a partner on a document | DR-01 |

---

## 11. Escalate, don't guess (open items)

| # | Question |
|---|---|
| O2 | Whether there's a true cutover moment or the new behavior begins on migrated data |
| O3 | Final brand values with MRD (2026 draft) |
| O4 | Partner coordinates source for Peta Mitra Global (geocode vs manual) |
| O5 | Whether `jaringan_bisnis`/`jenis_bisnis` need queryable columns on `partner` |

---

## 12. Pre-merge checklist (workflow / SLA / renewal / evaluation changes)
- [ ] Enforced in Postgres/RLS, not only the UI (BR-01, AR-02)
- [ ] Tier logic is "no blockers below," three tiers, current `round_ke` (BR-02, BR-04)
- [ ] Pending freezes + bumps round + resets on reactivation; Revision is light and in-place (BR-06, BR-07)
- [ ] SLA nets out `pending_periods` (BR-08)
- [ ] Reads branch on `jenis_disposisi`; renewal requests never hit gating (BR-24)
- [ ] Gate blocks until both evaluations submitted + both continue; splits need a reasoned override (BR-26, BR-27)
- [ ] `evaluasi` structured, no file path; reopen supersedes not edits (BR-28, BR-30, DR-08)
- [ ] Live edit rules hold; in-disposition only (BR-33–36)
- [ ] Lingkup cascade recursive; indeterminate derived not stored (BR-37, BR-38)
- [ ] No behavior from Indonesian text / country string; flags used (BR-16, DR-07)
- [ ] Multi-step ops in one transaction (EC-03); notify after commit (BR-21)
- [ ] Thresholds from `settings` (DR-04); append-only logs stay append-only (DR-02)
- [ ] Brand tokens applied (EC-10); relevant §9 tests present
