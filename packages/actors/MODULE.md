# @rus/actors

## Назначение

Player and NPC entity contracts, identity, biography, social and skill bindings. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- actor identity and kind
- biography fields
- social and skill references
- actor state shape and invariants

## Не делает

- items or property
- body-state calculations
- routes, time, persistence or LLM generation

## Public API

- `ACTOR_KINDS`
- `validateActor`
- `normalizeActor`
- `projectActorIdentity`
- `projectActorState`

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Выходы, которые предназначены для handoff, замораживаются. Нарушения структуры возвращаются как `{ ok, errors }` либо выбрасываются только для неверно подключённого технического порта.

## Зависимости

Разрешён только `@rus/kernel`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.
