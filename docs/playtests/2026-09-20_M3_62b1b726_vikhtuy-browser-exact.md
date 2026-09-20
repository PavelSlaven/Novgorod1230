# M3 preserved campaign — m3-62b1b726-vikhtuy-browser-exact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `62b1b726f3dd289b6363424bd702600fb3eb62ae`
- Campaign: `m3-62b1b726-vikhtuy-browser-exact`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new or resumed party as recorded by campaign
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 neutral N1/S1, local return, grounded O1, A1 and semantic no-clone acceptance.
Clean-checkout state and runtime metadata were retained by the source campaign; private traces are omitted.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку, и внимательно рассматриваете незнакомца, который чинит снасти у настила среди ветвей и обломков, вынесенных течением к полосе камыша и осоки. Рядом с вами находится Милослав.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
2. Input: `Осматриваю ближайшее пространство вокруг стана.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку. Рядом, на песке у берега, стоит деревянная рама для сушки сетей — простая конструкция из бревен и плетёных прутьев. Недалеко, среди ветвей и обломков, вынесенных течением, у полосы камыша и осоки, незнакомый рыбак чинит снасти у настила. Милослав тоже здесь.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
3. Input: `Захожу внутрь найденной местной постройки.`
   Visible result: ВОССТАНОВЛЕННОЕ СОСТОЯНИЕ  Текущий момент  рыбацкий стан у Вихтуя
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
4. Input: `Выхожу наружу из найденной местной постройки.`
   Visible result: ВОССТАНОВЛЕННОЕ СОСТОЯНИЕ  Текущий момент  рыбацкий стан у Вихтуя
   Domain/commit: typed failure TURN_STEP_PLAN_INVALID; commit status `not_committed`; presentation `failed`.

## Persistence/readback

Source campaign retained 4 turn record(s) and 4 trace reference(s). This report makes no DB/readback claim absent from the source campaign.

## Findings

- Campaign failed after the retained turns. Failure code: ``; sanitized message: Browser turn failed: Действие временно недоступно. Попробуйте ещё раз.
×

## Result

`FAIL` — source status `failed`; exact only for `62b1b726f3dd289b6363424bd702600fb3eb62ae`.
