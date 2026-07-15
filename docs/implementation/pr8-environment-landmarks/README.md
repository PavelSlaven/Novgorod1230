# PR8: procedural environmental landmarks, cues and traces

## Цель

Ввести code-only materializer постоянных ориентиров, временных сигналов и следов среды в пределах уже существующей G1 без изменения канонического графа.

## Scope

- новый `@rus/environment-landmarks`;
- authoring DDL и party persistence;
- new-game/turn/visibility/movement/presentation integration только через публичные контракты;
- обязательные вертикали: landmark, smoke, cart trace.

## Базовая точка

- base branch: `main`;
- base commit: `0820ebd3fbbda6fd990c628d6a13a5893e3b18d4`;
- working branch: `feature/pr8-environment-landmarks`.

## Принятые решения

Baseline привязан к партии, world revision, G1 и версии materializer. Для выбора используются только public API `@rus/materialization`; LLM и UI получают только безопасную проекцию, без source ID и точной позиции.

## Проверки

- RED: `node --test packages/environment-landmarks/test/domain.test.js` — ожидаемо упал до создания пакета.
- GREEN: `node --test packages/environment-landmarks/test/domain.test.js packages/materialization/test/materialization.test.js` — 15/15 passed.
- `npm run world-db:schema-doc` — passed; generated `SCHEMA_REFERENCE.md` обновлён.
- `npm run world-db:schema-check` — passed; 125 таблиц.
- `npm run world-db:schema-doc-check` — passed до обновления field descriptions; будет повторён перед сдачей.
- `npm run docs:generate` выполнил generation outputs, но финальная validation заблокирована несвязанными untracked legacy runtime files в `data/regional-summary-cache/` и `data/world-sessions/`.

## Выполнено

- создан пакет `@rus/environment-landmarks` с четырьмя утверждёнными public API;
- baseline использует только canonical digest, seed derivation, `mulberry32_v1` и deterministic IDs из `@rus/materialization`;
- добавлены fail-closed проверки required candidates, causal source и hidden-field boundary;
- добавлены DDL authoring catalog и party-state migration;
- добавлен public export `deterministicInstanceId` в `@rus/materialization`, чтобы PR8 не дублировал RNG/ID implementation.

## Известные ограничения / data gaps

- в репозитории пока отсутствуют approved PR8 category/template/profile/rule records и региональный catalog bundle; runtime обязан оставаться hard-blocked для required rules;
- интеграционные adapters Stage 13, turn workflow, movement, visibility и presentation ещё требуют отдельного согласования их versioned input contracts. Они не будут заполняться неявными fallback-данными.

## Аудит

Первый обязательный аудит: `CHANGES REQUIRED`.

Исправлены обнаруженные подключения persistence:

- `002_environment_landmarks.sql` включена в game-server migrations и party-db seed;
- Stage 25 допускает новые normalized `party_environment_*` targets;
- baseline unique key дополнен `world_revision_id`, trace persistence содержит `age_minutes`;
- authoring tables зарегистрированы в import/readiness registry.

Открытые блокеры аудита:

- отсутствуют approved environment authoring records и их immutable regional catalog bundle;
- отсутствуют согласованные versioned contracts, с которыми Stage 13 и turn workflow могут безопасно запросить baseline/update;
- без этих входов запрещено подключать неявный fallback или создавать семантические данные в коде.
