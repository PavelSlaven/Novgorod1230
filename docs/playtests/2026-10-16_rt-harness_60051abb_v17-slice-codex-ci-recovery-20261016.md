# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_work_storage_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `codex/d49-integration`, HEAD `60051abb2752a85faff14a47714c39506575e0ff` (рабочее дерево с незакоммиченными правками).
- Прогон `codex-ci-recovery-20261016`: 2026-10-16T06:33:53.188Z — 2026-10-16T06:56:47.802Z (1375 с).
- Сценарий `novgorod_vikhtuy_work_storage_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `[temporary settings location omitted]` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **реальный Giga**.
- Бюджет: 24 ходов (из них 3 зарезервированы под make), дедлайн 26 мин.
- Квалификация модели при старте: выполнена, 19 вызовов LLM.

## Gameplay transcript

### Подача ходов

- Проза: 21; фактический экран: 0; ожидание: 0; пусто: 0.

### Открытие партии

- Партия `party:72016c989c7ee8864ba4dfa4`; попыток new-game: 1; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 0.

Попытки вступления (new-game):

| # | исход | коды | repair | concerns | prose (начало) | prose до repair | коды до repair |
|---:|---|---|---|---|---|---|---|
| 1 | accepted | — | нет | — | Вы стоите среди деревьев, где свет дня кажется приглушённым и рассеянным. Небо с | — | — |

Что увидел игрок (дословно):

> Вы стоите среди деревьев, где свет дня кажется приглушённым и рассеянным. Небо скрыто от глаз, а видимость настолько плохая, что пространство вокруг словно затянуто плотной дымкой. Ветер не треплет листву, воздух неподвижен, и нет ни единого признака осадков. Это лето, и день уже в самом разгаре, но здесь, в глубине леса, время течёт иначе.
>
> Вы не ранены, и в теле достаточно сил для работы. Сильный голод не мучает, позволяя сосредоточиться на текущих делах. Вы — Микула, лесной промысловик, и ваша жизнь неразрывно связана с этим местом. На вас надета нижняя рубаха, штаны и низкая кожаная обувь, которые давно стали частью вашего быта. В этой тишине и полумраке вы продолжаете свой труд, опираясь только на то, что видите и чувствуете прямо сейчас.

Проходы на первом экране: «по глинистой тропе», «травяным проходом»

- Условия видимости (открытие): `{"admission_source":"unknown","admitted_npcs_count":null,"admitted_npc_keys":null,"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"unknown","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (после подтверждения открытия): `{"admission_source":"unknown","admitted_npcs_count":null,"admitted_npc_keys":null,"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"unknown","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.

### Ход 1 · нога walk out

- Ввод игрока: «по глинистой тропе»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 0 → 1; размещения в G6 игрока: 2 → 1; запас m2c_finite_driftwood_v1:a8dacb1c0f978be2e99887cc: — → 100; новые предметы: item_942224010b638f89ec01bf4a, item_a7a3bb30178e72803bd3b9c4, item_d76d4d6a2213810082381137, item_f6a0f5c53e7009becffe9d71
- Вызовов LLM за ход: 5 · 55 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_1f4ed01ec4aad3277be15522"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 1, before): `{"admission_source":"unknown","admitted_npcs_count":null,"admitted_npc_keys":null,"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"unknown","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 1, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 1, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Вы прибыли к речному берегу.

Проходы на экране: «Дальше», «по ровной пойменной земле», «по глинистой тропе»

### Ход 2 · нога walk out

- Ввод игрока: «по глинистой тропе»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 1 → 2; размещения в G6 игрока: 1 → 2
- Вызовов LLM за ход: 5 · 40 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_657d7f5c8e2b6913c4a0d14c","npc_db21e30b2edaca1683a00fc6"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 2, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 2, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 2, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Вы прибыли на хозяйственный двор.

Проходы на экране: «Обратно», «по глинистой тропе», «травяным проходом»

### Ход 3 · нога walk out

- Ввод игрока: «по глинистой тропе»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 2 → 3; размещения в G6 игрока: 2 → 1
- Вызовов LLM за ход: 5 · 38 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_1f4ed01ec4aad3277be15522"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 3, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 3, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 3, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Вы прибыли к речному берегу.

Проходы на экране: «Дальше», «по ровной пойменной земле», «по глинистой тропе»

### Ход 4 · нога walk out

- Ввод игрока: «Дальше»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus; state_version 3 → 4
- Вызовов LLM за ход: 5 · 34 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_1f4ed01ec4aad3277be15522"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 4, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 4, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 4, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето, день. Стоит светлое время, но небо не видно. Осадков нет, видимость плохая, ветер отсутствует или слабый. Ты стоишь у речного берега.

Проходы на экране: «Обратно», «Дальше», «по ровной пойменной земле», «по глинистой тропе»

### Ход 5 · нога walk out

- Ввод игрока: «Дальше»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure; state_version 4 → 5
- Вызовов LLM за ход: 5 · 40 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_1f4ed01ec4aad3277be15522"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 5, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 5, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 5, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето. День. Стоит светлое время дня. Небо не видно. Осадков нет. Видимость плохая. Ветер отсутствует или слабый.

Проходы на экране: «Обратно», «по ровной пойменной земле», «по глинистой тропе»

### Ход 6 · нога walk out

- Ввод игрока: «Обратно»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus; state_version 5 → 6
- Вызовов LLM за ход: 5 · 33 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_1f4ed01ec4aad3277be15522"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 6, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 6, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 6, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето, день. Стоит светлое время, но небо не видно. Осадков нет, видимость плохая, ветер отсутствует или слабый.

Проходы на экране: «Обратно», «Дальше», «по ровной пойменной земле», «по глинистой тропе»

### Ход 7 · нога walk out

- Ввод игрока: «Обратно»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 6 → 7
- Вызовов LLM за ход: 5 · 33 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_1f4ed01ec4aad3277be15522"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 7, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 7, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 7, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето, день. Стоит светлое время, но небо не видно. Осадков нет, видимость плохая, ветер отсутствует или слабый.

Проходы на экране: «Дальше», «по ровной пойменной земле», «по глинистой тропе»

### Ход 8 · нога walk out

- Ввод игрока: «по ровной пойменной земле»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival; state_version 7 → 8; размещения в G6 игрока: 1 → 1; запас m2c_finite_deadwood_v1:04ed8c9abea54defe243589e: — → 60; новые предметы: item_105a5d45be4696b211acf1d8, item_2eeb4d48b9403320eb3b785a, item_3ae4afe74817ec41fa3ba735
- Вызовов LLM за ход: 5 · 39 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_fe63a6c3153f7d2e71042a83"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 8, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 8, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 8, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Вы прибыли к речному берегу.

Проходы на экране: «Дальше», «тропой среди кустов», «по ровной пойменной земле», «кустарниковой тропой»

### Ход 9 · нога walk out

- Ввод игрока: «по ровной пойменной земле»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure; state_version 8 → 9; размещения в G6 игрока: 1 → 1
- Вызовов LLM за ход: 5 · 47 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_1f4ed01ec4aad3277be15522"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 9, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 9, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 9, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Вы прибыли к речному берегу.

Проходы на экране: «Обратно», «по ровной пойменной земле», «по глинистой тропе»

### Ход 10 · нога walk out

- Ввод игрока: «по ровной пойменной земле»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival; state_version 9 → 10; размещения в G6 игрока: 1 → 1
- Вызовов LLM за ход: 7 · 46 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_fe63a6c3153f7d2e71042a83"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 10, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 10, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 10, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Вы прибыли.

Проходы на экране: «Дальше», «тропой среди кустов», «по ровной пойменной земле», «кустарниковой тропой»

### Ход 11 · нога walk out

- Ввод игрока: «Дальше»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus; state_version 10 → 11
- Вызовов LLM за ход: 5 · 42 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_fe63a6c3153f7d2e71042a83"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 11, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 11, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 11, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето. День. Стоит светлое время дня. Небо не видно. Осадков нет. Видимость плохая. Ветер отсутствует или слабый.

Проходы на экране: «Обратно», «Дальше», «тропой среди кустов», «по ровной пойменной земле», «кустарниковой тропой»

### Ход 12 · нога walk out

- Ввод игрока: «Дальше»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@departure; state_version 11 → 12
- Вызовов LLM за ход: 5 · 38 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_fe63a6c3153f7d2e71042a83"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 12, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 12, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 12, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето. День. Стоит светлое время дня. Небо не видно. Осадков нет. Видимость плохая. Ветер отсутствует или слабый.

Проходы на экране: «Обратно», «тропой среди кустов», «по ровной пойменной земле», «кустарниковой тропой»

### Ход 13 · нога walk out

- Ввод игрока: «Обратно»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus; state_version 12 → 13
- Вызовов LLM за ход: 5 · 32 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_fe63a6c3153f7d2e71042a83"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 13, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 13, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 13, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето. День. Стоит светлое время дня. Небо не видно. Осадков нет. Видимость плохая. Ветер отсутствует или слабый.

Проходы на экране: «Обратно», «Дальше», «тропой среди кустов», «по ровной пойменной земле», «кустарниковой тропой»

### Ход 14 · нога walk out

- Ввод игрока: «Обратно»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival; state_version 13 → 14
- Вызовов LLM за ход: 5 · 37 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_fe63a6c3153f7d2e71042a83"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 14, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 14, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 14, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето. День. Стоит светлое время дня. Небо не видно. Осадков нет. Видимость плохая. Ветер отсутствует или слабый.

Проходы на экране: «Дальше», «тропой среди кустов», «по ровной пойменной земле», «кустарниковой тропой»

### Ход 15 · нога walk out

- Ввод игрока: «тропой среди кустов»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@arrival; state_version 14 → 15; размещения в G6 игрока: 1 → 1; новые предметы: item_4615afb817cc275df1601e41, item_765dfa8408d8cf01e6b9b1be, item_8c8707caa2f1591946cbd60c
- Вызовов LLM за ход: 5 · 41 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_74d2df7f217adf695e55f05d"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 15, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 15, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 15, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Вы прибыли к речному берегу.

Проходы на экране: «Дальше», «по глинистой низине», «тропой среди кустов»

### Ход 16 · нога walk out

- Ввод игрока: «тропой среди кустов»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@departure; state_version 15 → 16; размещения в G6 игрока: 1 → 1
- Вызовов LLM за ход: 5 · 46 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_fe63a6c3153f7d2e71042a83"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 16, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 16, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 16, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Вы прибыли к речному берегу.

Проходы на экране: «Обратно», «тропой среди кустов», «по ровной пойменной земле», «кустарниковой тропой»

### Ход 17 · нога walk out

- Ввод игрока: «тропой среди кустов»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@arrival; state_version 16 → 17; размещения в G6 игрока: 1 → 1
- Вызовов LLM за ход: 5 · 39 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_74d2df7f217adf695e55f05d"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 17, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 17, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 17, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Вы прибыли к речному берегу.

Проходы на экране: «Дальше», «по глинистой низине», «тропой среди кустов»

### Ход 18 · нога walk out

- Ввод игрока: «Дальше»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@focus; state_version 17 → 18
- Вызовов LLM за ход: 5 · 38 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_74d2df7f217adf695e55f05d"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 18, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 18, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 18, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето, день. Стоит светлое время, но небо не видно. Осадков нет, видимость плохая, ветер отсутствует или слабый.

Проходы на экране: «Обратно», «Дальше», «по глинистой низине», «тропой среди кустов»

### Ход 19 · нога walk out

- Ввод игрока: «Дальше»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@departure; state_version 18 → 19
- Вызовов LLM за ход: 5 · 35 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_74d2df7f217adf695e55f05d"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 19, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 19, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 19, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето, день. Стоит светлое время, но небо не видно. Осадков нет, видимость плохая, ветер отсутствует или слабый.

Проходы на экране: «Обратно», «по глинистой низине», «тропой среди кустов»

### Ход 20 · нога walk out

- Ввод игрока: «Обратно»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@focus; state_version 19 → 20
- Вызовов LLM за ход: 5 · 35 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_74d2df7f217adf695e55f05d"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 20, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 20, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 20, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето. День. Стоит светлое время дня. Небо не видно. Осадков нет. Видимость плохая. Ветер отсутствует или слабый.

Проходы на экране: «Обратно», «Дальше», «по глинистой низине», «тропой среди кустов»

### Ход 21 · нога walk out

- Ввод игрока: «Обратно»
- HTTP: 200
- Commit-state: committed; подача: narrated
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@arrival; state_version 20 → 21
- Вызовов LLM за ход: 5 · 32 с

- Снимок панели людей: `{"panel_exists":false,"visible":null,"visible_npcs_count":0,"people_count":0,"active_interlocutor_exists":false,"placement_npc_ids":["npc_74d2df7f217adf695e55f05d"],"visible_context_npc_keys":[]}`
- Условия видимости (ход 21, before): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 21, response): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
- Условия видимости (ход 21, after): `{"admission_source":"visible_context","admitted_npcs_count":0,"admitted_npc_keys":[],"panel_exists":false,"panel_visible":null,"panel_people_count":0,"current_light_phase":"daylight","weather":"unknown","local_light":"unknown","visibility_factors":"unknown"}`.
Что увидел игрок (дословно):

> Лето, день. Стоит светлое время, но небо не видно. Осадков нет, видимость плохая, ветер отсутствует или слабый. Ты стоишь у речного берега.

Проходы на экране: «Дальше», «по глинистой низине», «тропой среди кустов»

## Persistence/readback

LLM-вызовы за прогон: 128 (ошибок транспорта/статуса: 0); по ролям:

```
42× world_knowledge_query_planner
21× turn_step_planner
21× gameplay_narrator
22× gameplay_narrator_auditor
1× gameplay_narrator_semantic_repair
```

### Время вызовов по каноническим ролям

| role_id | вызовы | сумма, мс | p50, мс | p95, мс | доля времени ходов |
|---|---:|---:|---:|---:|---:|
| world_knowledge_query_planner | 42 | 94960 | 1209 | 4760 | 11.6% |
| turn_step_planner | 21 | 268102 | 12268 | 17679 | 32.7% |
| gameplay_narrator | 21 | 42604 | 2047 | 2329 | 5.2% |
| gameplay_narrator_auditor | 22 | 106290 | 4316 | 7901 | 13.0% |
| gameplay_narrator_semantic_repair | 1 | 2198 | 2198 | 2198 | 0.3% |

Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):

```
{
 "state_version": "21",
 "player_character_ref": {
  "entity_id": "player_character_2f66aab1651f51cefbbdb03b",
  "entity_kind": "player_character"
 },
 "position": {
  "slot": "arrival",
  "origin": "canonical",
  "site_id": "canonical:a2cea5cff877f9b56946e21579d0aa92a2e15eab65f88cc38dc49a90706bacd5:site",
  "position_id": "canonical:a2cea5cff877f9b56946e21579d0aa92a2e15eab65f88cc38dc49a90706bacd5:baseline:position:arrival:0",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area",
  "g6_instance_id": "canonical:a2cea5cff877f9b56946e21579d0aa92a2e15eab65f88cc38dc49a90706bacd5:baseline:g6:main",
  "generated_template": null
 },
 "placements_here": [
  {
   "slot": "focus",
   "entity_id": "npc_74d2df7f217adf695e55f05d",
   "entity_kind": "npc",
   "occupies_capacity_units": 1
  }
 ],
 "npc_placements_all": [
  {
   "slot": "focus",
   "entity_id": "npc_1f4ed01ec4aad3277be15522",
   "position_id": "canonical:b5515b91d2e5568750d60ca3445b6d537e3e3745dff77aa431e01f868d5fc91d:baseline:position:focus:0",
   "g6_instance_id": "canonical:b5515b91d2e5568750d60ca3445b6d537e3e3745dff77aa431e01f868d5fc91d:baseline:g6:main"
  },
  {
   "slot": "departure",
   "entity_id": "npc_657d7f5c8e2b6913c4a0d14c",
   "position_id": "baseline:g5_node_37aa9b168b037a4253362991:position:departure:0",
   "g6_instance_id": "baseline:g5_node_37aa9b168b037a4253362991:g6:main"
  },
  {
   "slot": "focus",
   "entity_id": "npc_74d2df7f217adf695e55f05d",
   "position_id": "canonical:a2cea5cff877f9b56946e21579d0aa92a2e15eab65f88cc38dc49a90706bacd5:baseline:position:focus:0",
   "g6_instance_id": "canonical:a2cea5cff877f9b56946e21579d0aa92a2e15eab65f88cc38dc49a90706bacd5:baseline:g6:main"
  },
  {
   "slot": "focus",
   "entity_id": "npc_db21e30b2edaca1683a00fc6",
   "position_id": "baseline:g5_node_37aa9b168b037a4253362991:position:focus:0",
   "g6_instance_id": "baseline:g5_node_37aa9b168b037a4253362991:g6:main"
  },
  {
   "slot": "focus",
   "entity_id": "npc_fe63a6c3153f7d2e71042a83",
   "position_id": "canonical:238c37c8985d2cd8962c7a2d5b2375ed2b879b59fdad8763e7af6906112d57e3:baseline:position:focus:0",
   "g6_instance_id": "canonical:238c37c8985d2cd8962c7a2d5b2375ed2b879b59fdad8763e7af6906112d57e3:baseline:g6:main"
  }
 ],
 "items": [
  {
   "holder": "player_character_2f66aab1651f51cefbbdb03b",
   "item_id": "item_06de5bf76ce27e526b29c30e",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_105a5d45be4696b211acf1d8",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_28582cbae782437c5da70057",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_2eeb4d48b9403320eb3b785a",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_3ae4afe74817ec41fa3ba735",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_4615afb817cc275df1601e41",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_765dfa8408d8cf01e6b9b1be",
   "position": "equipped"
  },
  {
   "holder": "player_character_2f66aab1651f51cefbbdb03b",
   "item_id": "item_84505e40be6cf5e84084d3e3",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_8c8707caa2f1591946cbd60c",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_911b2adcf255736446472f4b",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_942224010b638f89ec01bf4a",
   "position": "equipped"
  },
  {
   "holder": "player_character_2f66aab1651f51cefbbdb03b",
   "item_id": "item_9464a936f06b51be77f39234",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_a7a3bb30178e72803bd3b9c4",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_d76d4d6a2213810082381137",
   "position": "hands"
  },
  {
   "holder": null,
   "item_id": "item_da63e6919ab73f5a3f105da4",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_edcdfa52b8de220ff494e8a0",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_f30c250292eda23c28480454",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_f6a0f5c53e7009becffe9d71",
   "position": "equipped"
  }
 ],
 "party_items": [
  {
   "item_id": "item_06de5bf76ce27e526b29c30e",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_105a5d45be4696b211acf1d8",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_28582cbae782437c5da70057",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_2eeb4d48b9403320eb3b785a",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_3ae4afe74817ec41fa3ba735",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_4615afb817cc275df1601e41",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_765dfa8408d8cf01e6b9b1be",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_84505e40be6cf5e84084d3e3",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_8c8707caa2f1591946cbd60c",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_911b2adcf255736446472f4b",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_942224010b638f89ec01bf4a",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_9464a936f06b51be77f39234",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_a7a3bb30178e72803bd3b9c4",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_d76d4d6a2213810082381137",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_da63e6919ab73f5a3f105da4",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_edcdfa52b8de220ff494e8a0",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_f30c250292eda23c28480454",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_f6a0f5c53e7009becffe9d71",
   "state_version": 1,
   "action_production": false
  }
 ],
 "resource_nodes": [
  {
   "site_id": "canonical:238c37c8985d2cd8962c7a2d5b2375ed2b879b59fdad8763e7af6906112d57e3:site",
   "state_version": 1,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_deadwood_v1:04ed8c9abea54defe243589e",
   "quantity_numerator": 60,
   "quantity_denominator": 1
  },
  {
   "site_id": "canonical:b5515b91d2e5568750d60ca3445b6d537e3e3745dff77aa431e01f868d5fc91d:site",
   "state_version": 1,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_driftwood_v1:a8dacb1c0f978be2e99887cc",
   "quantity_numerator": 100,
   "quantity_denominator": 1
  }
 ],
 "resource_decrements": [],
 "npc_statements": []
}
```

## Findings

| нога | итог | причина |
|---|---|---|
| start | pass | партия party:72016c989c7ee8864ba4dfa4, место vikhtuy_locality_work_storage |
| walk out | pass | места Вихтуя по ходу: vikhtuy_locality_work_storage → vikhtuy_locality_water_access → vikhtuy_locality_forest_path → vikhtuy_locality_meeting_area |
| meet | blocked | восприятие не допускает NPC при текущих условиях на местах: vikhtuy_locality_work_storage, vikhtuy_locality_water_access, vikhtuy_locality_forest_path, vikhtuy_locality_meeting_area (бюджет ходов исчерпан) |
| talk | blocked | нет видимого NPC: meet не пройден (бюджет ходов исчерпан) |
| take | blocked | talk не пройден: нет видимого NPC: meet не пройден (бюджет ходов исчерпан) |
| make | blocked | talk не пройден: нет видимого NPC: meet не пройден (бюджет ходов исчерпан) |

- **walk out**: ходов движения: 21, из них без смены места: 12
- **meet**: NPC-размещений во всей партии по SQL: 5

## Result

D49 minimum (start, walk, meet, talk и take или make): **PARTIAL**; путь предмета не пройден.

Строгий результат: **PARTIAL**: start — pass; walk out — pass; meet — blocked; talk — blocked; take — blocked; make — blocked.

## Codex review: CI recovery, before feature integration

This run exercised the prepared no-ff merge of `f314f1d63` into `60051abb2`. The checkout was intentionally uncommitted during the run; tracked source content was verified identical to the audited CI-recovery commit. The transcript above is unchanged; only the temporary configuration-file location was redacted. This was the existing HTTP runner, not browser acceptance.

Start and movement passed on a fresh isolated party: four Vikhtuy sites were visited in 21 committed movement turns, without transport errors or infrastructure/cleanup failures. Meet remained blocked: perception admitted no NPC within the turn budget despite five SQL placements. Talk and item legs therefore remain untested. The run does not establish the cause of missing perception and does not accept D49. The planned NPC perception branch and conversation/item/prose changes have not yet been integrated.

CI-recovery code received an independent Contract Auditor PASS. Focused PostgreSQL/unit checks, Node 22 reproduction, syntax, architecture, documentation and knowledge checks passed before this merge. The complete test suite on the published merge HEAD remains required in CI. No existing party or model service was changed; temporary database cleanup completed.
