# M3 full-matrix attempt — conversation projection blocker

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `491f48185aaf944dffe75fb7d78d4e9823e588c6`
- Campaign: `m3-491f4818-full-matrix-14`
- Interface: real Chromium → `npm run play:local` → isolated PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`; fresh current-version party
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted
- Provider runtime: OpenAI-compatible vLLM, exact saved custom config
- WK: mandatory exact/structured + lexical + Giga

## Preconditions

One fixed sixteen-turn sequence was declared before execution for N1,
conversation/restart, S1, O1/A1 persistence/no-clone, negative edges and WK
trace controls. The runner had to stop at the first blocker. It deliberately
closed and restarted the real server after turn 2 while retaining the same
party and PostgreSQL state.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: the player examined the unrecognized shore NPC among reeds
   and debris. Domain outcome: N1 remainder and required current beat committed.
   Commit: committed; narration quality PASS.
2. Input: `Спрашиваю незнакомого рыбака, как сегодня идёт работа со снастями.`
   Visible result: the fisherman answered that work was proceeding and he was
   repairing tackle by the platform. Domain outcome: common conversation owner
   committed player speech, NPC perception, decision and reply. Commit:
   committed; narration quality PASS.
3. After real server restart, input:
   `После нашего разговора иначе спрашиваю того же рыбака, что теперь изменилось в его работе.`
   Visible result: the same fisherman replied that he could confirm nothing
   about that. Domain outcome: same persisted NPC and prior speech context
   produced a distinct refusal, not replay. Commit: committed; narration
   quality PASS.
4. Input: `Прекращаю разговор с рыбаком и отхожу осмотреть стан.`
   Visible result: prior reply remained; UI reported temporary unavailability
   and offered pending-result recovery. Domain outcome: shared conversation
   lifecycle/continuation reached Phase 3 commit projection, then
   `publicConversationProjection` threw `TypeError: Semantic statement references are invalid.`
   Commit: not committed for this turn.

## Persistence/readback

- Turns 1–2 survived a real server-process restart.
- Turn 3 used the same NPC identity and prior contact, committed a changed
  response, and did not replay turn 2.
- Turn 4 failed before a committed conversation/observation result. No retry was
  attempted and later matrix inputs were not submitted.

## Findings

- P1 blocker: the general compound leave-conversation + remaining observation
  path produced a semantic statement/reference carrier rejected by the shared
  public conversation projection. The failure is after common Phase 3 owner
  handling, not an authored phrase/scenario admission gap.
- S1, O1/A1, negative-edge and WK portions remain unverified on this exact head
  because fail-fast stopped the fixed campaign at turn 4.

## Result

`FAIL` — stopped at turn 4 on exact commit
`491f48185aaf944dffe75fb7d78d4e9823e588c6`; prior successful turns retained.
