# M3 loaded-party browser — visible-envelope pin failure

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `b9f7b7a24e467c6bcc8dedbffe7783aae1ce7473`
- Interface: real Chromium → restarted `npm run play:local` → existing PostgreSQL party
- Start: loaded `vikhtuy_fishing_camp_v1` party from report 05
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted
- WK: mandatory baseline with Giga

## Preconditions

Loaded the party whose N1 turn was already committed. Removed only the browser's
failed pending-request marker so a new request identity could be sent; world state
was not edited.

## Gameplay transcript

1. Input: `Спрашиваю незнакомого рыбака, как сегодня идёт работа со снастями.`
   Visible result: previous N1 screen remained and UI reported temporary
   unavailability. Domain result: shared conversation owner ran, but the phase3
   visible-envelope builder could not resolve its activity pin. Commit:
   `not_committed`.

## Persistence/readback

Previously committed N1 state and NPC identity remained unchanged. No speech,
time or conversation state was persisted.

## Findings

- P1: neutral contract activity pins reused the owner profile-set ID instead of
  the conversation activity profile ID. First bad boundary: phase3 visible
  envelope dependency pin construction.

Superseded for acceptance only by a later post-fix exact-head report.

## Result

`FAIL` — exact for `b9f7b7a24e467c6bcc8dedbffe7783aae1ce7473`.
