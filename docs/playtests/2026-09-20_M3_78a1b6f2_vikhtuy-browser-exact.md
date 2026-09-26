# M3 preserved campaign — m3-78a1b6f2-vikhtuy-browser-exact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `78a1b6f2712d389011bcce9911093125f303bf47`
- Campaign: `m3-78a1b6f2-vikhtuy-browser-exact`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new or resumed party as recorded by campaign
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 O1 seed, neutral N1/S1, local return, O1 presence, A1 and semantic no-clone acceptance.
Clean-checkout state and runtime metadata were retained by the source campaign; private traces are omitted.

## Gameplay transcript

1. Input: `Осматриваюсь вокруг.`
   Visible result: Вы внимательно изучаете обстановку. В поле зрения — Милослав: рядом. В поле зрения — незнакомый рыбак: Чинит снасти у настила.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
2. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: Вы внимательно изучаете обстановку. В поле зрения — Милослав. В поле зрения — незнакомый рыбак, который чинит снасти у настила.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
3. Input: `Осматриваю ближайшее пространство именно в поисках доступной местной постройки.`
   Visible result: Вы осматриваете ближайшее пространство, ища доступную местную постройку. Результат этого осмотра пока не установлен.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
4. Input: `Захожу внутрь найденной местной постройки.`
   Visible result: Ты заходишь внутрь найденной местной постройки.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
5. Input: `Возвращаюсь из неё обратно на рыбацкую стоянку.`
   Visible result: Вы возвращаетесь из неё обратно на рыбацкую стоянку, но не удаётся достичь цели «Возвращаетесь из неё обратно на рыбацкую стоянку.».
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
6. Input: `Ищу у настила обычную сухую ветку, если она здесь есть.`
   Visible result: Вы ищете у настила обычную сухую ветку, если она здесь есть. Результат этого поиска пока не установлен.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
7. Input: `Ломаю найденную сухую ветку пополам, чтобы получить более короткую ветку.`
   Visible result: Результат по этому вопросу не установлен: «сухая ветка».
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
8. Input: `Другими словами осматриваю состояние той же укороченной ветки, не разыскивая новую.`
   Visible result: Результат по этому вопросу не установлен: «сухая ветка».
   Domain/commit: typed failure TURN_STEP_PLAN_INVALID; commit status `not_committed`; presentation `failed`.

## Persistence/readback

Source campaign retained 8 turn record(s) and 8 trace reference(s). This report makes no DB/readback claim absent from the source campaign.

## Findings

- Campaign failed after the retained turns. Failure code: ``; sanitized message: Browser turn failed: Действие временно недоступно. Попробуйте ещё раз.
×

## Result

`FAIL` — source status `failed`; exact only for `78a1b6f2712d389011bcce9911093125f303bf47`.
