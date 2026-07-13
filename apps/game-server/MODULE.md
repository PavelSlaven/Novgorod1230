# @rus/game-server

## Назначение

Composition root, production infrastructure adapters и HTTP boundary модульной игры. Пакет связывает публичные APIs, но не содержит игровых правил.

## Владеет

- versioned HTTP routes `/api/v1/*`;
- static delivery `@rus/game-web`;
- builtin production composition;
- PostgreSQL pool/session/delivery/Stage 25 adapters;
- provider role-runner adapter;
- startup probes и technical party-runtime migrations;
- feature-flag bootstrap.

## Не владеет

- выбором мира, персонажей, предметов, причин или последствий;
- prompts и semantic repair policy;
- созданием write plan;
- UI read models;
- domain formulas.

## Public API

Основной entrypoint экспортирует composition, HTTP и generic adapters. Production infrastructure доступна через `@rus/game-server/production`.

## Инварианты

- SQL и `pg` находятся только в `src/infrastructure/postgres`;
- world-base adapter read-only;
- Stage 25 исполняет только approved physical plan;
- runtime bindings обязательны и не имеют deterministic fallback;
- HTTP route вызывает только composition root;
- public response проходит hidden-leak gate;
- legacy fallback изолирован до cutover.

## Knowledge-source binding

Production composition creates a verified `KnowledgeSourceReader` from explicit source/generated roots and passes it to runtime bindings as `ports.knowledgeSource`. Startup is fail-closed for damaged corpus or stale generated artifacts.
