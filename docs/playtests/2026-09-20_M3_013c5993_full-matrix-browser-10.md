# M3 full-matrix attempt — conversation lifecycle blocker

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `013c599364b48bd106a2ab418f21c749a4b22f87`
- Interface: real Chromium → `npm run play:local` → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, fresh current-version party
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted
- WK: mandatory exact/structured + lexical + Giga

## Preconditions

One bounded fixed-input campaign was predeclared for the complete attachment §10
matrix. The run was required to stop at its first blocker without retrying the
failed request.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: the unknown person in simple clothing remained by the reeds,
   repairing tackle; Miloslav remained nearby. Domain result: strict N1 proposal
   and audit committed on the existing NPC. Commit: committed.
2. Input: `Спрашиваю незнакомого рыбака, как сегодня идёт работа со снастями.`
   Visible result: `Незнакомый рыбак говорит: «Сейчас чиню снасти у настила. Работа обычная, без приключений.»`
   Domain result: common conversation owner committed player speech, perception,
   NPC decision and response. Commit: committed.
3. After real server restart/readback, input:
   `После нашего разговора иначе спрашиваю того же рыбака, что теперь изменилось в его работе.`
   Visible result: `Незнакомый рыбак произносит: «Об этом я ничего подтвердить не могу.»`
   Domain result: same persisted NPC and prior conversation context produced a
   new refusal, not replay. Commit: committed.
4. Input: `Прекращаю разговор с рыбаком и отхожу осмотреть стан.`
   Visible result: previous refusal remained; UI reported temporary
   unavailability. Domain result: player lifecycle contribution failed common
   conversation validation with `TURN_CONVERSATION_PLAYER_APPLY_FAILED`.
   Commit: `not_committed`.

## Persistence/readback

- N1 and first NPC response survived a real server restart unchanged.
- The follow-up used the same NPC and committed a distinct refusal.
- Failed lifecycle turn wrote no conversation/S1 effect.

## Findings

- P1: combined leave-conversation + later observation was interpreted as a
  player conversation contribution but failed the common input-mode/mechanics
  validator instead of committing leave and preserving later intent.
- The fail-fast blocker prevented S1, O1/A1, negative and WK portions of the
  predeclared matrix. No pass is claimed for those portions.

Superseded for acceptance only by a later post-fix exact-head full-matrix report.

## Result

`FAIL` — stopped at turn 4; exact for
`013c599364b48bd106a2ab418f21c749a4b22f87`.
