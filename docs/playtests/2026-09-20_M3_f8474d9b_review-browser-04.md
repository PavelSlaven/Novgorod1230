# M3 review browser campaign — ordinary prerequisite repair failure

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `f8474d9b43e733ae33ed2a6bbe3666b9179da35b`
- Scope: post-review M3 target-model campaign
- Interface: real Chromium → local game server → disposable PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new party
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; provider endpoint and credentials omitted
- WK: mandatory exact/structured + lexical + Giga

## Preconditions

Clean exact checkout after the first ordinary-prerequisite repair instruction.
Planned twelve turns; fail-fast policy retained the first blocking result.

## Gameplay transcript

1. Input: `Провлечь настил под ногами, чтобы проверить, не скрипит ли он под тяжестью сетей и не развязалась ли узловая верёвка.`
   Visible result: opening screen remained and UI reported temporary
   unavailability. Domain result: the plan used a literal physical denial while
   a grounded ordinary owner was available; strict validator and the single
   repair both rejected it. Commit: `not_committed`.

## Persistence/readback

No time, item, NPC, world fact or narration effect committed. Retrieved WK did
not become current-world truth.

## Findings

- P1: the model/repair still failed to select the ordinary prerequisite for a
  visible but unmaterialized local object. The failure stayed typed and
  fail-closed.

Superseded for acceptance only by a later post-fix exact-head report.

## Result

`FAIL` — stopped at turn 1; exact for
`f8474d9b43e733ae33ed2a6bbe3666b9179da35b`.
