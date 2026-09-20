# M3 fresh-party browser — N1 and neutral contact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `45ada4edf46ad3368c398d2138cc42a62f017871`
- Interface: real Chromium → developer-enabled `npm run play:local` → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new current-version party
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted
- WK: mandatory exact/structured + lexical + Giga

## Preconditions

Fresh party after the exact `1d` N1-audit failure. Developer logging was enabled
only to inspect the safe structural audit result; private calls/traces are not
included here. No retry of the failed `1d` request occurred.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: the unknown person remained by the reeds, repairing tackle;
   Miloslav remained nearby. Domain result: N1 proposal and strict audit passed;
   ordinary detail committed to the existing NPC. Commit: committed.
2. Input: `Спрашиваю незнакомого рыбака, как сегодня идёт работа со снастями.`
   Visible result: `Незнакомый рыбак произносит: «Сейчас чиню снасти у настила. Работа обычная, без особых перемен.»`
   Domain result: the common conversation owner committed player speech,
   perception, NPC decision and reply against the same NPC. Commit: committed.

## Persistence/readback

The N1 audit had the exact valid four-field public contract shape: matching
schema/request identity, `approved=true`, empty concerns. No semantic
normalization or audit weakening was added. The same persisted NPC identity was
used for turn 2.

## Findings

- The earlier `1d` malformed audit shape could not be recovered from its
  non-developer log and did not reproduce on this fresh exact run. Per policy,
  no speculative structural repair was added without the malformed shape.
- Required full O1/A1/negative/WK acceptance matrix remains incomplete on this
  exact head; report 07 contains partial S1/restart evidence.

## Result

`PARTIAL` — fresh exact N1 and neutral contact passed, but this two-turn run is
not full M3 acceptance. Exact only for
`45ada4edf46ad3368c398d2138cc42a62f017871`.
