# M3 manual browser — neutral conversation persistence failure

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `2ee26d217a1f936d9bc2b583b2109d5aa159e81d`
- Interface: manual real Chromium → `npm run play:local` → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new party
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted
- WK: mandatory baseline with Giga

## Preconditions

Clean exact checkout. Manual fixed inputs were used after two fail-fast explorer
campaigns produced unrelated first-turn ordinary-grounding failures. Goal:
exercise N1 then the new neutral conversation path without retrying either
failed campaign.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: the unknown person remained by the reeds, repairing tackle;
   Miloslav remained nearby. Domain result: N1 detail committed to the existing
   background NPC. Commit: committed with ready narration.
2. Input: `Спрашиваю незнакомого рыбака, как сегодня идёт работа со снастями.`
   Visible result: previous screen remained; UI reported that the committed
   scenario revision had no approved turn execution package. Domain result:
   player/NPC conversation models and general owner ran, but PostgreSQL phase3
   commit called the trace-only revision gate for an authored party. Commit:
   `not_committed`.

## Persistence/readback

N1 state from turn 1 persisted. Turn 2 wrote no conversation effect and can be
retried only after a new-head owner fix; no NPC response was falsely shown.

## Findings

- P1: shared conversation execution was wired, but its persistence adapter
  still required a Lower Dvina numeric scenario revision. First bad boundary:
  phase3 PostgreSQL commit admission.

Superseded for acceptance only by a later post-fix exact-head report.

## Result

`FAIL` — N1 passed; neutral conversation persistence failed. Exact only for
`2ee26d217a1f936d9bc2b583b2109d5aa159e81d`.
