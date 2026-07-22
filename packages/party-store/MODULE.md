# @rus/party-store

## Назначение

Публичный порт persistence v2 для нормализованной и идемпотентной фиксации состояния партии.

## Владеет

- party persistence contract;
- idempotency key и committed-result semantics;
- Stage 25 persistence port;
- границей между утверждённым write plan и infrastructure executor.

## Не делает

- не строит SQL и логический write plan;
- не создаёт игровые сущности;
- не читает world_base;
- не импортирует PostgreSQL driver.

## Публичный API

`createPartyStore` и экспорт `./stage-25`.

`@rus/party-store/spatial-v3` contains only P08 fail-closed target ports: `createSpatialV3Repository` and `createCombinedWritePlanCommitter`. They neither invoke the v2 store nor write data.

## Контракты

Получает только утверждённый `party_runtime_v2` write plan и injected transaction function. Party v1 не поддерживается для новых партий.

## Допустимые зависимости

`@rus/kernel` и `@rus/contracts`.

## Запрещённые зависимости

Apps, world-base, provider SDK, UI, legacy и конкретный DB driver.

## Инварианты

Schema adapter переводит только известные legacy spec aliases в фиксированные таблицы v2 и отклоняет неизвестные/v1 targets; он не добавляет смысловые сущности.

Production adapter в `@rus/game-server` квалифицирует эти targets как `party_runtime.*`; логический package не импортирует PostgreSQL.

## Ошибки

Ошибки отсутствующего transaction port и ошибки infrastructure transaction.

## Тесты

Foundation tests, Stage 25 tests и PostgreSQL integration suite.

## Совместимость

Commit/idempotency contract изменяется только с новой версией Stage 25 handoff.
