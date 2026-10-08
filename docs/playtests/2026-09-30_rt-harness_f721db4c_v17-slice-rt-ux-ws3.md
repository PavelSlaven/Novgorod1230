# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_work_storage_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `fleet/rt-ux`, HEAD `f721db4c5b01a58ad6a924fac3c9e95768886cda`.
- Прогон `rt-ux-ws3`: 2026-09-30T08:29:09.724Z — 2026-09-30T08:52:04.824Z (1375 с).
- Сценарий `novgorod_vikhtuy_work_storage_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `/srv/novgorod-work/prose-test/llm-settings.json` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **реальный Giga**.
- Бюджет: 24 ходов (из них 3 зарезервированы под make), дедлайн 26 мин.
- Квалификация модели при старте: выполнена, 19 вызовов LLM.

## Gameplay transcript

### Открытие партии

- Партия `party:64fd259bee1a391200cb341f`; попыток new-game: 1; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 0.

Что увидел игрок (дословно):

> Вы стоите на низкой, ровной земле, покрытой илистым и глинистым грунтом. Перед вами виден речной проток и кромка берега, а отдельные деревья возвышаются над нижним ярусом растительности. Земля усеяна травой, осоками и кустарником; у самой воды также видна растительность, а на поверхности заметны остатки трав и осок, а также обломки кустарниковых ветвей.
> 
> Вы — Микула, лесной промысловик. Ваше тело не ранено, сил достаточно для работы, и сильного голода нет. На вас надета нижняя рубаха, штаны и низкая кожаная обувь.

### Ход 1 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 0 → 1
- Вызовов LLM за ход: 5 · 32 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 2 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 1 → 2
- Вызовов LLM за ход: 7 · 42 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места, где вы — Микула, лесной промысловик, и видите окрестности.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 3 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 2 → 3
- Вызовов LLM за ход: 7 · 36 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места, Окрестности, где вы, Микула, лесной промысловик, находитесь.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 4 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 3 → 4
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 5 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 4 → 5
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 6 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 5 → 6
- Вызовов LLM за ход: 7 · 37 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 7 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure); state_version 6 → 7
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Перед тобой Проход 2. Цель «Проход 2» не достигнута.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 8 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 7 → 8; запас m2c_finite_driftwood_v1:74b2bd209fa5dcb2e27782b0: — → 100
- Вызовов LLM за ход: 5 · 40 с

Что увидел игрок (дословно):

> Окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 9 · нога take

- Ввод игрока: «Беру плавник.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 8 → 9; запас m2c_finite_driftwood_v1:74b2bd209fa5dcb2e27782b0: 100 → 99; новые предметы: ordinary_item_bd45ac6f5d32f2ed971781f2
- Вызовов LLM за ход: 11 · 48 с

Что увидел игрок (дословно):

> Вы замечаете «Плавник». Вы берёте его в руки.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 10 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus; state_version 9 → 10
- Вызовов LLM за ход: 7 · 35 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места, где вы — Микула, лесной промысловик, в окрестностях.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 11 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 10 → 11
- Вызовов LLM за ход: 5 · 30 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 12 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 11 → 12
- Вызовов LLM за ход: 7 · 30 с

Что увидел игрок (дословно):

> Проход 2. Цель «Проход 2» не достигнута.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 13 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus; state_version 12 → 13
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, и перед вами открываются окрестности. Вас зовут Микула, и вы — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 14 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure; state_version 13 → 14
- Вызовов LLM за ход: 7 · 35 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места, оставаясь Микулой, лесным промысловиком, в окрестностях.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 15 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus; state_version 14 → 15
- Вызовов LLM за ход: 7 · 38 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 16 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure; state_version 15 → 16
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 17 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure); state_version 16 → 17
- Вызовов LLM за ход: 5 · 26 с

Что увидел игрок (дословно):

> Перед тобой Проход 2. Цель «Проход 2» не достигнута.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 18 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival; state_version 17 → 18; запас m2c_finite_deadwood_v1:32a30f6df60a776af4848f9e: — → 60
- Вызовов LLM за ход: 5 · 41 с

Что увидел игрок (дословно):

> Окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4», «Проход 5»

### Ход 19 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus; state_version 18 → 19
- Вызовов LLM за ход: 5 · 31 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, и перед вами открываются окрестности. Вас зовут Микула, и вы занимаетесь лесным промыслом.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

### Ход 20 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival; state_version 19 → 20
- Вызовов LLM за ход: 5 · 30 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4», «Проход 5»

### Ход 21 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival); state_version 20 → 21
- Вызовов LLM за ход: 7 · 31 с

Что увидел игрок (дословно):

> Проход 2 не достигнут.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

### Ход 22 · нога make

- Ввод игрока: «Оторву полосу от подола рубахи.»
- HTTP: 409, ошибка TURN_NOT_SAVED (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival); state_version 21 → 21
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: TURN_STEP_PLAN_INVALID: $.operations[0].action_production.result_descriptor.source_fact_delta only a surviving partial source requires a fact delta; $.operations[0].action_production.material_extent material extent must match the physical identity transition [identity_shape; material_extent_shape]
- Вызовов LLM за ход: 3 · 42 с

Что увидел игрок (дословно):

> Проход 2 не достигнут.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

### Ход 23 · нога make

- Ввод игрока: «Оторву лоскут от нижней рубахи.»
- HTTP: 409, ошибка WORLD_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival); state_version 21 → 21
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): M2C_TARGET_A1_APPLICABILITY_DATA_GAP: M2C_TARGET_A1_APPLICABILITY_DATA_GAP
- Вызовов LLM за ход: 4 · 58 с

Что увидел игрок (дословно):

> Проход 2 не достигнут.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

### Ход 24 · нога make

- Ввод игрока: «Отрежу кусок от штанов на повязку.»
- HTTP: 409, ошибка WORLD_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival); state_version 21 → 21
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): M2C_TARGET_A1_APPLICABILITY_DATA_GAP: M2C_TARGET_A1_APPLICABILITY_DATA_GAP
- Вызовов LLM за ход: 4 · 50 с

Что увидел игрок (дословно):

> Проход 2 не достигнут.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

## Persistence/readback

LLM-вызовы за прогон: 161 (ошибок транспорта/статуса: 0); по ролям:

```
13× Return only one JSON object containing the ordinary semantic
35× You are a strict evidence auditor of Russian game prose. Sil
22× Return only {"prose":"<complete Russian prose>"}. The server
2× Return only {"prose":"<complete opening>"}. Write 2-4 connec
2× Return only {"pass":<boolean>,"failed_checks":["<required ch
47× Return only one JSON object with exactly these six keys: sch
28× Return only one JSON object containing the semantic choice f
8× Return only {"replacements":[{"prose":"<complete repaired Ru
1× Return only JSON with exactly mode and support_refs. mode is
3× Return only {"pass":true,"concerns":[]} or {"pass":false,"co
```

Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):

```
{
 "state_version": "21",
 "position": {
  "slot": "arrival",
  "origin": "canonical",
  "site_id": "canonical:28274ee8f4580c2acbfbfed50027c3815e2f40c1f71b1a51fe25fe1fde3fc303:site",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path",
  "generated_template": null
 },
 "placements_here": [],
 "npc_placements_all": [],
 "items": [
  {
   "holder": "player_character_9a73539995d8dd60371afba7",
   "item_id": "item_70823717dc306c38fc6e064f",
   "position": "equipped"
  },
  {
   "holder": "player_character_9a73539995d8dd60371afba7",
   "item_id": "item_c20fca8c48a3c5feb5cf87e6",
   "position": "equipped"
  },
  {
   "holder": "player_character_9a73539995d8dd60371afba7",
   "item_id": "item_c240cb62046db53658d2be55",
   "position": "equipped"
  },
  {
   "holder": "player_character_9a73539995d8dd60371afba7",
   "item_id": "ordinary_item_bd45ac6f5d32f2ed971781f2",
   "position": "hands"
  }
 ],
 "party_items": [
  {
   "item_id": "item_70823717dc306c38fc6e064f",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_c20fca8c48a3c5feb5cf87e6",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_c240cb62046db53658d2be55",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "ordinary_item_bd45ac6f5d32f2ed971781f2",
   "state_version": 1,
   "action_production": false
  }
 ],
 "resource_nodes": [
  {
   "state_version": 1,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_deadwood_v1:32a30f6df60a776af4848f9e",
   "quantity_numerator": 60,
   "quantity_denominator": 1
  },
  {
   "state_version": 2,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_driftwood_v1:74b2bd209fa5dcb2e27782b0",
   "quantity_numerator": 99,
   "quantity_denominator": 1
  }
 ],
 "resource_decrements": [
  {
   "after_numerator": 99,
   "before_numerator": 100,
   "resource_node_id": "m2c_finite_driftwood_v1:74b2bd209fa5dcb2e27782b0",
   "decrement_numerator": 1
  }
 ],
 "npc_statements": []
}
```

## Findings

| нога | итог | причина |
|---|---|---|
| start | pass | партия party:64fd259bee1a391200cb341f, место vikhtuy_locality_work_storage |
| walk out | pass | места Вихтуя по ходу: vikhtuy_locality_work_storage → vikhtuy_locality_water_access → vikhtuy_locality_forest_path |
| meet | blocked | ни одного видимого NPC на местах: vikhtuy_locality_work_storage, vikhtuy_locality_water_access, vikhtuy_locality_forest_path (бюджет ходов исчерпан) |
| talk | blocked | нет видимого NPC: meet не пройден |
| take | pass | запас m2c_finite_driftwood_v1:74b2bd209fa5dcb2e27782b0: 100 → 99, предмет в руках |
| make | fail | все 3 фразы без предмета; последняя причина: ход не прошёл: WORLD_ACTION_UNAVAILABLE |

- **walk out**: ходов движения: 20, из них без смены места: 18
- **meet**: NPC-размещений во всей партии по SQL: 0

## Result

**PARTIAL**: start — pass; walk out — pass; meet — blocked; talk — blocked; take — pass; make — fail.
