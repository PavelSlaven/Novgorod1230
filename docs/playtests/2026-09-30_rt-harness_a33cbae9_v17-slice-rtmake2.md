# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_household_cluster_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `fleet/rt-make`, HEAD `a33cbae9523c75ca93277ee5f9aecf9c50a36b4e`.
- Прогон `rtmake2`: 2026-09-30T09:10:32.847Z — 2026-09-30T09:32:24.155Z (1311 с).
- Сценарий `novgorod_vikhtuy_household_cluster_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `/srv/novgorod-work/prose-test/llm-settings.json` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **реальный Giga**.
- Бюджет: 30 ходов (из них 3 зарезервированы под make), дедлайн 24 мин.
- Квалификация модели при старте: выполнена, 19 вызовов LLM.

## Gameplay transcript

### Открытие партии

- Партия `party:f1a726f5d0b4ed588ca0f27e`; попыток new-game: 1; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 0.

Что увидел игрок (дословно):

> Летний день 1230 года. Вы — Микула, лесной промысловик. Тело не знает ран, в нём достаточно сил для работы, и сильного голода нет. На вас штаны, нижняя рубаха и низкая кожаная обувь.
> 
> Перед вами различима вода. Различима кромка берега. Различимы очертания деревьев. Вблизи, на берегу, находятся два человека. Они незнакомы вам. Их присутствие — единственное, что нарушает статичность пейзажа, состоящего из воды, берега и деревьев. Вы не знаете, кто они, и не знаете, зачем они здесь.
> 
> Ваше положение не меняется. Вы не ранены, вы не голодны, вы не знаете, что делать дальше. Вода, берег, деревья, два человека — вот весь мир, который вам доступен в эту минуту.

### Ход 1 · нога talk

- Ввод игрока: «Здороваюсь с человеком и спрашиваю, как его зовут.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 0 → 1; реплик NPC в снимке: +1
- Вызовов LLM за ход: 10 · 64 с

Что увидел игрок (дословно):

> Человек говорит: «Здравствуйте. Я слуга. Меня зовут так, как хозяин велел, но имя моё невелико. Чем могу быть полезен?» Он мог сообщить не всё, что знает.

Люди на экране: «человек (1)», «человек (2)»

### Ход 2 · нога walk out

- Ввод игрока: «Осматриваюсь вокруг.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 1 → 2
- Вызовов LLM за ход: 5 · 38 с

Что увидел игрок (дословно):

> Вы внимательно изучили обстановку. В поле зрения — человек (1), человек (2), Проход 1, Проход 3 и Проход 4. Человек говорит: «Здравствуйте. Я слуга. Меня зовут так, как хозяин велел, но имя моё невелико. Чем могу быть полезен?»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек (1)», «человек (2)»

### Ход 3 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 2 → 3
- Вызовов LLM за ход: 5 · 34 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Здравствуйте. Я слуга. Меня зовут так, как хозяин велел, но имя моё невелико. Чем могу быть полезен?» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек (1)», «человек (2)»

### Ход 4 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival; state_version 3 → 4
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Здравствуйте. Я слуга. Меня зовут так, как хозяин велел, но имя моё невелико. Чем могу быть полезен?». Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек (1)», «человек (2)»

### Ход 5 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 4 → 5
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы не достигли цели «Проход 2». Человек говорит: «Здравствуйте. Я слуга. Меня зовут так, как хозяин велел, но имя моё невелико. Чем могу быть полезен?»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек (1)», «человек (2)»

### Ход 6 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 5 → 6
- Вызовов LLM за ход: 5 · 31 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Здравствуйте. Я слуга. Меня зовут так, как хозяин велел, но имя моё невелико. Чем могу быть полезен?» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек (1)», «человек (2)»

### Ход 7 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 6 → 7
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Здравствуйте. Я слуга. Меня зовут так, как хозяин велел, но имя моё невелико. Чем могу быть полезен?» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек (1)», «человек (2)»

### Ход 8 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 7 → 8
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Здравствуйте. Я слуга. Меня зовут так, как хозяин велел, но имя моё невелико. Чем могу быть полезен?» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек (1)», «человек (2)»

### Ход 9 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 8 → 9
- Вызовов LLM за ход: 5 · 31 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Здравствуйте. Я слуга. Меня зовут так, как хозяин велел, но имя моё невелико. Чем могу быть полезен?» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек (1)», «человек (2)»

### Ход 10 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure); state_version 9 → 10
- Вызовов LLM за ход: 5 · 30 с

Что увидел игрок (дословно):

> Вы не достигли цели «Проход 2». Человек говорит: «Здравствуйте. Я слуга. Меня зовут так, как хозяин велел, но имя моё невелико. Чем могу быть полезен?»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек (1)», «человек (2)»

### Ход 11 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 10 → 11; размещения в G6 игрока: 2 → 0
- Вызовов LLM за ход: 5 · 45 с

Что увидел игрок (дословно):

> Ты оглядываешь окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 12 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 11 → 12
- Вызовов LLM за ход: 7 · 42 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места, Окрестности. Вас зовут Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 13 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 12 → 13
- Вызовов LLM за ход: 7 · 41 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущих окрестностей, где вас зовут Микула, лесным промысловиком.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 14 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival); state_version 13 → 14
- Вызовов LLM за ход: 5 · 27 с

Что увидел игрок (дословно):

> Цель «Проход 2» не достигнута.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 15 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 14 → 15
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 16 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 15 → 16
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 17 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 16 → 17
- Вызовов LLM за ход: 5 · 30 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

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

### Ход 19 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure); state_version 18 → 19
- Вызовов LLM за ход: 5 · 27 с

Что увидел игрок (дословно):

> Вы стоите перед Проходом 2, но не удалось достичь цели «Проход 2».

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 20 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 19 → 20; запас m2c_finite_driftwood_v1:b467bf6aeb8a996f04bde86d: — → 100
- Вызовов LLM за ход: 5 · 42 с

Что увидел игрок (дословно):

> Ты стоишь и смотришь на окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 21 · нога take

- Ввод игрока: «Беру плавник.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 20 → 21; запас m2c_finite_driftwood_v1:b467bf6aeb8a996f04bde86d: 100 → 99; новые предметы: ordinary_item_f386c417be82f299956a1f6b
- Вызовов LLM за ход: 11 · 49 с

Что увидел игрок (дословно):

> Вы замечаете «Плавник». Вы берёте его в руки.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 22 · нога make

- Ввод игрока: «Оторву полосу от подола рубахи.»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 21 → 21
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: Literal physical denial must use the available grounded owner. [operation_semantic_grounding]
- Вызовов LLM за ход: 3 · 41 с

Что увидел игрок (дословно):

> Вы замечаете «Плавник». Вы берёте его в руки.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 23 · нога make

- Ввод игрока: «Оторву лоскут от нижней рубахи.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 21 → 22; размещения в G6 игрока: 0 → 1; новые предметы: a1-result:turn-step-action:turn:party:f1a726f5d0b4ed588ca0f27e:22:step:1:output:1
- Вызовов LLM за ход: 6 · 33 с

Что увидел игрок (дословно):

> Ты видишь малый оторванный кусок светлой льняной ткани. Окрестности остаются без изменений.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

## Persistence/readback

LLM-вызовы за прогон: 152 (ошибок транспорта/статуса: 0); по ролям:

```
13× Return only one JSON object containing the ordinary semantic
30× You are a strict evidence auditor of Russian game prose. Sil
23× Return only {"prose":"<complete Russian prose>"}. The server
2× Return only {"prose":"<complete opening>"}. Write 2-4 connec
2× Return only {"pass":<boolean>,"failed_checks":["<required ch
49× Return only one JSON object with exactly these six keys: sch
25× Return only one JSON object containing the semantic choice f
2× Return only one plain JSON object with the semantic conversa
3× Return only {"pass":true,"concerns":[]} or {"pass":false,"co
2× Return only {"replacements":[{"prose":"<complete repaired Ru
1× Return only JSON with exactly mode and support_refs. mode is
```

Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):

```
{
 "state_version": "22",
 "position": {
  "slot": "arrival",
  "origin": "canonical",
  "site_id": "canonical:1d9931f3a7a64b86b2b188ceebcc5476fe1464d8f4034345b4b65a503b81e2a2:site",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access",
  "generated_template": null
 },
 "placements_here": [
  {
   "slot": "arrival",
   "entity_id": "a1-result:turn-step-action:turn:party:f1a726f5d0b4ed588ca0f27e:22:step:1:output:1",
   "entity_kind": "item",
   "occupies_capacity_units": 1
  }
 ],
 "npc_placements_all": [
  {
   "slot": "focus",
   "entity_id": "npc_688c7efbe0f3c2bd09e1c2b8",
   "g6_instance_id": "baseline:g5_node_8990bafc93f09f28c4e750a3:g6:main"
  },
  {
   "slot": "departure",
   "entity_id": "npc_e9ef18fdc8bcc13025294884",
   "g6_instance_id": "baseline:g5_node_8990bafc93f09f28c4e750a3:g6:main"
  }
 ],
 "items": [
  {
   "holder": null,
   "item_id": "a1-result:turn-step-action:turn:party:f1a726f5d0b4ed588ca0f27e:22:step:1:output:1",
   "position": null
  },
  {
   "holder": "player_character_e409934231dbd8d48510df58",
   "item_id": "item_1e3c063a3484ab6dab7bbef0",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_28ab0155fe92124f6aa61923",
   "position": "hands"
  },
  {
   "holder": null,
   "item_id": "item_6a87a4aa029af94eacea2949",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_8d33b7676522cc1ee9ba4768",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_9d3ee93053bfb15e29a8bbb3",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_a61e37336987dad39a884c29",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_c2308d326cadfad1cfdef49f",
   "position": "equipped"
  },
  {
   "holder": "player_character_e409934231dbd8d48510df58",
   "item_id": "item_eac2851b1ca607278a8a3fad",
   "position": "equipped"
  },
  {
   "holder": "player_character_e409934231dbd8d48510df58",
   "item_id": "item_f3178a9038430e918ccad2f3",
   "position": "equipped"
  },
  {
   "holder": "player_character_e409934231dbd8d48510df58",
   "item_id": "ordinary_item_f386c417be82f299956a1f6b",
   "position": "hands"
  }
 ],
 "party_items": [
  {
   "item_id": "a1-result:turn-step-action:turn:party:f1a726f5d0b4ed588ca0f27e:22:step:1:output:1",
   "state_version": 1,
   "action_production": true
  },
  {
   "item_id": "item_1e3c063a3484ab6dab7bbef0",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_28ab0155fe92124f6aa61923",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_6a87a4aa029af94eacea2949",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_8d33b7676522cc1ee9ba4768",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_9d3ee93053bfb15e29a8bbb3",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_a61e37336987dad39a884c29",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_c2308d326cadfad1cfdef49f",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_eac2851b1ca607278a8a3fad",
   "state_version": 2,
   "action_production": true
  },
  {
   "item_id": "item_f3178a9038430e918ccad2f3",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "ordinary_item_f386c417be82f299956a1f6b",
   "state_version": 1,
   "action_production": false
  }
 ],
 "resource_nodes": [
  {
   "state_version": 2,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_driftwood_v1:b467bf6aeb8a996f04bde86d",
   "quantity_numerator": 99,
   "quantity_denominator": 1
  }
 ],
 "resource_decrements": [
  {
   "after_numerator": 99,
   "before_numerator": 100,
   "resource_node_id": "m2c_finite_driftwood_v1:b467bf6aeb8a996f04bde86d",
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
   "exchange_id": "exchange:b973978f7a788c2af01a3d6d9935daa8",
   "speaker_ref": {
    "entity_id": "npc_688c7efbe0f3c2bd09e1c2b8",
    "entity_kind": "npc"
   },
   "dominant_act": "answer",
   "statement_id": "statement:b973978f7a788c2af01a3d6d9935daa8bbdb812ea7a094d6ae41f89357ee201e:2",
   "utterance_text": "Здравствуйте. Я слуга. Меня зовут так, как хозяин велел, но имя моё невелико. Чем могу быть полезен?",
   "conversation_id": "conversation:b973978f7a788c2af01a3d6d9935daa8",
   "source_plan_ref": {
    "entity_id": "semantic-plan:b973978f7a788c2af01a3d6d9935daa8bbdb812ea7a094d6ae41f89357ee201e:2",
    "entity_kind": "semantic_plan"
   },
   "interaction_tags": [],
   "message_completeness": "complete",
   "social_delivery_result": null,
   "intended_addressee_refs": [
    {
     "entity_id": "player_character_e409934231dbd8d48510df58",
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
| start | pass | партия party:f1a726f5d0b4ed588ca0f27e, место vikhtuy_locality_household_cluster |
| walk out | pass | места Вихтуя по ходу: vikhtuy_locality_household_cluster → vikhtuy_locality_work_storage → vikhtuy_locality_water_access |
| meet | pass | на месте vikhtuy_locality_household_cluster: NPC по SQL npc_688c7efbe0f3c2bd09e1c2b8, npc_e9ef18fdc8bcc13025294884 |
| talk | pass | реплика NPC записана (+1) |
| take | pass | запас m2c_finite_driftwood_v1:b467bf6aeb8a996f04bde86d: 100 → 99, предмет в руках |
| make | pass | создано предметов A1: 2 |

- **walk out**: ходов движения: 19, из них без смены места: 17; на стартовом экране проходов не было, понадобился «Осматриваюсь вокруг.»
- **meet**: на экране: панель людей пуста; NPC в G6 игрока по SQL: 2
- **talk**: последняя реплика NPC в снимке: {"claims":[],"schema":"conversation_statement_event_v1","duration":{"owner":"approved_activity_contract","activity_ref":"novgorod_live_world_conversation_brief"},"spoken_at":{"whole_minutes":"261123","subminute_numerator":"0","subminute_denominator":"1"},"topic_refs":[],"exchange_id":"exchange:b973978f7a788c2af01a3d6d9935daa8","speaker_ref":{"entity_id":"npc_688c7efbe0f3c2bd09e1c2b8","entity_kind":"npc"},"dominant_act":"answer","statement_id":"statement:b973978f7a788c2af01a3d6d9935daa8bbdb812ea7a094d6ae41f89357ee201e:2","utterance_text":"Здравствуйте. Я слуга. Меня зовут так, как хозяин велел,

## Result

**PASS**: start — pass; walk out — pass; meet — pass; talk — pass; take — pass; make — pass.
