# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_household_cluster_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `fleet/rt-harness`, HEAD `636fa4ccac0364ad8d4041297e15ea3dad0f014c`.
- Прогон `run2hh`: 2026-09-30T03:57:54.973Z — 2026-09-30T04:12:22.269Z (867 с).
- Сценарий `novgorod_vikhtuy_household_cluster_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `/srv/novgorod-work/prose-test/llm-settings.json` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **ЗАГЛУШКА (нулевые векторы 1024)** — векторный поиск WK не работает, привязка речи NPC к World Knowledge ослаблена; нога talk оценивается с этой оговоркой.
- Бюджет: 36 ходов (из них 3 зарезервированы под make), дедлайн 40 мин.
- Квалификация модели при старте: выполнена, 21 вызовов LLM.

## Gameplay transcript

### Открытие партии

- Партия `party:fb4205a05ef6641274d1d802`; попыток new-game: 2; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 1.

Что увидел игрок (дословно):

> Вы — Микула, лесной промысловик. Летний день 1230 года разлит вокруг вас, и свет падает ровно, без резких теней. Ваше тело не знает ран; в мышцах достаточно сил для работы, а в желудке нет того сильного голода, что обычно терзает в пути. Вы стоите, и ваша нижняя рубаха, штаны и низкая кожаная обувь — единственное, что при вас, — тихо принимают вес этого момента. Тишина не означает пустоты; она лишь не заполнена звуками, которые вы не слышите, и не заполнена людьми, которых вы не видите. Вы здесь, и этого достаточно, чтобы начать.

### Ход 1 · нога talk

- Ввод игрока: «Здороваюсь с человеком и спрашиваю, как его зовут.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 0 → 1; реплик NPC в снимке: +1
- Вызовов LLM за ход: 11 · 65 с

Что увидел игрок (дословно):

> Человек произносит: «Об этом я ничего подтвердить не могу.» Ты не знаешь, сообщил ли он всё, что знает, или удержал часть сведений.

Люди на экране: «человек (1)», «человек (2)»

### Ход 2 · нога walk out

- Ввод игрока: «Осматриваюсь вокруг.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 1 → 2
- Вызовов LLM за ход: 5 · 35 с

Что увидел игрок (дословно):

> Вы внимательно изучили обстановку. В поле зрения — человек (1) и человек (2). Человек (1) говорит: «Об этом я ничего подтвердить не могу.»

Люди на экране: «человек (1)», «человек (2)»

### Ход 3 · нога make

- Ввод игрока: «Оторву полосу от подола рубахи.»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 2 → 2
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: Turn-step semantic grounding is invalid. [action_production_identity_grounding]
- Вызовов LLM за ход: 4 · 108 с

Что увидел игрок (дословно):

> Вы внимательно изучили обстановку. В поле зрения — человек (1) и человек (2). Человек (1) говорит: «Об этом я ничего подтвердить не могу.»

Люди на экране: «человек (1)», «человек (2)»

### Ход 4 · нога make

- Ввод игрока: «Оторву лоскут от нижней рубахи.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 2 → 3; размещения в G6 игрока: 2 → 3; новые предметы: a1-result:turn-step-action:turn:party:fb4205a05ef6641274d1d802:3:step:1:output:1
- Вызовов LLM за ход: 7 · 113 с

Что увидел игрок (дословно):

> В твоих руках оказывается малый оторванный кусок светлого льна. Человек говорит: «Об этом я ничего подтвердить не могу.»

Люди на экране: «человек (1)», «человек (2)»

## Persistence/readback

LLM-вызовы за прогон: 58 (ошибок транспорта/статуса: 0); по ролям:

```
12× Return only one JSON object containing the ordinary semantic
10× You are a strict evidence auditor of Russian game prose. Sil
4× Return only {"prose":"<complete Russian prose>"}. The server
1× Return only {"replacements":[{"prose":"<complete repaired Ru
5× Return only {"prose":"<complete opening>"}. Write 2-4 connec
5× Return only {"pass":<boolean>,"failed_checks":["<required ch
9× Return only one JSON object with exactly these six keys: sch
6× Return only one JSON object containing the semantic choice f
2× Return only one plain JSON object with the semantic conversa
4× Return only {"pass":true,"concerns":[]} or {"pass":false,"co
```

Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):

```
{
 "state_version": "3",
 "position": {
  "slot": "arrival",
  "origin": "canonical",
  "site_id": "g5:g5_node_72dd4fde21a3e9a1eceb9571",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster",
  "generated_template": null
 },
 "placements_here": [
  {
   "slot": "arrival",
   "entity_id": "a1-result:turn-step-action:turn:party:fb4205a05ef6641274d1d802:3:step:1:output:1",
   "entity_kind": "item",
   "occupies_capacity_units": 1
  },
  {
   "slot": "focus",
   "entity_id": "npc_6de1a8573f52512cdb592249",
   "entity_kind": "npc",
   "occupies_capacity_units": 1
  },
  {
   "slot": "departure",
   "entity_id": "npc_c369620f63ae093bff5a8429",
   "entity_kind": "npc",
   "occupies_capacity_units": 1
  }
 ],
 "npc_placements_all": [
  {
   "slot": "focus",
   "entity_id": "npc_6de1a8573f52512cdb592249",
   "g6_instance_id": "baseline:g5_node_72dd4fde21a3e9a1eceb9571:g6:main"
  },
  {
   "slot": "departure",
   "entity_id": "npc_c369620f63ae093bff5a8429",
   "g6_instance_id": "baseline:g5_node_72dd4fde21a3e9a1eceb9571:g6:main"
  }
 ],
 "items": [
  {
   "holder": null,
   "item_id": "a1-result:turn-step-action:turn:party:fb4205a05ef6641274d1d802:3:step:1:output:1",
   "position": null
  },
  {
   "holder": null,
   "item_id": "item_1bb87b258b3560f736535e89",
   "position": "hands"
  },
  {
   "holder": "player_character_3455d296e522e9aed284fe4d",
   "item_id": "item_243fc7dbf93e7dca784d8cb4",
   "position": "equipped"
  },
  {
   "holder": "player_character_3455d296e522e9aed284fe4d",
   "item_id": "item_336871e6aad70ffa5a4ff774",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_36d2ae17000be41847ea99b4",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_3c8477e1469bda633eb3c4fd",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_5d4f17630e8cc2e97cfacf25",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_657f11fac77a08bb18843705",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_a5b252b07b7975bd35f19997",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_f0338e8f82462c3f1c2973cb",
   "position": "hands"
  },
  {
   "holder": "player_character_3455d296e522e9aed284fe4d",
   "item_id": "item_f3b892d537288a38bd7d8d6f",
   "position": "equipped"
  }
 ],
 "party_items": [
  {
   "item_id": "a1-result:turn-step-action:turn:party:fb4205a05ef6641274d1d802:3:step:1:output:1",
   "state_version": 1,
   "action_production": true
  },
  {
   "item_id": "item_1bb87b258b3560f736535e89",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_243fc7dbf93e7dca784d8cb4",
   "state_version": 2,
   "action_production": true
  },
  {
   "item_id": "item_336871e6aad70ffa5a4ff774",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_36d2ae17000be41847ea99b4",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_3c8477e1469bda633eb3c4fd",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_5d4f17630e8cc2e97cfacf25",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_657f11fac77a08bb18843705",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_a5b252b07b7975bd35f19997",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_f0338e8f82462c3f1c2973cb",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_f3b892d537288a38bd7d8d6f",
   "state_version": 1,
   "action_production": false
  }
 ],
 "resource_nodes": [],
 "resource_decrements": [],
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
   "exchange_id": "exchange:941165ab0e0c8ca1c03c135a7bdf142f",
   "speaker_ref": {
    "entity_id": "npc_6de1a8573f52512cdb592249",
    "entity_kind": "npc"
   },
   "dominant_act": "answer",
   "statement_id": "statement:941165ab0e0c8ca1c03c135a7bdf142fdd20d5e0c3621212893ac9ca98bbc8e5:2",
   "utterance_text": "Об этом я ничего подтвердить не могу.",
   "conversation_id": "conversation:941165ab0e0c8ca1c03c135a7bdf142f",
   "source_plan_ref": {
    "entity_id": "semantic-plan:941165ab0e0c8ca1c03c135a7bdf142fdd20d5e0c3621212893ac9ca98bbc8e5:2",
    "entity_kind": "semantic_plan"
   },
   "interaction_tags": [],
   "message_completeness": "complete",
   "social_delivery_result": null,
   "intended_addressee_refs": [
    {
     "entity_id": "player_character_3455d296e522e9aed284fe4d",
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
| start | pass | партия party:fb4205a05ef6641274d1d802, место vikhtuy_locality_household_cluster |
| walk out | fail | игрок не покинул стартовое место (на месте vikhtuy_locality_household_cluster экран не показывает проходов) |
| meet | pass | на месте vikhtuy_locality_household_cluster: NPC по SQL npc_6de1a8573f52512cdb592249, npc_c369620f63ae093bff5a8429 |
| talk | pass | реплика NPC записана (+1) |
| take | blocked | ни на одном месте (vikhtuy_locality_household_cluster) нет непустого источника в party_resource_nodes (на месте vikhtuy_locality_household_cluster экран не показывает проходов) |
| make | pass | создано предметов A1: 2 |

- **start**: отказов открытия до успеха: 1
- **walk out**: ходов движения: 1, из них без смены места: 1; на стартовом экране проходов не было, понадобился «Осматриваюсь вокруг.»
- **meet**: на экране: панель людей пуста; NPC в G6 игрока по SQL: 2
- **talk**: последняя реплика NPC в снимке: {"claims":[],"schema":"conversation_statement_event_v1","duration":{"owner":"approved_activity_contract","activity_ref":"novgorod_live_world_conversation_brief"},"spoken_at":{"whole_minutes":"261123","subminute_numerator":"0","subminute_denominator":"1"},"topic_refs":[],"exchange_id":"exchange:941165ab0e0c8ca1c03c135a7bdf142f","speaker_ref":{"entity_id":"npc_6de1a8573f52512cdb592249","entity_kind":"npc"},"dominant_act":"answer","statement_id":"statement:941165ab0e0c8ca1c03c135a7bdf142fdd20d5e0c3621212893ac9ca98bbc8e5:2","utterance_text":"Об этом я ничего подтвердить не могу.","conversation_id"

## Result

**PARTIAL**: start — pass; walk out — fail; meet — pass; talk — pass; take — blocked; make — pass.
