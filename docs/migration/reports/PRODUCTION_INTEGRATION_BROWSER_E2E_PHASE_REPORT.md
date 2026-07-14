# Отчёт фазы: production DB/provider integration и browser E2E

Дата: 2026-07-12  
Релиз: `0.18.0-migration.18`

## Выполнено

- Создан builtin `createProductionCompositionRoot`.
- Добавлены раздельные PostgreSQL pools для `world_base` и party runtime.
- Реализованы migrations `party_runtime`, DB-backed session store и delivery store.
- Реализованы Stage 25 idempotency, dry-run, atomic transaction и postcommit ports.
- SQL identifier allowlist и operation allowlist блокируют произвольные запросы из write plan.
- Добавлен production DeepSeek-compatible role runner через `@rus/llm-runtime`.
- Добавлен обязательный runtime-bindings module для semantic new-game/turn ports.
- Health response содержит результаты startup probes без секретов.
- Добавлены PostgreSQL/provider integration tests и Chromium browser E2E.
- Architecture checker разрешает SQL и `pg` только в `apps/game-server/src/infrastructure/postgres`.

## Проверки

- module tests: 217/217;
- package/domain tests: 30/30;
- application tests: 11/11;
- tool tests: 12/12;
- production integration tests: 3/3;
- Chromium E2E: 1/1;
- полный набор: 274/274;
- architecture boundaries: passed;
- release hygiene: passed;
- ZIP integrity: passed.

## Среда интеграции

- PostgreSQL adapter path проверен через `pg`-совместимый in-memory engine `pg-mem`.
- Provider transport проверен через локальный HTTP server с production request builder/parser.
- Chromium выполнял реальный `game-web` bundle. Из-за административной блокировки localhost в браузере HTTP передавался через Playwright transport bridge к настоящему Node HTTP server/handler.

## Не входит в фазу

- использование реальных production секретов;
- live staging smoke на внешнем PostgreSQL/DeepSeek;
- production-corpus shadow comparison;
- переключение legacy entrypoints;
- финальный cutover и rollback exercise.
