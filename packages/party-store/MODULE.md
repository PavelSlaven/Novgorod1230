# @rus/party-store

## Назначение

Публичный порт persistence для чтения и идемпотентной фиксации утверждённого состояния партии.

## Владеет

- party persistence contract;
- idempotency key и committed-result semantics;
- Stage 25 persistence port;
- границей между утверждённым write plan и infrastructure executor.

## Не делает

- не строит SQL и write plan;
- не создаёт игровые сущности;
- не читает world_base;
- не импортирует PostgreSQL driver.

## Публичный API

`createPartyStore` и экспорт `./stage-25`.

## Контракты

Получает только утверждённый write plan и injected transaction function. Повторный вызов с тем же idempotency key возвращает сохранённый результат.

## Допустимые зависимости

`@rus/kernel`.

## Запрещённые зависимости

Apps, world-base, provider SDK, UI, legacy и конкретный DB driver.

## Инварианты

Код не преобразует намерение игрока в запись БД и не дополняет write plan.

## Ошибки

Ошибки отсутствующего transaction port и ошибки infrastructure transaction.

## Тесты

Foundation tests, Stage 25 tests и PostgreSQL integration suite.

## Совместимость

Commit/idempotency contract изменяется только с новой версией Stage 25 handoff.
