# M3 rich-opening attempt — terminal Stage 22/23 latency blocker

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `d119f9d9f08d4168bbbf85010c9b41a98c8bd56c`
- Campaign: `m3-d119f9d9-rich-opening-22`
- Interface: real Chromium → real server → isolated PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted
- WK: mandatory exact/structured + lexical + Giga

## Preconditions

Final predeclared rich-opening campaign: fresh authored party, direct use of the
opening-named rope without `look`, real server restart, same-rope readback. The
run used registered `gameplay_narrator*` provider roles and compact model outputs
assembled into exact Stage 22/23 DTOs by code.

## Gameplay transcript

No player turn was submitted. Server remained alive after materialization and
startup, but the audited first screen did not return inside the twenty-minute
whole-opening bound.

## Persistence/readback

No party identity reached the browser; direct interaction and reload were not
executed. No gameplay PASS is claimed.

## Findings

- The unregistered-role defect from report 21 is closed: opening uses existing
  registered narrator/auditor/repair role identities with 120-second per-call
  limits.
- Exact provider call/repair count is unavailable because current party logging
  starts only after `startNewGame` returns. The remaining blocker is bounded
  Stage 22/23 target latency/validation-repair sequence before party delivery.
- Code-side rich package, persisted reference binding and eight-question reader
  control are covered by focused tests, but target-model/UI acceptance and the
  immediate-use/restart proof remain `NOT_VERIFIED`.

## Result

`FAIL` — terminal twenty-minute opening timeout, zero turns. M3 remains BLOCKED;
no further sample was run.
