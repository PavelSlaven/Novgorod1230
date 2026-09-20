# M3 N1 narration qualification — two passes, one grounding failure

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `f8fed15d32e346ce25602248fb597f8929334050`
- Campaigns: `m3-f8fed15d-n1-qualification-1`, `-2`, `-3`
- Interface: real Chromium → `npm run play:local` → isolated PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`; three fresh current-version parties
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted
- WK: mandatory exact/structured + lexical + Giga

## Preconditions

One bounded set of three independent equivalent N1 turns was declared before
execution. Inputs and order were fixed. Any degraded or failed result stopped
the set; no turn was retried and no wording was changed after a result.

## Gameplay transcript

1. Input: `Внимательно осматриваю внешность и одежду ближайшего незнакомого рыбака.`
   Visible result: the turn screen described the unrecognized fisherman on the
   shore among reeds and sedge, in simple clothing, repairing tackle by the
   platform. Domain outcome: N1 detail accepted. Commit: committed; narrated
   presentation completed; quality PASS.
2. Input: `Присматриваюсь к ближайшему рыбаку: как он выглядит и во что одет?`
   Visible result: the turn screen retained the same public camp context and
   described the unrecognized fisherman repairing tackle by the water.
   Domain outcome: N1 detail accepted. Commit: committed; narrated presentation
   completed; quality PASS.
3. Input: `Разглядываю стоящего рядом незнакомого рыбака, отмечая его лицо и одежду.`
   Visible result: opening screen remained and UI reported that the action was
   temporarily unavailable. Domain outcome: planner and one bounded repair
   emitted the same exact single-target `request_discovery`; both stochastic
   grounding audits rejected it as `operation_semantic_grounding` even though
   the target was the exact visible, eligible background NPC and the query was
   the unchanged literal intent. Commit: not started / not committed.

## Persistence/readback

The two successful turns committed independently. The failed third turn wrote
no gameplay state. Private diagnostics retained only structural role/status and
validation data; this report contains no prompts, model outputs, hidden DTOs,
credentials or provider endpoint.

## Findings

- Root cause proven: `exactBackgroundNpcDiscoveryGrounding()` already accepted
  the third plan deterministically, but the validator called it only inside the
  `ordinary_discovery` owner branch. N1 uses the existing
  `background_npc_remainder` owner, so the same exact plan fell through to a
  stochastic general audit.
- This is a shared owner-routing defect, not a narration sample defect. The set
  is retained as failed evidence and is superseded only by a post-fix exact-head
  qualification.

## Result

`FAIL` — 2/3 PASS; third turn blocked before narration at the shared semantic
grounding boundary. No final M3 matrix was run on this head.
