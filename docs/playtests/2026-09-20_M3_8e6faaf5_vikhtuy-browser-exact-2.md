# M3 preserved campaign — m3-8e6faaf5-vikhtuy-browser-exact-2

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `8e6faaf5f8585300b23bfff939137a7db2d0e00d`
- Campaign: `m3-8e6faaf5-vikhtuy-browser-exact-2`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new or resumed party as recorded by campaign
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 neutral N1/S1, local return, O1, A1 and semantic no-clone acceptance.
Clean-checkout state and runtime metadata were retained by the source campaign; private traces are omitted.

## Gameplay transcript

1. Input: `Осматриваю незнакомого рыбака и то, чем он занят.`
   Visible result: Вы внимательно изучаете обстановку. В поле зрения — Милослав: рядом. В поле зрения — незнакомый рыбак: Чинит снасти у настила.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
2. Input: `Осматриваю местную рабочую постройку, если она здесь есть.`
   Visible result: Вы стоите у рыбацкого стана в Вихтуе. Вы ещё не осмотрели местную рабочую постройку, если она здесь есть, и результат этого осмотра пока неизвестен.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
3. Input: `Захожу внутрь найденной местной постройки.`
   Visible result: Вы стоите у рыбацкого стана в Вихтуе. Вы ещё не осмотрели местную рабочую постройку, если она здесь есть, и результат этого осмотра пока неизвестен.
   Domain/commit: typed failure TURN_STEP_PLAN_INVALID; commit status `not_committed`; presentation `failed`.

## Persistence/readback

Source campaign retained 3 turn record(s) and 3 trace reference(s). This report makes no DB/readback claim absent from the source campaign.

## Findings

- Campaign failed after the retained turns. Failure code: ``; sanitized message: Browser turn failed: Действие временно недоступно. Попробуйте ещё раз.
×

## Result

`FAIL` — source status `failed`; exact only for `8e6faaf5f8585300b23bfff939137a7db2d0e00d`.
