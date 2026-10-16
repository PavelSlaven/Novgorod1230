# M3 preserved campaign — m3-e7094ff1-vikhtuy-browser-exact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `e7094ff1b41a854e08fdf3d6ea07f5f04ccb3bd2`
- Campaign: `m3-e7094ff1-vikhtuy-browser-exact`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new or resumed party as recorded by campaign
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 neutral N1/S1, local return, grounded O1, A1 and semantic no-clone acceptance.
Clean-checkout state and runtime metadata were retained by the source campaign; private traces are omitted.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: Вы внимательно изучаете обстановку. В поле зрения оказывается Милослав, который находится рядом. Недалеко от него, у настила, вы замечаете незнакомца-рыбака, чинящего снасти.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
2. Input: `Осматриваю ближайшее пространство вокруг стана.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку. Рядом, у настила, незнакомый рыбак чинит снасти, а Милослав находится поблизости. Вы замечаете открытый деревянный сарай, простой постройку из бревен и коры, которая служит укрытием для работы или хранения вещей.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
3. Input: `Захожу внутрь найденной местной постройки.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку. Рядом, у настила, незнакомый рыбак чинит снасти, а Милослав находится поблизости. Вы замечаете открытый деревянный сарай, простой постройку из бревен и коры, которая служит укрытием для работы или хранения вещей.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
4. Input: `Возвращаюсь из неё обратно на рыбацкую стоянку.`
   Visible result: Вы внимательно изучаете обстановку. В поле зрения — Милослав. В поле зрения — незнакомый рыбак, который чинит снасти у настила.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
5. Input: `Ищу среди видимых вынесенных течением ветвей одну обычную ветку.`
   Visible result: Вы ищете среди вынесенных течением ветвей одну обычную, но не удаётся достичь этой цели.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
6. Input: `Ломаю найденную ветку пополам, чтобы получить более короткую ветку.`
   Visible result: Вы берёте найденную ветку и пытаетесь сломать её пополам, чтобы получить более короткий отрезок. Однако цель не достигается: ветка не ломается.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
7. Input: `Осматриваю найденную укороченную ветку.`
   Visible result: Вы осматриваете найденную укороченную ветку, но не достигаете цели «Осматриваю найденную укороченную ветку.».
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
8. Input: `Другими словами проверяю состояние той же ветки, не разыскивая новую.`
   Visible result: Вы внимательно изучаете обстановку. В поле зрения — Милослав. В поле зрения — незнакомый рыбак, который чинит снасти у настила.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.

## Persistence/readback

Source campaign retained 8 turn record(s) and 8 trace reference(s). This report makes no DB/readback claim absent from the source campaign.

## Findings

- No campaign-level blocking finding was recorded; per-turn results above remain authoritative.

## Result

`PASS` — source status `captured`; exact only for `e7094ff1b41a854e08fdf3d6ea07f5f04ccb3bd2`.
