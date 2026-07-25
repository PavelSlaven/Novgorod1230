# Политика контрактов

## Канонические владельцы

- межмодульные versioned contracts и schema names — `@rus/contracts`;
- локальные domain contracts — пакет-владелец предметной области;
- pipeline lifecycle — `@rus/pipeline-engine`;
- role configuration — `@rus/llm-runtime`;
- UI read models — `@rus/presentation`;
- DB DDL — `schemas/`;
- generated reference — `generated/`, создаётся командой и не редактируется вручную.

## Версионирование

Публичный handoff содержит явные `version` и `schema`. Несовместимое изменение требует нового schema/version либо нового package subpath. Переименование поля без compatibility boundary считается несовместимым изменением.

## Stage boundary

Каждый stage выполняет одну смысловую операцию:

```text
input contract
-> local precheck
-> semantic operation through explicit port
-> local validation/audit
-> approved result | typed failure | repair request
```

Stage не читает mutable global context и не импортирует соседний stage.

## Hidden/visible boundary

Hidden state не передаётся narration, presentation или game-web. Публичный экран строится только из approved visible context/narration result. Любое поле аудита, provider payload, write plan или hidden state на public boundary является ошибкой.

## Persistence boundary

Код исполняет только утверждённый physical write plan. `party-store` не дополняет план смысловыми данными. Dry-run выполняется с rollback; commit защищён idempotency key.

## Temporal target boundary

Historical P28 evidence did not activate production. The later separate
`versioned production activation cutover` release
`spatial-v3-production-v1` activated current `temporal-world-v1.1` contracts
as the sole production route; accepted `temporal-world-v1` remains an
immutable `4.3.0-target.1` snapshot. Production v2 is only an explicit
migration/rollback source and cannot receive compatibility writes or provide
mixed authoritative reads. A temporal advance carries exact `(from,to]`
timestamps, policy/profile/catalog pins, one clock owner, explicit finite
limits and an idempotency context. Missing data and conflicts use typed
fail-closed results.

Pure owner outputs are proposals. `@rus/turn` merges them deterministically
into one logical change set; `@rus/party-store` validates the persistence
boundary; game-server's PostgreSQL transaction atomically stores factual state,
clock/effects, idempotency and `VisiblePackagePersistenceEnvelope`. Narration
is post-commit delivery work and consumes only that persisted player-safe
package.

## Generated reference

`npm run docs:generate` строит schema reference из экспортированных `*_SCHEMA*` constants и файлов `schemas/`. `npm run docs:check` подтверждает, что committed generated output совпадает с повторной генерацией.
