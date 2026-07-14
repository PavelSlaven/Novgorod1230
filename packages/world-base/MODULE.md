# @rus/world-base

## Назначение

Read-only порт доступа к канонической базе мира.

## Владеет

- контрактом `WorldBaseReader`;
- запретом mutating SQL;
- передачей query и params в injected read-only adapter.

## Не делает

- не пишет в world_base;
- не читает и не изменяет party state;
- не строит смысловые выводы из данных;
- не импортирует PostgreSQL driver.

## Публичный API

`createWorldBaseReader({ query })`.

## Контракты

Метод `read(sql, params)` принимает только read-only запрос и возвращает результат переданного query port.

## Допустимые зависимости

Стандартная библиотека Node.js.

## Запрещённые зависимости

Party store, apps, legacy, provider SDK, UI и DB driver.

## Инварианты

Любая SQL-команда изменения схемы или данных отклоняется до вызова adapter.

## Ошибки

Ошибка отсутствующего query port и ошибка попытки mutating SQL.

## Тесты

Foundation tests и production PostgreSQL integration suite.

## Совместимость

Read-only boundary не ослабляется без отдельного migration gate.
