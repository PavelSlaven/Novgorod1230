# M2c v17: five canonical starts in the UI

## Identity

**FAIL.** Real Chrome UI → game-web → production HTTP handler → isolated PostgreSQL fixture. Checkout `codex/live-world-runtime` at `4634738b`; release `spatial-v3-production-v17`. Run began `2026-09-24T21:54:11Z`. Five separate parties were created; this report groups one UI smoke run across the five canonical start families.

Source: `%TEMP%/novgorod-target-http-smoke-56440.json`, SHA-256 `96C1CB8573777722CF7A6611BA632BC4C85304CF3ECE65CCEA09278ADB6B0EE7`. Supplemental start record: `%TEMP%/novgorod-target-official-start-56440.json`, SHA-256 `0AF6F59F1131172E6510714A138D83038802DF0D5605ACD1730AEB0F4B0D4033`.

## Preconditions

Provider: `configured_local_settings`; no model name is recorded in the source. The five starts used isolated PostgreSQL test approvals, not production data. The supplemental forest start record reports zero generative materialization calls and no observed model roles. The HTTP report records seven `turn_step_planner` calls: one for each successful look and two for the failed forest movement. Public start calls took 5.5–7.6 s; successful look calls took 15.1–17.4 s; failed movement took 28.0 s. The production facade exposes no separate start-stage timers.

## Gameplay transcript

Each opening was delivered with `screen_status=ready` and acknowledged. Exact first-screen prose follows.

**Forest** — `novgorod_pine_ridge_approach_v1`, `party:64e87449b5b6a52a4ad7e1f2`:

> Вы — Микула, лесной промысловик. Тело не знает ран, и в нём достаточно сил для работы, а сильного голода нет. На вас нижняя рубаха, штаны и низкая кожаная обувь. День стоит светлый, и в этом свете различимы очертания деревьев.

**Riverbank** — `novgorod_riverbank_approach_v1`, `party:33a3d6ce485af3f983353dab`:

> Вы — Микула, лодочник. Тело не знает ран, в мышцах достаточно сил для работы, а желудок не тревожит сильный голод. На вас штаны, низкая кожаная обувь и нижняя рубаха. День стоит летний, и светлое время суток наполняет пространство вокруг.
>
> Перед вами различима вода. Кромка берега просматривается с той стороны, где вы находитесь. Очертания деревьев видны на фоне, замыкая картину. Тишина или шум, присутствие других людей или их отсутствие — всё это остаётся за пределами вашего текущего восприятия, но сам факт нахождения здесь, на берегу, среди этих элементов, является единственной реальностью, доступной вам прямо сейчас.

**Reed backwater** — `novgorod_reed_backwater_entrance_v1`, `party:3458e8b03f1e986af33ece5c`:

> Вы стоите на низкой земле, где грязь и ил покрывают поверхность, и перед вами раскрывается заводь. Кромка берега видна чётко, а у самой воды тянется нижний ярус растительности: осоки, тростник и болотные травы. На поверхности заметны остатки осок и тростника, а также остатки болотных трав, которые смешиваются с общей сыростью места.
>
> Вы — Микула, рыбак. Ваше тело не ранено, сил достаточно для работы, и сильного голода нет. На вас штаны, нижняя рубаха и низкая кожаная обувь, которые при вас. Местность низкая, и всё вокруг пропитано характером этого болотного края, где вода и растительность сливаются в единое целое.

**Working site** — `novgorod_vikhtuy_work_storage_v1`, `party:59c1be7aec018f9155993dc0`:

> Вы стоите на берегу, где вода встречается с сушей. Вода различима, её поверхность лежит перед вами, а кромка берега очерчивает границу между стихией и землёй. За ней, в глубине, видны очертания деревьев, их силуэты растворяются в дневном свете. Вы — Микула, лесной промысловик, и сейчас вы находитесь в этом месте, где природа раскрывается перед вашими глазами.
>
> Ваше тело не знает ран, силы достаточно для работы, и сильного голода нет. Вы одеты в низкую кожаную обувь, штаны и нижнюю рубаху. Эти предметы при вас, и они определяют ваш облик в этот момент. Дневной свет освещает всё вокруг, и вы видите то, что есть, без лишних слов или предположений.
>
> Вода, берег, деревья — всё это различимо. Вы не ранены, вы готовы к труду, и вы стоите здесь, в этом месте, где лес и вода соседствуют. Это ваш мир, и вы в нём, как промысловик, который знает, что такое работа и природа.

**Residential yards** — `novgorod_vikhtuy_household_cluster_v1`, `party:e9a581c077e7ae5248d9246c`:

> Вы — Микула, лесной промысловик. Тело не знает ран, и в нём достаточно сил для работы, а сильный голод не тревожит. На вас штаны, нижняя рубаха и низкая кожаная обувь. День стоит светлый, и вы стоите там, где различима вода, кромка берега и очертания деревьев.

Exact first player input in every party: `Осматриваюсь вокруг, оставаясь на месте.` All five turns committed as turn 1, with no check or movement. Player-visible responses:

| Family | Exact response |
|---|---|
| Forest | Вы внимательно изучаете обстановку. Различимы очертания деревьев. В поле зрения — Проход 1. В поле зрения — Продолжить путь — выход 2. |
| Riverbank | Вы внимательно изучаете обстановку. Различаете воду, кромку берега и очертания деревьев. В поле зрения находятся Проход 1 и Продолжить путь — выход 1. |
| Reed backwater | Вы внимательно изучаете обстановку. Поверхность покрыта грязью и илом, местность низкая. Впереди видна заводь и кромка берега, у воды растет нижний ярус растительности: осоки, тростник и болотные травы. На поверхности заметны остатки осок, тростника и болотных трав. В поле зрения находятся Проход 1, Продолжить путь — выход 1, Продолжить путь — выход 2 и По руслу — выход 3. |
| Working site | Вы внимательно изучаете обстановку: различаете воду, кромку берега и очертания деревьев, а в поле зрения находится Проход 1. |
| Residential yards | Вы внимательно изучаете обстановку. Различимая вода, кромка берега и очертания деревьев образуют единый вид, в котором в поле зрения находится Проход 1. |

Forest then submitted exact input `Проход 1`. The model returned `resolution=domain_request`, `operation_choice=domain_operation_15_request_movement_local` on both attempts, but preflight rejected `$.operations.0` with `TURN_STEP_PLAN_INVALID` / `domain_owner_unavailable` (`repair_attempted=true`). HTTP error reported `turn_commit_status=not_started`. No movement result or second turn was delivered. Other families had no movement attempt.

## Persistence/readback

For each successful look, the isolated DB report shows clock `261120 → 261121`, snapshots `1 → 2`, one materialization run and one site both before and after; finite sources and decrements are `null` in the report, so stock behavior was not established. Forest retry used the same request/idempotency key: turn stayed 1, clock stayed `261121`, snapshots stayed 2, and the screen digest stayed `5ca1040835cf868d660b0b16d9919219701a4a6b2497a3631e560096e8483290`. Two subsequent `getPartyScreen` reads returned that same digest and prose. Failed movement left clock, snapshots, materialization count and site count unchanged.

## Findings

- Forest local `Проход 1` is blocked before domain execution despite the model's exact movement choice; the UI run cannot establish traversal or later scene behavior.
- Working site and residential yards openings and first looks disclose only water, shore, tree outlines and one passage. Neither shows people, work, storage or households in visible content. This is an observed content gap, not evidence that those entities are absent from the world.
- All five first looks succeeded, but this run did not exercise finite stock consumption or subsequent actions in four families.

## Result

**FAIL** for the five-family UI smoke target: first screens and first looks worked; forest local traversal blocked the continuation. The source report ends `browser.status=blocked` with `TURN_STEP_PLAN_INVALID`.
