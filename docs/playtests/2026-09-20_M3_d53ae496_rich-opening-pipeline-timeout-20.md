# M3 rich-opening attempt — full-schema role churn timeout

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `d53ae4963d32fd7e71d4f0f09d4d5d3ee6e5f470`
- Campaign: `m3-d53ae496-rich-opening-20`
- Interface: real Chromium → real server → isolated PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Same fixed rich-opening/direct-rope-use/restart campaign as report 19, now with
the composed twenty-minute opening wait.

## Gameplay transcript

No player turn was submitted. The server stayed alive, but the new-game request
did not return a first screen inside the twenty-minute composed bound.

## Persistence/readback

No party identity was returned to the browser and no gameplay claim is made.

## Findings

- Stage 22 and Stage 23 callbacks asked the model to reproduce their complete
  large server-owned DTOs. Validation then entered bounded writer/format/senior
  and audit repair paths sequentially; this exhausted the whole-opening bound.
- Provider boundary now follows the established narration pattern: model returns
  only prose or compact audit findings; server assembles exact Stage 22/23 DTOs
  and the closed repair route. Factual/hidden/coverage checks remain unchanged.

## Result

`FAIL` — opening pipeline timeout, zero turns. Superseded only by a later
exact-head rich-opening campaign.
