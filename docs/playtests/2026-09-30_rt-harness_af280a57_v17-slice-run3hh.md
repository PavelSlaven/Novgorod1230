# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_household_cluster_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `fleet/rt-harness`, HEAD `af280a57a4e166429bcc2f0265e1728677f8126d`.
- Прогон `run3hh`: 2026-09-30T04:28:28.317Z — 2026-09-30T04:56:38.667Z (1690 с).
- Сценарий `novgorod_vikhtuy_household_cluster_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `/srv/novgorod-work/prose-test/llm-settings.json` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **ЗАГЛУШКА (нулевые векторы 1024)** — векторный поиск WK не работает, привязка речи NPC к World Knowledge ослаблена; нога talk оценивается с этой оговоркой.
- Бюджет: 36 ходов (из них 3 зарезервированы под make), дедлайн 40 мин.
- Квалификация модели при старте: выполнена, 19 вызовов LLM.

## Gameplay transcript

### Открытие партии

- Партия `party:d2cece5d9924e5bf860a628a`; попыток new-game: 1; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 0.

Что увидел игрок (дословно):

> Вы — Микула, лесной промысловик. Тело не знает ран, и в нём достаточно сил для работы, а сильный голод не тревожит. На вас нижняя рубаха, штаны и низкая кожаная обувь.
> 
> Перед вами различима вода, кромка берега и очертания деревьев. В этой тишине, где свет дня ложится на знакомые формы, вы замечаете человека. Он не опознан, и его присутствие остаётся фактом, который вы просто видите.

### Ход 1 · нога talk

- Ввод игрока: «Здороваюсь с человеком и спрашиваю, как его зовут.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 0 → 1; реплик NPC в снимке: +1
- Вызовов LLM за ход: 11 · 54 с

Что увидел игрок (дословно):

> Человек говорит: «Об этом я ничего подтвердить не могу.» Ты не знаешь, сообщил ли он всё, что знает, или нет.

Люди на экране: «человек»

### Ход 2 · нога walk out

- Ввод игрока: «Осматриваюсь вокруг.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 1 → 2
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы внимательно изучили обстановку. В поле зрения — человек, Проход 1, Проход 3 и Проход 4. Человек говорит: «Об этом я ничего подтвердить не могу.»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 3 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 2 → 3
- Вызовов LLM за ход: 5 · 30 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Об этом я ничего подтвердить не могу.» Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 4 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival; state_version 3 → 4
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Человек говорит: «Об этом я ничего подтвердить не могу». Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 5 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 4 → 5
- Вызовов LLM за ход: 7 · 37 с

Что увидел игрок (дословно):

> Проход 2. Не удалось достичь цели «Проход 2». Человек говорит: «Об этом я ничего подтвердить не могу.»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 6 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 503, ошибка LLM_PROVIDER_TIMEOUT (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 5 → 5
- Вызовов LLM за ход: 2 · 131 с

Что увидел игрок (дословно):

> Проход 2. Не удалось достичь цели «Проход 2». Человек говорит: «Об этом я ничего подтвердить не могу.»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 7 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 5 → 6
- Вызовов LLM за ход: 5 · 52 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Человек говорит: «Об этом я ничего подтвердить не могу.» Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 8 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 6 → 7
- Вызовов LLM за ход: 5 · 38 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Об этом я ничего подтвердить не могу.» Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 9 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 7 → 8
- Вызовов LLM за ход: 5 · 39 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Об этом я ничего подтвердить не могу.» Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 10 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 8 → 9
- Вызовов LLM за ход: 5 · 32 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Человек говорит: «Об этом я ничего подтвердить не могу.» Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 11 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure); state_version 9 → 10
- Вызовов LLM за ход: 5 · 35 с

Что увидел игрок (дословно):

> Цель «Проход 2» не достигнута. Человек говорит: «Об этом я ничего подтвердить не могу.»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 12 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 10 → 11; размещения в G6 игрока: 1 → 0
- Вызовов LLM за ход: 5 · 47 с

Что увидел игрок (дословно):

> Вы оглядываете окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 13 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 11 → 12
- Вызовов LLM за ход: 5 · 31 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, и перед вами открываются окрестности. Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 14 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 12 → 13
- Вызовов LLM за ход: 7 · 47 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах Окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 15 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival); state_version 13 → 14
- Вызовов LLM за ход: 7 · 37 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 16 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 14 → 15
- Вызовов LLM за ход: 5 · 37 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, и перед вами раскрываются окрестности. Вас зовут Микула, и вы — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 17 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 15 → 16
- Вызовов LLM за ход: 7 · 46 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 18 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 16 → 17
- Вызовов LLM за ход: 5 · 42 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, и перед вами раскрываются окрестности. Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 19 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 17 → 18
- Вызовов LLM за ход: 7 · 51 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места, оглядывая окрестности, где вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 20 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure); state_version 18 → 19
- Вызовов LLM за ход: 7 · 37 с

Что увидел игрок (дословно):

> Проход 2. Не удалось достичь цели «Проход 2».

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 21 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 19 → 20; запас m2c_finite_driftwood_v1:d942f63fc1e25071d8caf816: — → 100
- Вызовов LLM за ход: 5 · 49 с

Что увидел игрок (дословно):

> Вы стоите на берегу, глядя на окрестности. Подлёдное течение может создавать незаметные сверху тонкие участки льда, а снег способен скрывать слабые места и отверстия в прибрежном озёрном льду. Сплошной белый покров сам по себе не подтверждает непрерывность льда под ним, поэтому точное состояние поверхности остаётся неизвестным.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 22 · нога take

- Ввод игрока: «Беру плавник.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 20 → 21; запас m2c_finite_driftwood_v1:d942f63fc1e25071d8caf816: 100 → 99; новые предметы: ordinary_item_a980f8bfab261a32eee1e90f
- Вызовов LLM за ход: 11 · 67 с

Что увидел игрок (дословно):

> Вы находите плавник. Вы берёте его в руки. Плавник теперь у вас в руках.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 23 · нога make

- Ввод игрока: «Оторву полосу от подола рубахи.»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 21 → 21
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): M2C_TARGET_A1_APPLICABILITY_DATA_GAP: M2C_TARGET_A1_APPLICABILITY_DATA_GAP
- Вызовов LLM за ход: 4 · 59 с

Что увидел игрок (дословно):

> Вы находите плавник. Вы берёте его в руки. Плавник теперь у вас в руках.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 24 · нога make

- Ввод игрока: «Оторву лоскут от нижней рубахи.»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 21 → 21
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: Turn-step semantic grounding is invalid. [operation_semantic_grounding]
- Вызовов LLM за ход: 4 · 75 с

Что увидел игрок (дословно):

> Вы находите плавник. Вы берёте его в руки. Плавник теперь у вас в руках.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 25 · нога make

- Ввод игрока: «Отрежу кусок от штанов на повязку.»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 21 → 21
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: TURN_STEP_PLAN_INVALID: $.operations[0].action_production.result_descriptor.source_fact_delta only a surviving partial source requires a fact delta; $.operations[0].action_production.material_extent material extent must match the physical identity transition [identity_shape; material_extent_shape]
- Вызовов LLM за ход: 3 · 65 с

Что увидел игрок (дословно):

> Вы находите плавник. Вы берёте его в руки. Плавник теперь у вас в руках.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

## Persistence/readback

LLM-вызовы за прогон: 163 (ошибок транспорта/статуса: 1); по ролям:

```
13× Return only one JSON object containing the ordinary semantic
33× You are a strict evidence auditor of Russian game prose. Sil
22× Return only {"prose":"<complete Russian prose>"}. The server
1× Return only {"prose":"<complete opening>"}. Write 2-4 connec
1× Return only {"pass":<boolean>,"failed_checks":["<required ch
50× Return only one JSON object with exactly these six keys: sch
29× Return only one JSON object containing the semantic choice f
2× Return only one plain JSON object with the semantic conversa
5× Return only {"pass":true,"concerns":[]} or {"pass":false,"co
6× Return only {"replacements":[{"prose":"<complete repaired Ru
1× Return only JSON with exactly mode and support_refs. mode is
```

Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):

```
{
 "state_version": "21",
 "position": {
  "slot": "arrival",
  "origin": "canonical",
  "site_id": "canonical:09187d048e0c6e2fc515380c2e91e18255c0c520fd53f74a83a002b9c69998bc:site",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access",
  "generated_template": null
 },
 "placements_here": [],
 "npc_placements_all": [
  {
   "slot": "focus",
   "entity_id": "npc_cee5373ac175412186574b6b",
   "g6_instance_id": "baseline:g5_node_296ed375ba0f190650b6a493:g6:main"
  }
 ],
 "items": [
  {
   "holder": "player_character_8f043d551aa9fdf5558a907f",
   "item_id": "item_3f39c13f3e0147c3b719fddb",
   "position": "equipped"
  },
  {
   "holder": "player_character_8f043d551aa9fdf5558a907f",
   "item_id": "item_647013cf5dd0436101d5e89f",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_a03451e55ee09c1cea7e8783",
   "position": "equipped"
  },
  {
   "holder": "player_character_8f043d551aa9fdf5558a907f",
   "item_id": "item_d1b52371ab89f8e981973c33",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_f178bf72560b82190532ce42",
   "position": "equipped"
  },
  {
   "holder": "player_character_8f043d551aa9fdf5558a907f",
   "item_id": "ordinary_item_a980f8bfab261a32eee1e90f",
   "position": "hands"
  }
 ],
 "party_items": [
  {
   "item_id": "item_3f39c13f3e0147c3b719fddb",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_647013cf5dd0436101d5e89f",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_a03451e55ee09c1cea7e8783",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_d1b52371ab89f8e981973c33",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_f178bf72560b82190532ce42",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "ordinary_item_a980f8bfab261a32eee1e90f",
   "state_version": 1,
   "action_production": false
  }
 ],
 "resource_nodes": [
  {
   "state_version": 2,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_driftwood_v1:d942f63fc1e25071d8caf816",
   "quantity_numerator": 99,
   "quantity_denominator": 1
  }
 ],
 "resource_decrements": [
  {
   "after_numerator": 99,
   "before_numerator": 100,
   "resource_node_id": "m2c_finite_driftwood_v1:d942f63fc1e25071d8caf816",
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
   "exchange_id": "exchange:627edb60f60e1e3abd09d705675da7f6",
   "speaker_ref": {
    "entity_id": "npc_cee5373ac175412186574b6b",
    "entity_kind": "npc"
   },
   "dominant_act": "answer",
   "statement_id": "statement:627edb60f60e1e3abd09d705675da7f6aa624ebabffeeae75a33c6a0d61b9758:2",
   "utterance_text": "Об этом я ничего подтвердить не могу.",
   "conversation_id": "conversation:627edb60f60e1e3abd09d705675da7f6",
   "source_plan_ref": {
    "entity_id": "semantic-plan:627edb60f60e1e3abd09d705675da7f6aa624ebabffeeae75a33c6a0d61b9758:2",
    "entity_kind": "semantic_plan"
   },
   "interaction_tags": [],
   "message_completeness": "complete",
   "social_delivery_result": null,
   "intended_addressee_refs": [
    {
     "entity_id": "player_character_8f043d551aa9fdf5558a907f",
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
| start | pass | партия party:d2cece5d9924e5bf860a628a, место vikhtuy_locality_household_cluster |
| walk out | pass | места Вихтуя по ходу: vikhtuy_locality_household_cluster → vikhtuy_locality_work_storage → vikhtuy_locality_water_access |
| meet | pass | на месте vikhtuy_locality_household_cluster: NPC по SQL npc_cee5373ac175412186574b6b |
| talk | pass | реплика NPC записана (+1) |
| take | pass | запас m2c_finite_driftwood_v1:d942f63fc1e25071d8caf816: 100 → 99, предмет в руках |
| make | fail | все 3 фразы без предмета; последняя причина: ход не прошёл: TEMPORARY_ACTION_UNAVAILABLE |

- **walk out**: ходов движения: 20, из них без смены места: 18; на стартовом экране проходов не было, понадобился «Осматриваюсь вокруг.»
- **meet**: на экране: панель людей пуста; NPC в G6 игрока по SQL: 1
- **talk**: последняя реплика NPC в снимке: {"claims":[],"schema":"conversation_statement_event_v1","duration":{"owner":"approved_activity_contract","activity_ref":"novgorod_live_world_conversation_brief"},"spoken_at":{"whole_minutes":"261123","subminute_numerator":"0","subminute_denominator":"1"},"topic_refs":[],"exchange_id":"exchange:627edb60f60e1e3abd09d705675da7f6","speaker_ref":{"entity_id":"npc_cee5373ac175412186574b6b","entity_kind":"npc"},"dominant_act":"answer","statement_id":"statement:627edb60f60e1e3abd09d705675da7f6aa624ebabffeeae75a33c6a0d61b9758:2","utterance_text":"Об этом я ничего подтвердить не могу.","conversation_id"

## Result

**PARTIAL**: start — pass; walk out — pass; meet — pass; talk — pass; take — pass; make — fail.
