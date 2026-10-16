# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_household_cluster_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `fleet/rt-ux`, HEAD `f721db4c5b01a58ad6a924fac3c9e95768886cda`.
- Прогон `rt-ux-hh3`: 2026-09-30T09:00:15.235Z — 2026-09-30T09:10:27.894Z (613 с).
- Сценарий `novgorod_vikhtuy_household_cluster_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `/srv/novgorod-work/prose-test/llm-settings.json` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **реальный Giga**.
- Бюджет: 24 ходов (из них 3 зарезервированы под make), дедлайн 26 мин.
- Квалификация модели при старте: выполнена, 19 вызовов LLM.

## Gameplay transcript

### Открытие партии

- Партия `party:769761c5b52dc9b7e53ca203`; попыток new-game: 1; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 0.

Что увидел игрок (дословно):

> Вы — Микула, лесной промысловик. Тело не знает ран, и в нём достаточно сил для работы, а сильного голода нет. На вас нижняя рубаха, штаны и низкая кожаная обувь.
> 
> Перед вами различима вода. Кромка берега видна чётко, и за ней проступают очертания деревьев. Свет дня падает на всё это, не скрывая ничего, но и не добавляя лишнего.

### Ход 1 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 0 → 1
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 2 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival; state_version 1 → 2
- Вызовов LLM за ход: 10 · 48 с

Что увидел игрок (дословно):

> Факты хода сохранены; повествование ожидает повторной доставки.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 3 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 409, ошибка TRACE_PHASE_2_PRESENTATION_PENDING
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 2 → 2
- Вызовов LLM за ход: 0 · 4 с

Что увидел игрок (дословно):

> Факты хода сохранены; повествование ожидает повторной доставки.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 4 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 409, ошибка TRACE_PHASE_2_PRESENTATION_PENDING
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 2 → 2
- Вызовов LLM за ход: 0 · 4 с

Что увидел игрок (дословно):

> Факты хода сохранены; повествование ожидает повторной доставки.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 5 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 409, ошибка TRACE_PHASE_2_PRESENTATION_PENDING
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 2 → 2
- Вызовов LLM за ход: 0 · 4 с

Что увидел игрок (дословно):

> Факты хода сохранены; повествование ожидает повторной доставки.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 6 · нога make

- Ввод игрока: «Оторву полосу от подола рубахи.»
- HTTP: 409, ошибка TRACE_PHASE_2_PRESENTATION_PENDING
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 2 → 2
- Вызовов LLM за ход: 0 · 4 с

Что увидел игрок (дословно):

> Факты хода сохранены; повествование ожидает повторной доставки.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 7 · нога make

- Ввод игрока: «Оторву лоскут от нижней рубахи.»
- HTTP: 409, ошибка TRACE_PHASE_2_PRESENTATION_PENDING
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 2 → 2
- Вызовов LLM за ход: 0 · 4 с

Что увидел игрок (дословно):

> Факты хода сохранены; повествование ожидает повторной доставки.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 8 · нога make

- Ввод игрока: «Отрежу кусок от штанов на повязку.»
- HTTP: 409, ошибка TRACE_PHASE_2_PRESENTATION_PENDING
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 2 → 2
- Вызовов LLM за ход: 0 · 4 с

Что увидел игрок (дословно):

> Факты хода сохранены; повествование ожидает повторной доставки.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

## Persistence/readback

LLM-вызовы за прогон: 36 (ошибок транспорта/статуса: 0); по ролям:

```
12× Return only one JSON object containing the ordinary semantic
10× You are a strict evidence auditor of Russian game prose. Sil
4× Return only {"prose":"<complete Russian prose>"}. The server
1× Return only {"prose":"<complete opening>"}. Write 2-4 connec
1× Return only {"pass":<boolean>,"failed_checks":["<required ch
5× Return only one JSON object with exactly these six keys: sch
2× Return only one JSON object containing the semantic choice f
1× Return only {"replacements":[{"prose":"<complete repaired Ru
```

Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):

```
{
 "state_version": "2",
 "position": {
  "slot": "arrival",
  "origin": "canonical",
  "site_id": "g5:g5_node_b031ba3ff4b4ba9992e88c26",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster",
  "generated_template": null
 },
 "placements_here": [],
 "npc_placements_all": [],
 "items": [
  {
   "holder": "player_character_055905192783097282c24a47",
   "item_id": "item_5fc1cebb9d7c39908cb6630c",
   "position": "equipped"
  },
  {
   "holder": "player_character_055905192783097282c24a47",
   "item_id": "item_78261f4b5022b7a621ecc7de",
   "position": "equipped"
  },
  {
   "holder": "player_character_055905192783097282c24a47",
   "item_id": "item_bfdbe13c6c7a84efde5001f3",
   "position": "equipped"
  }
 ],
 "party_items": [
  {
   "item_id": "item_5fc1cebb9d7c39908cb6630c",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_78261f4b5022b7a621ecc7de",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_bfdbe13c6c7a84efde5001f3",
   "state_version": 1,
   "action_production": false
  }
 ],
 "resource_nodes": [],
 "resource_decrements": [],
 "npc_statements": []
}
```

## Findings

| нога | итог | причина |
|---|---|---|
| start | pass | партия party:769761c5b52dc9b7e53ca203, место vikhtuy_locality_household_cluster |
| walk out | fail | игрок не покинул стартовое место (3 хода подряд без сдвига (последняя ошибка: TRACE_PHASE_2_PRESENTATION_PENDING)) |
| meet | blocked | ни одного видимого NPC на местах: vikhtuy_locality_household_cluster (3 хода подряд без сдвига (последняя ошибка: TRACE_PHASE_2_PRESENTATION_PENDING)) |
| talk | blocked | нет видимого NPC: meet не пройден |
| take | blocked | ни на одном месте (vikhtuy_locality_household_cluster) нет непустого источника в party_resource_nodes (3 хода подряд без сдвига (последняя ошибка: TRACE_PHASE_2_PRESENTATION_PENDING)) |
| make | fail | все 3 фразы без предмета; последняя причина: ход не прошёл: TRACE_PHASE_2_PRESENTATION_PENDING |

- **walk out**: ходов движения: 5, из них без смены места: 5
- **meet**: NPC-размещений во всей партии по SQL: 0

## Result

**PARTIAL**: start — pass; walk out — fail; meet — blocked; talk — blocked; take — blocked; make — fail.
