# @rus/visibility-knowledge-memory

## Назначение

Security boundary for visible context, hidden state, character knowledge, memory facts and safe narrator packages. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- visible-context validation
- hidden leak detection and stripping
- knowledge and memory fact contracts
- safe narrator package

## Не делает

- writing prose
- deciding objective truth
- database access or UI rendering

## Public API

- `VISIBLE_PACKAGE_KEYS`
- `detectHiddenLeaks`
- `stripHiddenForNarrator`
- `validateVisibleContext`
- `mergeKnowledgeFacts`
- `validateMemoryFact`
- `buildSafeNarratorPackage`

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Выходы, которые предназначены для handoff, замораживаются. Нарушения структуры возвращаются как `{ ok, errors }` либо выбрасываются только для неверно подключённого технического порта.

## Зависимости

Разрешён только `@rus/kernel`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.
