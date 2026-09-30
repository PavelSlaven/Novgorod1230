# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_household_cluster_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `fleet/rt-lines`, HEAD `d2504e2e93cc4b985caffa36c768ed8813af7159`.
- Прогон `rtl0hh`: 2026-09-30T14:30:04.787Z — 2026-09-30T14:51:39.851Z (1295 с).
- Сценарий `novgorod_vikhtuy_household_cluster_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `/srv/novgorod-work/prose-test/llm-settings.json` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **реальный Giga**.
- Бюджет: 30 ходов (из них 3 зарезервированы под make), дедлайн 24 мин.
- Квалификация модели при старте: выполнена, 19 вызовов LLM.

## Gameplay transcript

### Открытие партии

- Партия `party:db59e5bc20d026ae98671197`; попыток new-game: 2; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 1.

Что увидел игрок (дословно):

> Вы — Микула, лесной промысловик. Летний день 1230 года разлит вокруг, наполняя воздух светом, который не требует усилий для восприятия. Ваше тело не знает ран; в нём достаточно сил для работы, и сильного голода нет. Это состояние покоя и готовности, в котором вы находитесь прямо сейчас, в этой точке пространства и времени.
> 
> На вас надеты штаны и нижняя рубаха, а ноги обуты в низкую кожаную обувь. Эти предметы плотно прилегают к телу, определяя ваш облик и готовность к повседневным действиям. Они являются частью вашего текущего состояния, неотделимой от того, кто вы есть в этот момент. Место, где вы стоите, не молчит и не пусто, хотя конкретные звуки или предметы, помимо вашей одежды, не выделены в вашем восприятии.
> 
> Вы находитесь в локальности Виктуя, в летописном 1230 году. Время суток — день, и свет падает на вас без преград. Ваше положение здесь не связано с предыдущим путешествием или конкретной целью, которые не были вам сообщены. Вы просто находитесь здесь, в состоянии готовности, с телом, готовым к труду, и одеждой, соответствующей вашему промыслу.

Проходы на первом экране: «Проход 3», «Проход 4»

### Ход 1 · нога talk

- Ввод игрока: «Здороваюсь с человеком и спрашиваю, как его зовут.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 0 → 1; реплик NPC в снимке: +1
- Вызовов LLM за ход: 10 · 55 с

Что увидел игрок (дословно):

> Андрей говорит: «Здравствуй. Я Андрей.» Ты не знаешь, сообщил ли он всё, что знает.

Люди на экране: «Андрей»

### Ход 2 · нога walk out

- Ввод игрока: «Осматриваюсь вокруг.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 1 → 2
- Вызовов LLM за ход: 5 · 35 с

Что увидел игрок (дословно):

> Вы внимательно изучаете обстановку. В поле зрения — Андрей, Проход 1, Проход 3 и Проход 4. Андрей говорит: «Здравствуй. Я Андрей.»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «Андрей»

### Ход 3 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 2 → 3
- Вызовов LLM за ход: 8 · 42 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Андрей говорит: «Здравствуй. Я Андрей». Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «Андрей»

### Ход 4 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival; state_version 3 → 4
- Вызовов LLM за ход: 5 · 35 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Андрей говорит: «Здравствуй. Я Андрей». Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «Андрей»

### Ход 5 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 4 → 5
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Андрей говорит: «Здравствуй. Я Андрей». Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «Андрей»

### Ход 6 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 5 → 6
- Вызовов LLM за ход: 5 · 32 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Андрей говорит: «Здравствуй. Я Андрей.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «Андрей»

### Ход 7 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 6 → 7
- Вызовов LLM за ход: 5 · 34 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Андрей говорит: «Здравствуй. Я Андрей». Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «Андрей»

### Ход 8 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 7 → 8
- Вызовов LLM за ход: 5 · 31 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Андрей говорит: «Здравствуй. Я Андрей.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «Андрей»

### Ход 9 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 8 → 9; размещения в G6 игрока: 1 → 0
- Вызовов LLM за ход: 5 · 43 с

Что увидел игрок (дословно):

> Окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 10 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 9 → 10
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 11 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 10 → 11
- Вызовов LLM за ход: 7 · 39 с

Что увидел игрок (дословно):

> Перемещаясь в пределах текущего места, вы находитесь в Окрестностях; вас зовут Микула, и вы — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 12 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 11 → 12
- Вызовов LLM за ход: 7 · 38 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущих окрестностей, где вы, Микула, лесной промысловик, находитесь.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 13 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 12 → 13
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, обозревая окрестности. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 14 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 13 → 14
- Вызовов LLM за ход: 5 · 32 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 15 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 14 → 15
- Вызовов LLM за ход: 7 · 39 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 16 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 15 → 16; запас m2c_finite_driftwood_v1:21aa0718fa7a11c8f388cf42: — → 100
- Вызовов LLM за ход: 5 · 43 с

Что увидел игрок (дословно):

> Окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 17 · нога take

- Ввод игрока: «Беру плавник.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 16 → 17; запас m2c_finite_driftwood_v1:21aa0718fa7a11c8f388cf42: 100 → 99; новые предметы: ordinary_item_9167d0e637aeaf8f6d6b5837
- Вызовов LLM за ход: 11 · 49 с

Что увидел игрок (дословно):

> Вы замечаете «Плавник», берёте его, и он оказывается в ваших руках.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 18 · нога make

- Ввод игрока: «Оторву полосу от подола рубахи.»
- HTTP: 409, ошибка WORLD_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 17 → 17
- Причина на сервере (внутренняя, только в логе; в HTTP — публичная категория или маскировка): M2C_TARGET_A1_APPLICABILITY_DATA_GAP: M2C_TARGET_A1_APPLICABILITY_DATA_GAP
- Вызовов LLM за ход: 4 · 44 с

Что увидел игрок (дословно):

> Ход не сохранён. Для этого действия не хватает данных мира.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 19 · нога make

- Ввод игрока: «Оторву лоскут от нижней рубахи.»
- HTTP: 409, ошибка TURN_NOT_SAVED (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 17 → 17
- Причина на сервере (внутренняя, только в логе; в HTTP — публичная категория или маскировка): TURN_STEP_PLAN_INVALID: Turn-step semantic grounding is invalid. [action_production_identity_grounding]
- Вызовов LLM за ход: 4 · 52 с

Что увидел игрок (дословно):

> Ход не сохранён. Попробуйте сформулировать действие иначе.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 20 · нога make

- Ввод игрока: «Отрежу кусок от штанов на повязку.»
- HTTP: 409, ошибка TURN_NOT_SAVED (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 17 → 17
- Причина на сервере (внутренняя, только в логе; в HTTP — публичная категория или маскировка): TURN_STEP_PLAN_INVALID: TURN_STEP_PLAN_INVALID: $.operations[0].action_production.result_descriptor.source_fact_delta only a surviving partial source requires a fact delta; $.operations[0].action_production.material_extent material extent must match the physical identity transition [identity_shape; material_extent_shape]
- Вызовов LLM за ход: 3 · 38 с

Что увидел игрок (дословно):

> Ход не сохранён. Попробуйте сформулировать действие иначе.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

## Persistence/readback

LLM-вызовы за прогон: 145 (ошибок транспорта/статуса: 0); по ролям:

```
13× Return only one JSON object containing the ordinary semantic
27× You are a strict evidence auditor of Russian game prose. Sil
19× Return only {"prose":"<complete Russian prose>"}. The server
5× Return only {"prose":"<complete opening>"}. Write 2-4 connec
5× Return only {"pass":<boolean>,"failed_checks":["<required ch
42× Return only one JSON object with exactly these six keys: sch
24× Return only one JSON object containing the semantic choice f
2× Return only one plain JSON object with the semantic conversa
4× Return only {"pass":true,"concerns":[]} or {"pass":false,"co
3× Return only {"replacements":[{"prose":"<complete repaired Ru
1× Return only JSON with exactly mode and support_refs. mode is
```

Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):

```
{
 "state_version": "17",
 "position": {
  "slot": "arrival",
  "origin": "canonical",
  "site_id": "canonical:89f180ef26e38255eac83feddb02ed36cb2f54eb9a47da65b24cd220a673af63:site",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access",
  "generated_template": null
 },
 "placements_here": [],
 "npc_placements_all": [
  {
   "slot": "focus",
   "entity_id": "npc_53c4d144147f1d57c11c76fb",
   "g6_instance_id": "baseline:g5_node_0af19cb9ae8b11b4bc9f1676:g6:main"
  }
 ],
 "items": [
  {
   "holder": "player_character_8f0c18a03cd40d39ad5ab64c",
   "item_id": "item_0dcc02a4bcf4d7a8b962828f",
   "position": "equipped"
  },
  {
   "holder": "player_character_8f0c18a03cd40d39ad5ab64c",
   "item_id": "item_19608b902a8829613b6c4039",
   "position": "equipped"
  },
  {
   "holder": "player_character_8f0c18a03cd40d39ad5ab64c",
   "item_id": "item_2dfc721db8367b98fc13590a",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_46eaaf91c0e44ab2392e9f49",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_65ed30b3edd73d8ea5795c54",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_762e7a20851bda796a17ef18",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_fe94c0e25264ade14359a7df",
   "position": "hands"
  },
  {
   "holder": "player_character_8f0c18a03cd40d39ad5ab64c",
   "item_id": "ordinary_item_9167d0e637aeaf8f6d6b5837",
   "position": "hands"
  }
 ],
 "party_items": [
  {
   "item_id": "item_0dcc02a4bcf4d7a8b962828f",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_19608b902a8829613b6c4039",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_2dfc721db8367b98fc13590a",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_46eaaf91c0e44ab2392e9f49",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_65ed30b3edd73d8ea5795c54",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_762e7a20851bda796a17ef18",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_fe94c0e25264ade14359a7df",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "ordinary_item_9167d0e637aeaf8f6d6b5837",
   "state_version": 1,
   "action_production": false
  }
 ],
 "resource_nodes": [
  {
   "state_version": 2,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_driftwood_v1:21aa0718fa7a11c8f388cf42",
   "quantity_numerator": 99,
   "quantity_denominator": 1
  }
 ],
 "resource_decrements": [
  {
   "after_numerator": 99,
   "before_numerator": 100,
   "resource_node_id": "m2c_finite_driftwood_v1:21aa0718fa7a11c8f388cf42",
   "decrement_numerator": 1
  }
 ],
 "npc_statements": [
  {
   "claims": [],
   "schema": "conversation_statement_event_v1",
   "duration": {
    "owner": "approved_activity_contract",
    "activity_ref": "novgorod_live_world_conversation_brief"
   },
   "spoken_at": {
    "whole_minutes": "261123",
    "subminute_numerator": "0",
    "subminute_denominator": "1"
   },
   "topic_refs": [],
   "exchange_id": "exchange:c297d5e461c2deb5c8250648e220c10f",
   "speaker_ref": {
    "entity_id": "npc_53c4d144147f1d57c11c76fb",
    "entity_kind": "npc"
   },
   "dominant_act": "answer",
   "statement_id": "statement:c297d5e461c2deb5c8250648e220c10f202107314e16dbc6e39f37d918b35137:2",
   "utterance_text": "Здравствуй. Я Андрей.",
   "conversation_id": "conversation:c297d5e461c2deb5c8250648e220c10f",
   "source_plan_ref": {
    "entity_id": "semantic-plan:c297d5e461c2deb5c8250648e220c10f202107314e16dbc6e39f37d918b35137:2",
    "entity_kind": "semantic_plan"
   },
   "interaction_tags": [],
   "message_completeness": "complete",
   "social_delivery_result": null,
   "intended_addressee_refs": [
    {
     "entity_id": "player_character_8f0c18a03cd40d39ad5ab64c",
     "entity_kind": "player_character"
    }
   ]
  }
 ]
}
```

## Findings

| нога | итог | причина |
|---|---|---|
| start | pass | партия party:db59e5bc20d026ae98671197, место vikhtuy_locality_household_cluster |
| walk out | pass | места Вихтуя по ходу: vikhtuy_locality_household_cluster → vikhtuy_locality_work_storage → vikhtuy_locality_water_access |
| meet | pass | на месте vikhtuy_locality_household_cluster: NPC по SQL npc_53c4d144147f1d57c11c76fb |
| talk | pass | реплика NPC записана (+1) |
| take | pass | запас m2c_finite_driftwood_v1:21aa0718fa7a11c8f388cf42: 100 → 99, предмет в руках |
| make | fail | все 3 фразы без предмета; последняя причина: ход не прошёл: TURN_NOT_SAVED |

- **start**: отказов открытия до успеха: 1
- **walk out**: ходов движения: 15, из них без смены места: 13; на стартовом экране проходов не было, понадобился «Осматриваюсь вокруг.»
- **meet**: на экране: панель людей пуста; NPC в G6 игрока по SQL: 1
- **talk**: последняя реплика NPC в снимке: {"claims":[],"schema":"conversation_statement_event_v1","duration":{"owner":"approved_activity_contract","activity_ref":"novgorod_live_world_conversation_brief"},"spoken_at":{"whole_minutes":"261123","subminute_numerator":"0","subminute_denominator":"1"},"topic_refs":[],"exchange_id":"exchange:c297d5e461c2deb5c8250648e220c10f","speaker_ref":{"entity_id":"npc_53c4d144147f1d57c11c76fb","entity_kind":"npc"},"dominant_act":"answer","statement_id":"statement:c297d5e461c2deb5c8250648e220c10f202107314e16dbc6e39f37d918b35137:2","utterance_text":"Здравствуй. Я Андрей.","conversation_id":"conversation:c

## Result

**PARTIAL**: start — pass; walk out — pass; meet — pass; talk — pass; take — pass; make — fail.
