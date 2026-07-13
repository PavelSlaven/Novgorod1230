# План фазы: production DB/provider integration и browser E2E

Дата: 2026-07-12  
Исходный релиз: `0.17.0-migration.17`

## Цель

Собрать штатный production composition root, подключить реальные технические адаптеры PostgreSQL и LLM transport, подтвердить их интеграцию и выполнить браузерный end-to-end путь без переноса смысловой логики в инфраструктурный код.

## Работы

1. Добавить builtin production composition в `apps/game-server`.
2. Разделить подключения `world_base` и party runtime на независимые PostgreSQL pools.
3. Реализовать DB-backed session/delivery stores и технические Stage 25 ports.
4. Добавить runtime migrations только для технических таблиц `party_runtime`.
5. Подключить `@rus/llm-runtime` через production role-runner adapter.
6. Ввести явный runtime-bindings contract для new-game/turn semantic ports.
7. Выполнить DB/provider integration tests.
8. Выполнить Chromium E2E: новая игра → FirstGameScreen → acknowledgement → первый ход → TurnScreen.
9. Усилить architecture gates: SQL и `pg` допустимы только в PostgreSQL infrastructure adapters.
10. Обновить status, manifest, reports и release archive.

## Инварианты

- SQL не появляется в workflow, domain, HTTP или web слоях.
- `world_base` остаётся read-only.
- Stage 25 исполняет только уже утверждённый physical write plan.
- Provider adapter не содержит prompts и смысловых repair-правил.
- Browser получает только versioned hidden-free read models.
- Текст игрока остаётся intent, а не утверждённым фактом мира.

## Критерии завершения

- builtin production composition запускается с явным bindings module;
- PostgreSQL-backed session/delivery/Stage 25 adapters проходят integration tests;
- provider transport проходит request/response contract test;
- Chromium выполняет полный первый пользовательский путь;
- полный `npm test`, architecture check и release hygiene проходят;
- корневой `MIGRATION_PHASES_SHORT.md` обновлён.
