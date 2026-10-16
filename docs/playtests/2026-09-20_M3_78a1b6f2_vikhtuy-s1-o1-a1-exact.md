# M3 preserved campaign — m3-78a1b6f2-vikhtuy-s1-o1-a1-exact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `78a1b6f2712d389011bcce9911093125f303bf47`
- Campaign: `m3-78a1b6f2-vikhtuy-s1-o1-a1-exact`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new or resumed party as recorded by campaign
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 S1 consumption then grounded O1 materialization, A1 physical change and same-identity reload inspection.
Clean-checkout state and runtime metadata were retained by the source campaign; private traces are omitted.

## Gameplay transcript

1. Input: `Осматриваюсь вокруг.`
   Visible result: Вы внимательно изучаете обстановку. В поле зрения оказывается Милослав, который находится рядом. Недалеко от него, у настила, вы замечаете незнакомца-рыбака, чинящего снасти.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
2. Input: `Осматриваю ближайшее пространство именно в поисках доступной местной постройки.`
   Visible result: Вы осматриваете ближайшее пространство именно в поисках доступной местной постройки. Результат этого осмотра пока не установлен.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
3. Input: `Ищу среди видимых вынесенных течением ветвей одну обычную ветку.`
   Visible result: Вы ищете среди видимых вынесенных течением ветвей одну обычную ветку. Эта попытка ещё не совершена, и её результат пока неизвестен.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
4. Input: `Ломаю найденную ветку пополам, чтобы получить более короткую ветку.`
   Visible result: Вы ищете среди видимых вынесенных течением ветвей одну обычную ветку. Эта попытка ещё не совершена, и её результат пока неизвестен.
   Domain/commit: typed failure TURN_STEP_PLAN_INVALID; commit status `not_committed`; presentation `failed`.

## Persistence/readback

Source campaign retained 4 turn record(s) and 4 trace reference(s). This report makes no DB/readback claim absent from the source campaign.

## Findings

- Campaign failed after the retained turns. Failure code: ``; sanitized message: Browser turn failed: Действие временно недоступно. Попробуйте ещё раз.
×

## Result

`FAIL` — source status `failed`; exact only for `78a1b6f2712d389011bcce9911093125f303bf47`.
