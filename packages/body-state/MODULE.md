# @rus/body-state

## Назначение

Body metrics, active conditions, body-part state and approved state-change formulas. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- health, satiety and energy
- active conditions
- body-part state
- state modifiers and bounded changes

## Не делает

- actor biography
- combat intent selection
- medical narration or persistence

## Public API

- `BODY_METRICS`
- `clampBodyMetric`
- `normalizeBodyState`
- `applyBodyStateChange`
- `stateModifier`
- `validateBodyState`

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Выходы, которые предназначены для handoff, замораживаются. Нарушения структуры возвращаются как `{ ok, errors }` либо выбрасываются только для неверно подключённого технического порта.

## Зависимости

Разрешён только `@rus/kernel`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.
