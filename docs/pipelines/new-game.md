# New-game pipeline

Канонический владелец orchestration: `@rus/new-game`.

## Этапы

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
| 13 | g5-materialization | G5 scene graph draft |
| 14 | g5-audit | аудит G5 |
| 15 | npc-placement | начальное размещение NPC |
| 16 | item-placement | начальное размещение предметов |
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

## Исполнение

`runModularNewGamePipeline` запускает декларативный stage plan через `@rus/pipeline-engine`. Каждый stage имеет собственный package export и compatibility subpath. Соседние stages передают данные только через versioned artifacts.

## Инфраструктура

World-base, party persistence и LLM transport передаются через composition root. Код этапов не импортирует DB driver или provider SDK.

## Границы

- Stage 19 остаётся hidden.
- Stage 20 создаёт visible projection.
- Stages 22–23 получают только visible inputs.
- Stage 24 строит write plan через LLM-процедуру.
- Stage 25 исполняет только утверждённый plan.
- Stage 26 строит публичный экран без hidden fields.
