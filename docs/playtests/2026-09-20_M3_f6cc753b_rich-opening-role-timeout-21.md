# M3 rich-opening attempt — unregistered opening roles

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `f6cc753b5fa94f39d919cab924c1655b2871b44a`
- Campaign: `m3-f6cc753b-rich-opening-21`
- Interface: real Chromium → real server → isolated PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Same fixed rich-opening/direct-rope-use/restart campaign after compact role
output assembly.

## Gameplay transcript

No player turn was submitted. Server remained alive, but the first screen did
not return inside the twenty-minute composed bound.

## Persistence/readback

No party identity reached the browser; no gameplay state claim is made.

## Findings

- Compact DTO assembly removed full-schema churn, but the adapter used new
  `opening_*` role IDs under `new_game`. Those IDs had no pinned runtime role
  config or registered 120-second transport limit.
- Stage 22/23 now reuse the existing registered `gameplay_narrator`, auditor and
  repair roles under `turn_runtime`. Opening-specific prompts and exact DTO
  assembly remain in the opening adapter; provider identity, limits and budget
  stay with the established LLM runtime owner.

## Result

`FAIL` — provider-role configuration timeout, zero turns. Superseded only by a
later exact-head rich-opening campaign.
