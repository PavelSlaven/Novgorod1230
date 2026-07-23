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

## Исполнение

`runModularNewGamePipeline` запускает декларативный stage plan через `@rus/pipeline-engine`. Каждый stage имеет собственный package export и compatibility subpath. Соседние stages передают данные только через versioned artifacts.

## Инфраструктура

World-base, party persistence и LLM transport передаются через composition root. Код этапов не импортирует DB driver или provider SDK.

До Stage 8 composition root один раз загружает active
`item_container_materialization_v2` pin через `@rus/runtime-catalog`, проверяет
его compatible full-world tuple и exact import. Один immutable domain pin
передаётся через Stages 8, 13, 14, 16, 24 и 25. Active pointer повторно не
читается.

Stage 8 и Stage 13 строят свои deterministic projections только из
`runtime_catalog_context.applicable_catalog`: соответственно
`approved_item_catalog_snapshot` и G4-scoped `allowed_g5_template_set`.
Stage 13 сохраняет template set как auxiliary artifact `1300`, чтобы Stage 14
проверял ровно тот же input. На границах Stages 8/13/14/16 проверяются exact
domain `source_catalog_digest` и compatible world revision. В materialization
trace `catalog_digest` означает domain pin, а `catalog_bundle_digest` —
digest неизменяемой G5 projection.

## Границы

- Stage 19 остаётся hidden.
- Stage 20 создаёт visible projection.
- Stages 22–23 получают только visible inputs.
- Stage 13, 15 и 16 не вызывают LLM для создания или repair экземпляров.
- Stage 14 и placement audits могут использовать LLM только без права изменения draft.
- Stage 24 кодом строит фиксированный write plan для `party_runtime_v2`.
- Stage 25 исполняет только утверждённый plan.
- Stage 24 включает party/run domain pins в тот же logical write plan.
- Stage 25 сохраняет party, pins и materialization rows одной транзакцией.
- Stage 26 строит публичный экран без hidden fields.
