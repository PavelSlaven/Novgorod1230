# New-game pipeline

Канонический владелец orchestration: `@rus/new-game`.

## Production path на ветке PR #98 (v17)

Новая партия в live-world / v17 идёт через production composition root
(`createSpatialV3ProductionCompositionRoot` → public runtime / authored start / first-entry),
а не через декларативный stage-runner ниже. Локальный launcher: `npm run play:local`
([tools/local-play](../../tools/local-play/MODULE.md)); пара БД —
[DB_SCHEMA](../context/DB_SCHEMA.md) §1.1. Цепочки заполнения места и хода —
[ARCHITECTURE](../context/ARCHITECTURE.md) §1.1–1.2.

Старт v17 вызывает (имена стадий modular pipeline — ориентир, не sole entry):
- phase-1b → phase-1a: [`infrastructure/postgres/lower-dvina-trace-phase-1b.js`](../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js),
  [`internal/lower-dvina-trace-phase-1a.js`](../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js)
  (player validation — [`internal/lower-dvina-trace-player-validation.js`](../../apps/game-server/src/internal/lower-dvina-trace-player-validation.js));
- NPC first-entry: [`infrastructure/postgres/generated-npc-first-entry.js`](../../apps/game-server/src/infrastructure/postgres/generated-npc-first-entry.js);
- opening narration: [`runtime/authored-opening-narration.js`](../../apps/game-server/src/runtime/authored-opening-narration.js).
Стадии 11/12/16/22/23/24/25 modular table ниже на этом пути вызываются через эти модули, а не как sole runner.

## Modular stage table (legacy / removable)

Таблица стадий и `runModularNewGamePipeline` описывают **модульный** конвейер `@rus/new-game`
через `@rus/pipeline-engine` — мёртвый оркестратор в смысле production entry
([#127](https://github.com/PavelSlaven/Novgorod1230/issues/127)). **Production его не вызывает**
(`adapters/workflows.js` только реэкспортируется из [`src/index.js`](../../apps/game-server/src/index.js)).
Не расширять этот путь новой gameplay-логикой.

| Stage | Имя | Результат |
|---:|---|---|
| 2 | normalization | нормализованный технический запрос |
| 3 | historical-frame | утверждённая историческая рамка |
| 4 | regional-context | региональный контекст |
| 5 | start-candidates | кандидаты старта |
| 6 | candidate-place-templates | шаблоны мест-кандидатов |
| 7 | npc-candidates | кандидаты NPC |
| 8 | item-profile-candidates | кандидаты предметных профилей |
| 9 | start-node-selection | выбранный стартовый узел |
| 10 | start-place-audit | аудит места старта |
| 11 | player-character | персонаж игрока |
| 12 | player-character-audit | аудит персонажа |
| 13 | g5-materialization | code-only G5 instances и trace |
| 14 | g5-audit | аудит G5 |
| 15 | npc-placement | code-only NPC instances из profile sets |
| 16 | item-placement | code-only item/container/property instances |
| 17 | time-light-gate | согласование времени и света |
| 18 | character-knowledge-map | карта знаний персонажа |
| 19 | hidden-state | полный hidden scene state |
| 20 | visible-context | visible context package |
| 21 | visible-context-audit | аудит visible context |
| 22 | narrator-prose | черновик прозы |
| 23 | narrator-prose-audit | аудит прозы |
| 24 | party-db-write-plan | утверждённый physical write plan |
| 25 | party-commit | идемпотентный commit |
| 26 | first-game-screen | versioned FirstGameScreen result |

## Исполнение (modular, removable)

`runModularNewGamePipeline` запускает декларативный stage plan через `@rus/pipeline-engine`. Каждый stage имеет собственный package export и compatibility subpath. Соседние stages передают данные только через versioned artifacts.

## Инфраструктура

World-base, party persistence и LLM transport передаются через composition root. Код этапов не импортирует DB driver или provider SDK.

До Stage 8 composition root один раз загружает active `item_container_materialization_v2` pin через `@rus/runtime-catalog`. Один immutable domain pin передаётся через Stages 8, 13, 14, 16, 24 и 25.

## Границы

- Stage 19 остаётся hidden; Stage 20 — visible projection; Stages 22–23 — только visible inputs.
- Stage 13, 15 и 16 не вызывают LLM для создания экземпляров.
- Stage 24–25: фиксированный write plan и одна транзакция (на modular path).
- Production new-game / first screen на v17 — через composition root выше.

## Ссылки

- [packages/new-game/MODULE.md](../../packages/new-game/MODULE.md)
- [ARCHITECTURE](../context/ARCHITECTURE.md)
- LW-001…LW-003, LW-033
