# @rus/space-map

## Назначение

G0-G5 graph contracts, position chains, scene anchors, layout metadata and structural validation. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- graph scale and node/edge contracts
- position chain
- current position and scene anchors
- graph structural validation

## Не делает

- route traversal decisions
- map knowledge visibility
- database queries or layout rendering

## Public API

- `GRAPH_LEVELS`
- `normalizePosition`
- `validatePositionChain`
- `validateGraphNode`
- `validateGraphEdge`
- `buildGraphIndex`
- `resolveAdjacentEdges`

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Выходы, которые предназначены для handoff, замораживаются. Нарушения структуры возвращаются как `{ ok, errors }` либо выбрасываются только для неверно подключённого технического порта.

## Зависимости

Разрешён только `@rus/kernel`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.
