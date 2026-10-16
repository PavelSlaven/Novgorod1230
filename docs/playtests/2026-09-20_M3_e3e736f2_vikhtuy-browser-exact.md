# M3 preserved campaign — m3-e3e736f2-vikhtuy-browser-exact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `e3e736f2be359e167e5a51bce592241a6469468f`
- Campaign: `m3-e3e736f2-vikhtuy-browser-exact`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new or resumed party as recorded by campaign
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 neutral N1/S1, local return, grounded O1, A1 and semantic no-clone narration acceptance.
Clean-checkout state and runtime metadata were retained by the source campaign; private traces are omitted.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку, и внимательно рассматриваете незнакомца: рядом с вами находится Милослав, а недалеко, у кромки воды среди камыша и осоки, человек в простой одежде чинит снасти у настила.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
2. Input: `Осматриваю ближайшее пространство вокруг стана.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку. Рядом, у кромки воды среди камыша и осоки, незнакомый рыбак в простой одежде чинит снасти у настила. Милослав тоже здесь. Вокруг виден открытый деревянный сарай, простой постройка из бревен и коры, служащий укрытием на стане. Вы ещё не решили, что будете делать дальше; этот выбор пока не сделан, и его результат неизвестен.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
3. Input: `Захожу внутрь найденной местной постройки.`
   Visible result: Вы переместились в пределах текущего места, оставаясь на рыбацком стане у Вихтуя.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
4. Input: `Выхожу наружу из найденной местной постройки.`
   Visible result: Вы переместились в пределах текущего места, оставаясь на рыбацком стане у Вихтуя.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
5. Input: `Ищу среди видимых вынесенных течением ветвей одну обычную ветку.`
   Visible result: Вы находите сухую ветку.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
6. Input: `Ломаю найденную ветку пополам, чтобы получить более короткую ветку.`
   Visible result: Вы находите сухую ветку.
   Domain/commit: typed failure TURN_STEP_PLAN_INVALID; commit status `not_committed`; presentation `failed`.

## Persistence/readback

Source campaign retained 6 turn record(s) and 6 trace reference(s). This report makes no DB/readback claim absent from the source campaign.

## Findings

- Campaign failed after the retained turns. Failure code: ``; sanitized message: Browser turn failed: Действие временно недоступно. Попробуйте ещё раз.
×

## Result

`FAIL` — source status `failed`; exact only for `e3e736f2be359e167e5a51bce592241a6469468f`.
