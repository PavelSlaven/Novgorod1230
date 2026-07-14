# План миграции Game server и Game web

Дата: 2026-07-12  
Исходный релиз: `0.15.0-migration.15`  
Целевой релиз: `0.16.0-migration.16`

## Цель

Создать application composition layer поверх готовых `@rus/new-game`, `@rus/turn`, `@rus/narration`, `@rus/presentation`, `@rus/world-base`, `@rus/party-store` и `@rus/llm-runtime`, не перенося доменную логику в HTTP или браузер.

## Работы

1. Создать `apps/game-server` composition root с явными workflow, LLM, world-base, party-store, session и delivery ports.
2. Оставить legacy application route отдельным quarantined fallback до shadow run/cutover.
3. Опубликовать versioned HTTP API `/api/v1` для health, new game, screen read, opening acknowledgement и turn submission.
4. Установить public payload gate до отправки HTTP response.
5. Создать bounded JSON reader, typed error envelopes и allowlisted static asset resolver.
6. Разложить `apps/game-web` на API client, UI-only store, router, bootstrap, feature renderers и shared helpers.
7. Принимать только `FirstGameScreen v1` и `TurnScreen v1`; блокировать hidden/private/write-plan/audit fields.
8. Отправлять пользовательские действия только как `intent_not_fact` inputs.
9. Добавить application tests и architecture gates.
10. Обновить manifest, status, checksums и release archive.

## Критерии завершения

- server routes не содержат domain logic и SQL;
- game-web не импортирует DB, server, workflow, domain или provider packages;
- feature renderers не изменяют чужой DOM;
- UI state не копирует party/world state;
- versioned read models проходят client/server security gates;
- legacy fallback остаётся доступным до отдельного cutover;
- полный test pipeline, architecture check и release hygiene проходят.

## За пределами фазы

- реальные provider calls;
- подключение к production PostgreSQL;
- browser automation E2E;
- production-corpus shadow run;
- переключение default entrypoint и cutover.
