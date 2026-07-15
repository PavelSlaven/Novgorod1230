# Политика контрактов

## Канонические владельцы

- межмодульные versioned contracts и schema names — `@rus/contracts`;
- локальные domain contracts — пакет-владелец предметной области;
- pipeline lifecycle — `@rus/pipeline-engine`;
- role configuration — `@rus/llm-runtime`;
- UI read models — `@rus/presentation`;
- perception event/snapshot/result/routing schema names and boundary validators — `@rus/contracts`;
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

## Generated reference

`npm run docs:generate` строит schema reference из экспортированных `*_SCHEMA*` constants и файлов `schemas/`. `npm run docs:check` подтверждает, что committed generated output совпадает с повторной генерацией.
