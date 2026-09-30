# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_household_cluster_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `fleet/rt-lines`, HEAD `580a25a246fd454b6a7c7bf7947820ec3d0e6352`.
- Прогон `rtl0hh2`: 2026-09-30T14:53:20.396Z — 2026-09-30T15:14:38.808Z (1278 с).
- Сценарий `novgorod_vikhtuy_household_cluster_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `/srv/novgorod-work/prose-test/llm-settings.json` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **реальный Giga**.
- Бюджет: 30 ходов (из них 3 зарезервированы под make), дедлайн 24 мин.
- Квалификация модели при старте: выполнена, 19 вызовов LLM.

## Gameplay transcript

### Открытие партии

- Партия `party:edec07bef80cdf9e0c7e2df0`; попыток new-game: 1; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 0.

Что увидел игрок (дословно):

> Вы — Микула, лесной промысловик. Тело не знает ран, силы достаточны для работы, и сильного голода нет. На ногах низкая кожаная обувь, на теле нижняя рубаха и штаны. День стоит летний, свет ярок, и в этом свете различима вода, кромка берега и очертания деревьев. Неподалеку стоит человек, чьё лицо вам не знакомо.

Проходы на первом экране: «Проход 3», «Проход 4»

### Ход 1 · нога talk

- Ввод игрока: «Здороваюсь с человеком и спрашиваю, как его зовут.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 0 → 1; реплик NPC в снимке: +1
- Вызовов LLM за ход: 10 · 58 с

Что увидел игрок (дословно):

> Братята произносит: «Здравствуй. Я Братята.» Неясно, сообщил ли он всё, что знает.

Люди на экране: «Братята»

### Ход 2 · нога walk out

- Ввод игрока: «Осматриваюсь вокруг.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 1 → 2
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы внимательно изучили обстановку, и в поле зрения оказались Братята. Он произносит: «Здравствуй. Я Братята.»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «Братята»

### Ход 3 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 2 → 3
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Братята говорит: «Здравствуй. Я Братята.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «Братята»

### Ход 4 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival; state_version 3 → 4
- Вызовов LLM за ход: 5 · 35 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Братята говорит: «Здравствуй. Я Братята.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «Братята»

### Ход 5 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 4 → 5
- Вызовов LLM за ход: 5 · 32 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Братята говорит: «Здравствуй. Я Братята.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «Братята»

### Ход 6 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 5 → 6
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Братята говорит: «Здравствуй. Я Братята.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «Братята»

### Ход 7 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 6 → 7
- Вызовов LLM за ход: 5 · 34 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Братята говорит: «Здравствуй. Я Братята.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «Братята»

### Ход 8 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 7 → 8
- Вызовов LLM за ход: 5 · 34 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Братята говорит: «Здравствуй. Я Братята.» Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «Братята»

### Ход 9 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 8 → 9; размещения в G6 игрока: 1 → 0
- Вызовов LLM за ход: 5 · 44 с

Что увидел игрок (дословно):

> Ты оглядываешь окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 10 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 9 → 10
- Вызовов LLM за ход: 7 · 40 с

Что увидел игрок (дословно):

> Вы переместились в пределах Окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 11 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 10 → 11
- Вызовов LLM за ход: 5 · 32 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 12 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 11 → 12
- Вызовов LLM за ход: 7 · 41 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 13 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 12 → 13
- Вызовов LLM за ход: 7 · 38 с

Что увидел игрок (дословно):

> Вы остаётесь в Окрестностях. Вы Микула, лесной промысловик.

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
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 14 → 15
- Вызовов LLM за ход: 5 · 31 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 16 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 15 → 16; запас m2c_finite_driftwood_v1:074d39e83c348c79eb6eb0e0: — → 100
- Вызовов LLM за ход: 5 · 43 с

Что увидел игрок (дословно):

> Ты стоишь и смотришь на окрестности. Что именно ты видишь, пока неизвестно.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 17 · нога take

- Ввод игрока: «Беру плавник.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 16 → 17; запас m2c_finite_driftwood_v1:074d39e83c348c79eb6eb0e0: 100 → 99; новые предметы: ordinary_item_ac70d3d61bd7c345d71b3739
- Вызовов LLM за ход: 11 · 50 с

Что увидел игрок (дословно):

> Вы замечаете «Плавник». Подняв его, вы берёте в руки Плавник.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 18 · нога make

- Ввод игрока: «Оторву полосу от подола рубахи.»
- HTTP: 409, ошибка TURN_NOT_SAVED (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 17 → 17
- Причина на сервере (внутренняя, только в логе; в HTTP — публичная категория или маскировка): TURN_STEP_PLAN_INVALID: TURN_STEP_PLAN_INVALID: $.operations[0].action_production.result_descriptor.source_fact_delta only a surviving partial source requires a fact delta; $.operations[0].action_production.material_extent material extent must match the physical identity transition [identity_shape; material_extent_shape]
- Вызовов LLM за ход: 3 · 53 с

Что увидел игрок (дословно):

> Ход не сохранён. Попробуйте сформулировать действие иначе.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 19 · нога make

- Ввод игрока: «Оторву лоскут от нижней рубахи.»
- HTTP: 409, ошибка WORLD_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 17 → 17
- Причина на сервере (внутренняя, только в логе; в HTTP — публичная категория или маскировка): M2C_TARGET_A1_APPLICABILITY_DATA_GAP: M2C_TARGET_A1_APPLICABILITY_DATA_GAP
- Вызовов LLM за ход: 4 · 41 с

Что увидел игрок (дословно):

> Ход не сохранён. Для этого действия не хватает данных мира.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 20 · нога make

- Ввод игрока: «Отрежу кусок от штанов на повязку.»
- HTTP: 409, ошибка WORLD_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 17 → 17
- Причина на сервере (внутренняя, только в логе; в HTTP — публичная категория или маскировка): M2C_TARGET_A1_APPLICABILITY_DATA_GAP: M2C_TARGET_A1_APPLICABILITY_DATA_GAP
- Вызовов LLM за ход: 4 · 38 с

Что увидел игрок (дословно):

> Ход не сохранён. Для этого действия не хватает данных мира.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

## Persistence/readback

LLM-вызовы за прогон: 134 (ошибок транспорта/статуса: 0); по ролям:

```
13× Return only one JSON object containing the ordinary semantic
26× You are a strict evidence auditor of Russian game prose. Sil
18× Return only {"prose":"<complete Russian prose>"}. The server
1× Return only {"prose":"<complete opening>"}. Write 2-4 connec
1× Return only {"pass":<boolean>,"failed_checks":["<required ch
41× Return only one JSON object with exactly these six keys: sch
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
  "site_id": "canonical:7e9f831755d9717808a329c5acceabab8e0b0c78b12ba41b1a3d464da543026b:site",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access",
  "generated_template": null
 },
 "placements_here": [],
 "npc_placements_all": [
  {
   "slot": "focus",
   "entity_id": "npc_8fade6b0f5eaa127740bd940",
   "g6_instance_id": "baseline:g5_node_f8b697279387e0d62393787f:g6:main"
  }
 ],
 "items": [
  {
   "holder": "player_character_e293d5edf6bf7da6b5b96041",
   "item_id": "item_0a1476ffc60c9fdd0bc19062",
   "position": "equipped"
  },
  {
   "holder": "player_character_e293d5edf6bf7da6b5b96041",
   "item_id": "item_4584aa95c4dbb783a37534ab",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_5d6c8b81745daabb2c20fe23",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_5e4e017ca56226f309f6e690",
   "position": "equipped"
  },
  {
   "holder": "player_character_e293d5edf6bf7da6b5b96041",
   "item_id": "item_ad43b78d3cddf50bac26e099",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_d635b5bafb0dc3c31acb3442",
   "position": "equipped"
  },
  {
   "holder": "player_character_e293d5edf6bf7da6b5b96041",
   "item_id": "ordinary_item_ac70d3d61bd7c345d71b3739",
   "position": "hands"
  }
 ],
 "party_items": [
  {
   "item_id": "item_0a1476ffc60c9fdd0bc19062",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_4584aa95c4dbb783a37534ab",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_5d6c8b81745daabb2c20fe23",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_5e4e017ca56226f309f6e690",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_ad43b78d3cddf50bac26e099",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_d635b5bafb0dc3c31acb3442",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "ordinary_item_ac70d3d61bd7c345d71b3739",
   "state_version": 1,
   "action_production": false
  }
 ],
 "resource_nodes": [
  {
   "state_version": 2,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_driftwood_v1:074d39e83c348c79eb6eb0e0",
   "quantity_numerator": 99,
   "quantity_denominator": 1
  }
 ],
 "resource_decrements": [
  {
   "after_numerator": 99,
   "before_numerator": 100,
   "resource_node_id": "m2c_finite_driftwood_v1:074d39e83c348c79eb6eb0e0",
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
   "exchange_id": "exchange:b4d1711ef8e4ba8eeacdae98177bebca",
   "speaker_ref": {
    "entity_id": "npc_8fade6b0f5eaa127740bd940",
    "entity_kind": "npc"
   },
   "dominant_act": "answer",
   "statement_id": "statement:b4d1711ef8e4ba8eeacdae98177bebca9b034803379974b544759fc0361ef253:2",
   "utterance_text": "Здравствуй. Я Братята.",
   "conversation_id": "conversation:b4d1711ef8e4ba8eeacdae98177bebca",
   "source_plan_ref": {
    "entity_id": "semantic-plan:b4d1711ef8e4ba8eeacdae98177bebca9b034803379974b544759fc0361ef253:2",
    "entity_kind": "semantic_plan"
   },
   "interaction_tags": [],
   "message_completeness": "complete",
   "social_delivery_result": null,
   "intended_addressee_refs": [
    {
     "entity_id": "player_character_e293d5edf6bf7da6b5b96041",
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
| start | pass | партия party:edec07bef80cdf9e0c7e2df0, место vikhtuy_locality_household_cluster |
| walk out | pass | места Вихтуя по ходу: vikhtuy_locality_household_cluster → vikhtuy_locality_work_storage → vikhtuy_locality_water_access |
| meet | pass | на месте vikhtuy_locality_household_cluster: NPC по SQL npc_8fade6b0f5eaa127740bd940 |
| talk | pass | реплика NPC записана (+1) |
| take | pass | запас m2c_finite_driftwood_v1:074d39e83c348c79eb6eb0e0: 100 → 99, предмет в руках |
| make | fail | все 3 фразы без предмета; последняя причина: ход не прошёл: WORLD_ACTION_UNAVAILABLE |

- **walk out**: ходов движения: 15, из них без смены места: 13; на стартовом экране проходов не было, понадобился «Осматриваюсь вокруг.»
- **meet**: на экране: панель людей пуста; NPC в G6 игрока по SQL: 1
- **talk**: последняя реплика NPC в снимке: {"claims":[],"schema":"conversation_statement_event_v1","duration":{"owner":"approved_activity_contract","activity_ref":"novgorod_live_world_conversation_brief"},"spoken_at":{"whole_minutes":"261123","subminute_numerator":"0","subminute_denominator":"1"},"topic_refs":[],"exchange_id":"exchange:b4d1711ef8e4ba8eeacdae98177bebca","speaker_ref":{"entity_id":"npc_8fade6b0f5eaa127740bd940","entity_kind":"npc"},"dominant_act":"answer","statement_id":"statement:b4d1711ef8e4ba8eeacdae98177bebca9b034803379974b544759fc0361ef253:2","utterance_text":"Здравствуй. Я Братята.","conversation_id":"conversation:

## Result

**PARTIAL**: start — pass; walk out — pass; meet — pass; talk — pass; take — pass; make — fail.
