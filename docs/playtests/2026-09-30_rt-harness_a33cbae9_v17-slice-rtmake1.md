# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_household_cluster_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `fleet/rt-make`, HEAD `a33cbae9523c75ca93277ee5f9aecf9c50a36b4e`.
- Прогон `rtmake1`: 2026-09-30T08:43:25.865Z — 2026-09-30T09:02:44.486Z (1159 с).
- Сценарий `novgorod_vikhtuy_household_cluster_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `/srv/novgorod-work/prose-test/llm-settings.json` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **реальный Giga**.
- Бюджет: 27 ходов (из них 3 зарезервированы под make), дедлайн 22 мин.
- Квалификация модели при старте: выполнена, 19 вызовов LLM.

## Gameplay transcript

### Открытие партии

- Партия `party:343c43770885fca2a52d2740`; попыток new-game: 1; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 0.

Что увидел игрок (дословно):

> Вы — Микула, лесной промысловик. Тело не знает ран, в руках достаточно сил для работы, а в желудке нет сильного голода. На вас штаны, нижняя рубаха и низкая кожаная обувь.
> 
> Перед вами различима вода, кромка берега и очертания деревьев. В этом месте находится человек, которого вы не узнаёте.

### Ход 1 · нога talk

- Ввод игрока: «Здороваюсь с человеком и спрашиваю, как его зовут.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 0 → 1; реплик NPC в снимке: +1
- Вызовов LLM за ход: 10 · 60 с

Что увидел игрок (дословно):

> Человек говорит: «Здравствуйте. Меня зовут... Я служу здесь, но имя моё не так важно, как работа.» Он мог сообщить не всё, что знает, но это пока неизвестно.

Люди на экране: «человек»

### Ход 2 · нога walk out

- Ввод игрока: «Осматриваюсь вокруг.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 1 → 2
- Вызовов LLM за ход: 5 · 32 с

Что увидел игрок (дословно):

> Вы внимательно изучаете обстановку. В поле зрения — человек, Проход 1, Проход 3 и Проход 4. Человек говорит: «Здравствуйте. Меня зовут... Я служу здесь, но имя моё не так важно, как работа.»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 3 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 2 → 3
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Человек говорит: «Здравствуйте. Меня зовут... Я служу здесь, но имя моё не так важно, как работа». Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 4 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival; state_version 3 → 4
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Здравствуйте. Меня зовут... Я служу здесь, но имя моё не так важно, как работа.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 5 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 4 → 5
- Вызовов LLM за ход: 5 · 31 с

Что увидел игрок (дословно):

> Вы не достигли цели «Проход 2». Человек говорит: «Здравствуйте. Меня зовут... Я служу здесь, но имя моё не так важно, как работа.»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 6 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 5 → 6
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Здравствуйте. Меня зовут... Я служу здесь, но имя моё не так важно, как работа.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 7 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 6 → 7
- Вызовов LLM за ход: 5 · 30 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Человек говорит: «Здравствуйте. Меня зовут... Я служу здесь, но имя моё не так важно, как работа.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 8 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 7 → 8
- Вызовов LLM за ход: 5 · 31 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Человек говорит: «Здравствуйте. Меня зовут... Я служу здесь, но имя моё не так важно, как работа.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 9 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 8 → 9
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Здравствуйте. Меня зовут... Я служу здесь, но имя моё не так важно, как работа.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 10 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure); state_version 9 → 10
- Вызовов LLM за ход: 5 · 28 с

Что увидел игрок (дословно):

> Цель «Проход 2» не достигнута. Человек говорит: «Здравствуйте. Меня зовут... Я служу здесь, но имя моё не так важно, как работа.»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 11 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 10 → 11; размещения в G6 игрока: 1 → 0
- Вызовов LLM за ход: 5 · 46 с

Что увидел игрок (дословно):

> Ты стоишь и смотришь на окрестности. Что именно ты видишь, пока неизвестно.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 12 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 11 → 12
- Вызовов LLM за ход: 5 · 36 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, обозревая окрестности. Вас зовут Микула, и вы занимаетесь лесным промыслом.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 13 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 12 → 13
- Вызовов LLM за ход: 7 · 40 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 14 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival); state_version 13 → 14
- Вызовов LLM за ход: 5 · 28 с

Что увидел игрок (дословно):

> Цель «Проход 2» не достигнута.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 15 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 14 → 15
- Вызовов LLM за ход: 7 · 35 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах Окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 16 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 15 → 16
- Вызовов LLM за ход: 7 · 35 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места, Окрестности, где вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 17 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 16 → 17
- Вызовов LLM за ход: 7 · 35 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах Окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 18 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 17 → 18
- Вызовов LLM за ход: 5 · 28 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

## Persistence/readback

LLM-вызовы за прогон: 127 (ошибок транспорта/статуса: 0); по ролям:

```
12× Return only one JSON object containing the ordinary semantic
28× You are a strict evidence auditor of Russian game prose. Sil
19× Return only {"prose":"<complete Russian prose>"}. The server
1× Return only {"prose":"<complete opening>"}. Write 2-4 connec
1× Return only {"pass":<boolean>,"failed_checks":["<required ch
40× Return only one JSON object with exactly these six keys: sch
19× Return only one JSON object containing the semantic choice f
2× Return only one plain JSON object with the semantic conversa
1× Return only {"pass":true,"concerns":[]} or {"pass":false,"co
4× Return only {"replacements":[{"prose":"<complete repaired Ru
```

Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):

```
{
 "state_version": "18",
 "position": {
  "slot": "departure",
  "origin": "canonical",
  "site_id": "canonical:3ac857ba2b98bf957115f4de287d4911ecd4e88453d057e5427002d2ddf3f5a2:site",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage",
  "generated_template": null
 },
 "placements_here": [],
 "npc_placements_all": [
  {
   "slot": "focus",
   "entity_id": "npc_83a9b25be9ff00f5d1f7fcda",
   "g6_instance_id": "baseline:g5_node_5d69197481647ce423460ad4:g6:main"
  }
 ],
 "items": [
  {
   "holder": "player_character_640f98506016f60b56c6a7db",
   "item_id": "item_124489f9666cd83305bf78bc",
   "position": "equipped"
  },
  {
   "holder": "player_character_640f98506016f60b56c6a7db",
   "item_id": "item_8ec592de181079934da83ec5",
   "position": "equipped"
  },
  {
   "holder": "player_character_640f98506016f60b56c6a7db",
   "item_id": "item_b75c3a6ec5c79371665605be",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_cee5c37f496ee64a0c60fd75",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_f0cb7da3fbbc4f809be0645a",
   "position": "equipped"
  }
 ],
 "party_items": [
  {
   "item_id": "item_124489f9666cd83305bf78bc",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_8ec592de181079934da83ec5",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_b75c3a6ec5c79371665605be",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_cee5c37f496ee64a0c60fd75",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_f0cb7da3fbbc4f809be0645a",
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
   "exchange_id": "exchange:7af721cd9981f84c15dfa3bbb2fb1fee",
   "speaker_ref": {
    "entity_id": "npc_83a9b25be9ff00f5d1f7fcda",
    "entity_kind": "npc"
   },
   "dominant_act": "answer",
   "statement_id": "statement:7af721cd9981f84c15dfa3bbb2fb1fee805d59466dfbb81ddd504a3b7d04b075:2",
   "utterance_text": "Здравствуйте. Меня зовут... Я служу здесь, но имя моё не так важно, как работа.",
   "conversation_id": "conversation:7af721cd9981f84c15dfa3bbb2fb1fee",
   "source_plan_ref": {
    "entity_id": "semantic-plan:7af721cd9981f84c15dfa3bbb2fb1fee805d59466dfbb81ddd504a3b7d04b075:2",
    "entity_kind": "semantic_plan"
   },
   "interaction_tags": [],
   "message_completeness": "complete",
   "social_delivery_result": null,
   "intended_addressee_refs": [
    {
     "entity_id": "player_character_640f98506016f60b56c6a7db",
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
| start | pass | партия party:343c43770885fca2a52d2740, место vikhtuy_locality_household_cluster |
| walk out | pass | места Вихтуя по ходу: vikhtuy_locality_household_cluster → vikhtuy_locality_work_storage |
| meet | pass | на месте vikhtuy_locality_household_cluster: NPC по SQL npc_83a9b25be9ff00f5d1f7fcda |
| talk | pass | реплика NPC записана (+1) |
| take | blocked | ни на одном месте (vikhtuy_locality_household_cluster, vikhtuy_locality_work_storage) нет непустого источника в party_resource_nodes (сбой: fetch failed) |
| make | fail | fetch failed |

- **walk out**: ходов движения: 17, из них без смены места: 16; на стартовом экране проходов не было, понадобился «Осматриваюсь вокруг.»
- **meet**: на экране: панель людей пуста; NPC в G6 игрока по SQL: 1
- **talk**: последняя реплика NPC в снимке: {"claims":[],"schema":"conversation_statement_event_v1","duration":{"owner":"approved_activity_contract","activity_ref":"novgorod_live_world_conversation_brief"},"spoken_at":{"whole_minutes":"261123","subminute_numerator":"0","subminute_denominator":"1"},"topic_refs":[],"exchange_id":"exchange:7af721cd9981f84c15dfa3bbb2fb1fee","speaker_ref":{"entity_id":"npc_83a9b25be9ff00f5d1f7fcda","entity_kind":"npc"},"dominant_act":"answer","statement_id":"statement:7af721cd9981f84c15dfa3bbb2fb1fee805d59466dfbb81ddd504a3b7d04b075:2","utterance_text":"Здравствуйте. Меня зовут... Я служу здесь, но имя моё не

## Result

**PARTIAL**: start — pass; walk out — pass; meet — pass; talk — pass; take — blocked; make — fail.
