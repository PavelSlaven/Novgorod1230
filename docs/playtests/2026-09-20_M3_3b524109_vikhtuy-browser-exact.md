# M3 preserved campaign — m3-3b524109-vikhtuy-browser-exact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `3b5241095027d09e075c0793ab13080c12b013ba`
- Campaign: `m3-3b524109-vikhtuy-browser-exact`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new or resumed party as recorded by campaign
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 neutral N1/S1, local return, grounded O1, A1 and semantic no-clone acceptance.
Clean-checkout state and runtime metadata were retained by the source campaign; private traces are omitted.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку, и внимательно осматриваете незнакомца, который стоит у полосы камыша и осоки, чиня снасти у настила. Рядом находится Милослав.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
2. Input: `Осматриваю ближайшее пространство вокруг стана.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку. Рядом, у полосы камыша и осоки, незнакомый рыбак чинит снасти у настила, а Милослав находится поблизости. Неподалёку, на песке у берега реки, стоит деревянная рама для сушки сетей — простая открытая конструкция из бревен и верёвок, предназначенная для подвешивания и сушки рыболовных сетей.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
3. Input: `Захожу внутрь найденной местной постройки.`
   Visible result: ВОССТАНОВЛЕННОЕ СОСТОЯНИЕ  Текущий момент  рыбацкий стан у Вихтуя
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
4. Input: `Выхожу наружу из найденной местной постройки.`
   Visible result: ВОССТАНОВЛЕННОЕ СОСТОЯНИЕ  Текущий момент  рыбацкий стан у Вихтуя
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
5. Input: `Ищу среди видимых вынесенных течением ветвей одну обычную ветку.`
   Visible result: Вы находите сухую ветку.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
6. Input: `Ломаю найденную ветку пополам, чтобы получить более короткую ветку.`
   Visible result: В руках у тебя короткий обломок сухой ветки, отломанный пополам. Ты стоишь на рыбацком стане у Вихтуя.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
7. Input: `Осматриваю найденную укороченную ветку.`
   Visible result: Вы внимательно изучаете обстановку. В поле зрения — Милослав. В поле зрения — незнакомый рыбак: человек, стоящий у полосы камыша и осоки, который чинит снасти у настила. В поле зрения — сухая ветка. В поле зрения — половина сухой ветки: короткий обломок сухой ветки, отломанный пополам, длиной в половину исходной длины, состоящий из сухой древесины.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
8. Input: `Другими словами проверяю состояние той же ветки, не разыскивая новую.`
   Visible result: Вы держите в руках верёвку. Она находится в пригодном для обычного использования состоянии.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.

## Persistence/readback

Source campaign retained 8 turn record(s) and 8 trace reference(s). This report makes no DB/readback claim absent from the source campaign.

## Findings

- Blocking narration-quality failure was retained by the campaign.

## Result

`FAIL` — source status `quality_failed`; exact only for `3b5241095027d09e075c0793ab13080c12b013ba`.
