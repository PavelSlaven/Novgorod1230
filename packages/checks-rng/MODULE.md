# @rus/checks-rng

## Назначение

RandomSource port, dice requests, check formula, modifiers and check result. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- difficulty bounds
- attribute bonus formula
- dice execution through injected RandomSource
- check result bands and audit records

## Не делает

- deciding when a check is needed
- semantic difficulty selection
- direct global randomness

## Public API

- `DC`
- `clampDifficulty`
- `attributeBonus`
- `createSeededRandomSource`
- `rollDie`
- `executeCheck`
- `evaluateCheckOutcome`
- `buildRollAuditRecord`

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Выходы, которые предназначены для handoff, замораживаются. Нарушения структуры возвращаются как `{ ok, errors }` либо выбрасываются только для неверно подключённого технического порта.

## Зависимости

Разрешён только `@rus/kernel`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.

Lower Dvina revision 21 A1 не вводит отдельный check owner: он принимает только
уже рассчитанный actor-step `generic_check` result с выбранными общим turn plan
attribute/skill/difficulty pins. Qualitative action-production output не задаёт roll, DC или
числовой outcome и не вызывает RNG повторно.
