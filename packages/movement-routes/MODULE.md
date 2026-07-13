# @rus/movement-routes

## Назначение

Route availability, knowledge, traversal contracts, GU/time cost and orientation requests. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- route availability and requirements
- travel cost formulas
- traversal request/result shapes
- orientation and failure consequence requests

## Не делает

- choosing a destination for the player
- rolling checks
- mutating position or party state

## Public API

- `TRAVEL_CONDITION_MULTIPLIERS`
- `TRAVEL_LOAD_MULTIPLIERS`
- `calculateTravelTime`
- `assessRouteAvailability`
- `buildTraversalRequest`
- `validateTraversalResult`

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Выходы, которые предназначены для handoff, замораживаются. Нарушения структуры возвращаются как `{ ok, errors }` либо выбрасываются только для неверно подключённого технического порта.

## Зависимости

Разрешён только `@rus/kernel`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.
