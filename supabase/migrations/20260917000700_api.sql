-- Phase 4 — the read surface for the Partnership Realization System
-- (PRD §15, Architecture §3).
--
-- The downstream contract is one sentence: an Implementation Arrangement
-- references exactly one ACTIVE MoU/MoA, and renewal transfers that reference
-- to the successor, so an arrangement never points at an archived document
-- (BR-13). The Realization System therefore needs one thing it cannot work out
-- from a plain join: given a document it holds a reference to, which document
-- should it be pointing at now?

-- Walks the renewal chain forward from a document and returns the one at the
-- end of it — the document itself, or the successor of a successor after
-- several renewals.
--
-- Forward, not backward: `id_dokumen_sebelumnya` points from a renewal to its
-- predecessor, so following it in reverse is what "who replaced me" means.
-- Depth-limited, because a data error that made the chain circular would
-- otherwise hang the caller instead of returning an answer.
create function resolusi_penerus(p_no_dokumen int)
returns table (
  no_dokumen_kerjasama int,
  no_dokumen           varchar,
  status               varchar,
  alasan_arsip         varchar,
  langkah              int
)
language sql stable security definer set search_path = public as $fn$
  with recursive rantai as (
    select dk.no, dk.id_proposal_dokumen, dk.no_dokumen, dk.status,
           dk.alasan_arsip, 0 as langkah
      from dokumen_kerja_sama dk
     where dk.no = p_no_dokumen

    union all

    select dk.no, dk.id_proposal_dokumen, dk.no_dokumen, dk.status,
           dk.alasan_arsip, r.langkah + 1
      from rantai r
      join proposal_dokumen p on p.id_dokumen_sebelumnya = r.id_proposal_dokumen
      join dokumen_kerja_sama dk on dk.id_proposal_dokumen = p.id
     where r.langkah < 20
  )
  select no, no_dokumen, status, alasan_arsip, langkah
    from rantai
   order by langkah desc
   limit 1;
$fn$;

comment on function resolusi_penerus is
  'The document at the end of a renewal chain. The Realization System calls this
   to move an Implementation Arrangement onto the successor (BR-13).';

-- Reachable only by the service role behind the API-key check in the Next.js
-- route. No browser session has any business calling it.
revoke execute on function resolusi_penerus(int) from public, anon, authenticated;
