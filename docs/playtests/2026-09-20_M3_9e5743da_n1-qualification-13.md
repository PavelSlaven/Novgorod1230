# M3 N1 narration qualification — reproduced missing current beat

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `9e5743da94762c5704cec20f52ae0db224d235bb`
- Campaigns: `m3-9e5743da-n1-qualification-1`, `-2`
- Interface: real Chromium → `npm run play:local` → isolated PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`; fresh current-version parties
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted
- WK: mandatory exact/structured + lexical + Giga

## Preconditions

After the exact N1 owner-routing fix, the same three fixed equivalent inputs
were declared as one post-fix regression set. The set stopped at the first
blocking quality result. No turn was retried; the third party was not started.

## Gameplay transcript

1. Input: `Внимательно осматриваю внешность и одежду ближайшего незнакомого рыбака.`
   Visible result: narrated screen described the player inspecting the
   unrecognized fisherman while he repaired tackle by the platform. Domain
   outcome: N1 detail accepted. Commit: committed; narration quality PASS.
2. Input: `Присматриваюсь к ближайшему рыбаку: как он выглядит и во что одет?`
   Visible result: factual recovery UI showed `ВОССТАНОВЛЕННОЕ СОСТОЯНИЕ` and
   the current camp only. Domain outcome: N1 detail committed, but approved
   narration was not delivered. Commit: committed with degraded factual
   delivery.

## Persistence/readback

Both submitted turns committed independently. The degraded second result was
served from its committed factual package; gameplay effects were not retried.
The third predeclared input was not submitted after the blocking result.

## Findings

- Safe private diagnostics: `TRACE_PHASE_2_NARRATION_REJECTED`, phase
  `final_audit_failed`, final concern `unsupported_attempt`; initial audit
  failed policy and artistic checks, final audit failed policy. No raw prompt,
  prose, hidden DTO, credential or endpoint was retained in this projection.
- Proven general wire root: the committed N1 remainder updated
  `optional_support.visible_npc`, but emitted no `visible_changes`; therefore
  `required_current_beat.changes` was empty. Initial audit asked repair to
  express the player's observation, then final audit correctly rejected that
  expression because intent alone was not evidence of execution. The N1 owner
  must publish its newly committed observation as a required current beat.

## Result

`FAIL` — 1/2 submitted turns PASS; second reproduced the blocking narration
failure. No final M3 matrix was run on this head.
