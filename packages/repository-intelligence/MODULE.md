# @rus/repository-intelligence

## Назначение

Read-only инструмент разработки, объединяющий публичный нормативный API `@rus/knowledge-source` с локальным Graphify-графом репозитория.

## Владеет

- операциями `build`, `status` и `query`;
- раздельным hybrid envelope с typed errors;
- локальным Graphify build manifest с версией и commit SHA.

## Не делает

- не зависит от game runtime, SQL, LLM, `world_base` или `party_runtime`;
- не превращает Graphify relation в нормативное правило;
- не выполняет скрытую пересборку во время query.

## Публичный API

`createRepositoryIntelligenceService({ root })`, `RepositoryIntelligenceError`, `GRAPHIFY_VERSION`.

## Инварианты

Полный Graphify artifact локальный и не редактируется вручную. `status` проверяет Graphify `0.9.17`, graph artifact и commit SHA; `query` не запускает Graphify при missing/stale graph. `degraded` у knowledge-source — видимое предупреждение, не нормативная готовность.

## Тесты

`npm run test:repository-intelligence`.
