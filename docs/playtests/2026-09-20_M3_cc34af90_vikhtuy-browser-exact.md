# M3 preserved campaign — m3-cc34af90-vikhtuy-browser-exact

## Identity

- Date: 2026-09-20
- PR: #98
- Branch: `codex/live-world-runtime`
- Exact commit: `cc34af90297acdfc9a10f4caa78c5f12f5306607`
- Campaign: `m3-cc34af90-vikhtuy-browser-exact`
- Interface: real Chromium → local server → PostgreSQL
- Start: `vikhtuy_fishing_camp_v1`, new or resumed party as recorded by campaign
- Gameplay model: `qwen3.8-27b-uncensored-w4a16-tp2`; endpoint/key omitted

## Preconditions

Focus: Predeclared M3 neutral N1/S1, local return, grounded O1, A1 and semantic no-clone acceptance.
Clean-checkout state and runtime metadata were retained by the source campaign; private traces are omitted.

## Gameplay transcript

1. Input: `Внимательно рассматриваю внешность и одежду незнакомого рыбака.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку, и внимательно осматриваете незнакомца: рядом находится Милослав, а незнакомый рыбак в простой одежде стоит среди вытоптанной травы и камыша у кромки воды, чиня снасти у настила.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
2. Input: `Осматриваю ближайшее пространство вокруг стана.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку. Рядом, среди вытоптанной травы и камыша у кромки воды, незнакомый рыбак в простой одежде чинит снасти у настила. Милослав находится поблизости. Вы замечаете деревянный навес для сушки сетей — простую открытую конструкцию из бревен и коры, используемую для хранения и сушки снастей на берегу.
   Domain/commit: terminal gameplay result recorded; commit status `committed`; presentation `completed`.
3. Input: `Захожу внутрь найденной местной постройки.`
   Visible result: Вы стоите на рыбацком стане у Вихтуя, держа в руках верёвку. Рядом, среди вытоптанной травы и камыша у кромки воды, незнакомый рыбак в простой одежде чинит снасти у настила. Милослав находится поблизости. Вы замечаете деревянный навес для сушки сетей — простую открытую конструкцию из бревен и коры, используемую для хранения и сушки снастей на берегу.
   Domain/commit: typed failure TURN_STEP_PLAN_INVALID; commit status `not_committed`; presentation `failed`.

## Persistence/readback

Source campaign retained 3 turn record(s) and 3 trace reference(s). This report makes no DB/readback claim absent from the source campaign.

## Findings

- Campaign failed after the retained turns. Failure code: ``; sanitized message: Browser turn failed: Действие временно недоступно. Попробуйте ещё раз.
×

## Result

`FAIL` — source status `failed`; exact only for `cc34af90297acdfc9a10f4caa78c5f12f5306607`.
