# M3 full-matrix attempt — S1 absence invalidates dependent entry

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `f4d8876da1694e12f5c760bca12da7640d55e64c`
- Campaign: `m3-f4d8876d-full-matrix-17`
- Interface: real Chromium → `npm run play:local` → isolated PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`; fresh current-version party
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted
- Provider runtime: OpenAI-compatible vLLM, exact saved custom config
- WK: mandatory exact/structured + lexical + Giga

## Preconditions

The same fixed sixteen-turn matrix used by report 16 was declared before the
run after the player-leave public-projection fix. The runner restarted the real
server after turn 2 and had to stop at the first blocker. No failed turn was
retried or reworded.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: the player examined the unrecognized NPC by the reeds.
   Domain outcome: N1 remainder/current beat. Commit: committed; narration PASS.
2. Input: `Спрашиваю незнакомого рыбака, как сегодня идёт работа со снастями.`
   Visible result: the fisherman said he was repairing tackle by the platform
   and work was proceeding normally. Domain outcome: common conversation speech,
   perception, NPC decision and response. Commit: committed; narration PASS.
3. After real server restart, input:
   `После нашего разговора иначе спрашиваю того же рыбака, что теперь изменилось в его работе.`
   Visible result: the same fisherman said nothing had changed and the prior
   conversation had not affected his work. Domain outcome: same persisted NPC,
   changed context and distinct response, not replay. Commit: committed;
   narration PASS.
4. Input: `Прекращаю разговор с рыбаком и отхожу осмотреть стан.`
   Visible result: no reply followed. Domain outcome: player
   `leave_conversation` projected with its typed zero-statement carrier; later
   observation intent remained available. Commit: committed; narration PASS.
5. Input: `Осматриваю ближайшее пространство именно в поисках доступной местной постройки.`
   Visible result: the completed inspection reported no confirmed find.
   Domain outcome: honest no-find; no local place was materialized. Commit:
   committed; narration PASS.
6. Input: `Захожу внутрь найденной местной постройки.`
   Visible result: prior no-find remained; UI reported temporary unavailability.
   Domain outcome: planner plus one bounded repair could not ground entry because
   turn 5 had established no such found target. `TURN_STEP_PLAN_INVALID`;
   commit: not started / not committed.

## Persistence/readback

- N1 and initial NPC response survived real server restart.
- Continued contact used the same NPC and prior conversation context.
- The player leave lifecycle committed without fabricated statement refs and
  was not replayed.
- Turn 5 created no S1 identity; turn 6 therefore had no admissible target and
  wrote no state.

## Findings

- The report-16 T4 projection defect is closed: compound leave no longer throws
  or fabricates a statement reference.
- Next bounded blocker is campaign/data outcome dependency: S1 returned an
  honest no-find, while the fixed next input asserted a found building. The
  fail-closed grounding response is correct for that state, but positive S1
  enter/return and all later O1/A1/negative/WK matrix rows remain unverified on
  this head.

## Result

`PARTIAL` — turns 1–5 committed with narration PASS; turn 6 correctly failed
closed against an absent target. Campaign stopped without retry. Exact for
`f4d8876da1694e12f5c760bca12da7640d55e64c`.
