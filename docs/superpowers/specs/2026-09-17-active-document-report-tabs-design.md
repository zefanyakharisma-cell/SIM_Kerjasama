# Active-document report tabs

## Problem

The report page reached via the magnifying glass (`/kerja-sama/[id]/laporan`) shows the same four tabs — Detail, Approval, History, Disposisi — for a document regardless of whether it's still a proposal or has become an active Kerja Sama. The attached spec (`Report-Kerja-sama-aktif.txt`) describes a different structure once a document is active: three tabs, View / Log / Pembaruan, with View split into Informasi Mitra / Kerja Sama yang Diusulkan / document preview / Unit Pengusul sections.

## Trigger condition

No new status field. A document is "active" exactly when its `dokumen_kerja_sama` row (`dok` in `laporan/page.tsx`) exists — this is already how the page distinguishes proposal-stage from active documents today (e.g. the header's `StatusPill` and "Status Dokumen" row both already do `dok?.status ?? proposal.status_proposal`).

## Tab swap

In `src/app/(app)/kerja-sama/[id]/laporan/page.tsx`, the `TAB` const becomes conditional on whether `dok` exists:

- **Proposal stage (`!dok`)** — unchanged: `Detail / Approval / History / Disposisi` (Disposisi still IO-only).
- **Active (`dok` exists)** — `View / Log / Pembaruan`.

This is a full swap, not an addition — an active document no longer shows Approval/Disposisi tabs (that workflow is over), and a proposal-stage document never shows Pembaruan (nothing to renew yet).

## View tab

Reuses the current "Detail" tab body verbatim under the new tab key. Its existing sections already match the spec 1:1:
- Informasi Mitra (per partner)
- Kerja Sama yang Diusulkan (including the MoU/MoA-conditional fields, Lingkup Unit)
- Dokumen (PDF preview + download)
- Unit Pengusul

No new queries needed — same data already fetched for `dok`/`proposal`.

## Log tab

Reuses the current "History" tab's `riwayat_approval` query and rendering as-is (same `AKSI_LABEL` pattern), just relabeled. Two events named in the attached spec aren't logged anywhere in the database today, so a small migration adds them:

| Spec event | New `aksi` value | Where it's logged |
|---|---|---|
| "evaluation sent" / "Pembaruan process start" | `evaluasi_dikirim` | `kirim_permintaan_pembaruan` — these are the same action in this codebase: sending the renewal request creates both evaluations and the partner's token in one call. |
| "Pembaruan process done" | `pembaruan_selesai` | Logged wherever the gate resolves: automatically in `terapkan_jawaban_evaluasi` (when, after applying the answer, `status_gerbang_pembaruan` returns `terbuka` or `terminate`), or via the explicit split override in `putuskan_pembaruan`. |

"Document created" (`activated`) and "marks as Archive" (`archived`) are already logged today (`aktivasi_dokumen`, `arsipkan_dokumen`, and the supersede-by-renewal path) — nothing to add for those.

New `AKSI_LABEL` entries are added in `laporan/page.tsx` for `evaluasi_dikirim` and `pembaruan_selesai`, following the existing `"[jabatan], [unit], [action], ..."` sentence pattern.

## Pembaruan tab

A card that links into the existing `/pembaruan/[no]` page (reuse, not a rebuild) — same link that already exists at the bottom of the current Detail/View section ("Kelola pembaruan & evaluasi →"). No inline embedding of the renewal/evaluation UI.

## Out of scope

- The `/pembaruan/*` pages themselves — untouched.
- The activation RPC / `aktivasi_dokumen` — untouched.
- Approval/Disposisi logic — untouched, just no longer shown once a document is active.
- Any change to `status_proposal` or `dokumen_kerja_sama.status` enums.
