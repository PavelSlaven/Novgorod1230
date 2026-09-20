# M3 preserved campaign — m3-e20f5c55-vikhtuy-browser-exact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `e20f5c555afe9ec0116915afbea5d659e0cbabe8`
- Campaign: `m3-e20f5c55-vikhtuy-browser-exact`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new or resumed party as recorded by campaign
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 neutral N1/S1, local return, grounded O1, A1 and semantic no-clone acceptance.
Clean-checkout state and runtime metadata were retained by the source campaign; private traces are omitted.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: Вы осматриваете незнакомца в простой одежде, который стоит у полосы камыша и осоки, чиня снасти у настила.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
2. Input: `Осматриваю ближайшее пространство вокруг стана.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку. Рядом, у полосы камыша и осоки, незнакомый рыбак в простой одежде чинит снасти у настила. Милослав находится поблизости. Недалеко виден открытый деревянный сарай, простой постройка из бревен и коры, образующий внутреннее пространство для работы.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
3. Input: `Захожу внутрь найденной местной постройки.`
   Visible result: ВОССТАНОВЛЕННОЕ СОСТОЯНИЕ  Текущий момент  рыбацкий стан у Вихтуя
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
4. Input: `Выхожу наружу из найденной местной постройки.`
   Visible result: Вы выходите наружу из найденной местной постройки и стоите на рыбацком стане у Вихтуя, держа в руках верёвку. Рядом, у настила, вы видите незнакомца в простой одежде, который чинит снасти, стоя у полосы камыша и осоки. Вы замечаете, что Милослав находится поблизости, но в этот момент вы не совершаете никаких действий.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
5. Input: `Ищу среди видимых вынесенных течением ветвей одну обычную ветку.`
   Visible result: Вы находите сухую ветку.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
6. Input: `Ломаю найденную ветку пополам, чтобы получить более короткую ветку.`
   Visible result: Вы ломаете длинную ветку пополам, и в руках остаются две короткие деревянные палки.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
7. Input: `Осматриваю найденную укороченную ветку.`
   Visible result: Вы держите в руках верёвку. Она пригодна к обычному использованию.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
8. Input: `Другими словами проверяю состояние той же ветки, не разыскивая новую.`
   Visible result: Вы держите в руках верёвку. Она пригодна для обычного использования.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.

## Persistence/readback

Source campaign retained 8 turn record(s) and 8 trace reference(s). This report makes no DB/readback claim absent from the source campaign.

## Findings

- Blocking narration-quality failure was retained by the campaign.

## Result

`FAIL` — source status `quality_failed`; exact only for `e20f5c555afe9ec0116915afbea5d659e0cbabe8`.
