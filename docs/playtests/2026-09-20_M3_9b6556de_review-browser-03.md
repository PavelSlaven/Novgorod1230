# M3 review browser campaign — semantic grounding failure

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `9b6556de309ee2fa8ad73714faad5eae809b8c3e`
- Scope: post-review M3 O1/A1/NPC/S1/WK campaign
- Interface: real Chromium → local game server → disposable PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new party
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`, OpenAI-compatible provider; endpoint and credentials omitted
- WK: mandatory exact/structured + lexical + Giga

## Preconditions

Clean exact checkout. Planned twelve-turn campaign covering ordinary item,
conversation, local spatial movement, negative cases and WK failure separation.
No retry/cherry-pick was permitted after a blocking turn.

## Gameplay transcript

1. Input: `Подойти к сетям у настила и потрогать их, чтобы проверить, нет ли дыр или узлов`
   Visible result: opening screen remained; UI reported that the action was
   temporarily unavailable. Domain result: planner selected an inspection of
   the current position for a query about touching the nets; strict semantic
   grounding rejected it, the single bounded repair remained ungrounded, and
   the turn failed before commit. Commit: `not_committed`.

## Persistence/readback

No gameplay effect, world fact, item, NPC change, time advance or narration was
committed. The created party and failed request remained available as failure
evidence; no replay claim is made.

## Findings

- P1: pronoun/object grounding did not bind the visible-but-not-materialized
  nets to an ordinary discovery prerequisite. Both initial and repaired plans
  targeted the position instead of a grounded object/source.
- The failure was typed and fail-closed; retrieved WK facts did not become a
  fabricated current-world fact.

Superseded for acceptance only by a later post-fix exact-head report.

## Result

`FAIL` — stopped at turn 1; exact for
`9b6556de309ee2fa8ad73714faad5eae809b8c3e`.
