# M3 preserved campaign — m3-97840068-vikhtuy-browser-exact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `9784006815066100bae321c6b663384169bbe119`
- Campaign: `m3-97840068-vikhtuy-browser-exact`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new or resumed party as recorded by campaign
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 neutral N1/S1, local return, grounded O1, A1 and semantic no-clone acceptance.
Clean-checkout state and runtime metadata were retained by the source campaign; private traces are omitted.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку, и рассматриваете незнакомца: он стоит у полосы камыша и осоки у воды, чиня снасти у настила, а рядом с вами находится Милослав.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
2. Input: `Осматриваю ближайшее пространство вокруг стана.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку. Рядом, у полосы камыша и осоки, стоит незнакомый рыбак и чинит снасти у настила. Неподалёку виден открытый деревянный сарай.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
3. Input: `Захожу внутрь найденной местной постройки.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку. Рядом, у полосы камыша и осоки, незнакомый рыбак чинит снасти у настила. Милослав находится поблизости. Вы видите простой открытый сруб из дерева и коры, заметный в лагере.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
4. Input: `Возвращаюсь из неё обратно на рыбацкую стоянку.`
   Visible result: Вы внимательно изучаете обстановку. В поле зрения находится Милослав. Рядом, у настила, стоит незнакомый рыбак, который чинит снасти; он расположен у полосы камыша и осоки у воды.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
5. Input: `Ищу среди видимых вынесенных течением ветвей одну обычную ветку.`
   Visible result: Вы ищете среди вынесенных течением ветвей одну обычную, но не удаётся достичь этой цели.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
6. Input: `Ломаю найденную ветку пополам, чтобы получить более короткую ветку.`
   Visible result: Ты ломаешь найденную ветку пополам, чтобы получить более короткую ветку, но не удаётся достичь этой цели.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
7. Input: `Осматриваю найденную укороченную ветку.`
   Visible result: Вы осматриваете найденную укороченную ветку, но не достигаете цели «Осматриваю найденную укороченную ветку.»
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
8. Input: `Другими словами проверяю состояние той же ветки, не разыскивая новую.`
   Visible result: Вы внимательно изучаете обстановку. В поле зрения находится Милослав. Рядом, у полосы камыша и осоки у воды, стоит незнакомый рыбак, который чинит снасти у настила.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.

## Persistence/readback

Source campaign retained 8 turn record(s) and 8 trace reference(s). This report makes no DB/readback claim absent from the source campaign.

## Findings

- No campaign-level blocking finding was recorded; per-turn results above remain authoritative.

## Result

`PASS` — source status `captured`; exact only for `9784006815066100bae321c6b663384169bbe119`.
