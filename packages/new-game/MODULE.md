# @rus/new-game

## Назначение

Модульный workflow создания новой игры: изолированные Stages 2–26, compatibility facades и общий orchestrator.

## Владеет

- каталогом и публичными entrypoints Stages 2–26;
- stage-local precheck/validation/repair contracts;
- общим new-game orchestration order;
- handoff к Stage 25 persistence и Stage 26 first-screen result.

## Не делает

- не содержит конкретный provider transport или PostgreSQL adapter;
- не сочиняет мир deterministic-кодом;
- не хранит UI state;
- не выполняет соседний stage через внутренний импорт.

## Публичный API

`NEW_GAME_STAGE_CATALOG`, `runNewGamePipeline`, orchestrator exports и версионированные stage subpaths.

## Контракты

Каждый stage принимает точный input contract, выполняет одну смысловую операцию через LLM/ports, валидирует результат и возвращает result либо typed failure.

## Допустимые зависимости

`@rus/contracts`, `@rus/kernel`, `@rus/pipeline-engine`, `@rus/party-store` через публичные APIs.

## Запрещённые зависимости

Apps, UI, provider SDK, DB driver и внутренние файлы соседних stages.

## Инварианты

Код не создаёт смысловые сущности мира; repair выполняется только через утверждённый LLM route; commit идемпотентен.

## Ошибки

Stage-specific typed failures, validation failures, upstream repair requests и persistence failures.

## Тесты

Module/parity tests Stages 2–26, orchestrator tests, integration и browser E2E.

## Совместимость

Legacy facade доступен только через отдельный explicit rollback export; default modular graph его не загружает.
