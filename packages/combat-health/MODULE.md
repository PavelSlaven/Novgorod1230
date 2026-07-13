# @rus/combat-health

## Назначение

Combat state, attack/defense requests, harm packages, wounds and combat consequence contracts. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- combat request/result contracts
- margin-to-quality and damage formulas
- harm and injury packages
- combat-state validation

## Не делает

- choosing combat intent
- rolling dice
- legal or narrative consequences

## Public API

- `combatQualityFromMargin`
- `combatHealthLossFromDamageScore`
- `combatInjuryProfileFromDamageScore`
- `buildAttackRequest`
- `buildHarmPackage`
- `applyHarmPackage`
- `validateCombatState`

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Выходы, которые предназначены для handoff, замораживаются. Нарушения структуры возвращаются как `{ ok, errors }` либо выбрасываются только для неверно подключённого технического порта.

## Зависимости

Разрешён только `@rus/kernel`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.
