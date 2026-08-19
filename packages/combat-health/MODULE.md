# @rus/combat-health

## Назначение

Combat state, attack/defense requests, harm packages, wounds and combat consequence contracts. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- combat session, intent, technical-step and exchange proposal contracts
- margin-to-quality and damage formulas
- harm and injury packages
- meaningful combat outcome/signal descriptors
- versioned generic combat body-threshold signal mapping
- closed ordinary-armament mechanics capability and reload-safe danger snapshot
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
- `validateCombatSession`
- `validateCombatIntent`
- `buildCombatTechnicalStepProposal`
- `buildCombatExchangeProposal`
- `buildCombatOutcomeEvents`
- `buildCombatDecisionSignalDescriptors`
- `buildCombatStepHarmPackage`
- `combatBodyThresholdSignalProfile`
- `resolveOrdinaryArmamentMechanics`
- `ordinaryArmamentWeaponDanger`

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Выходы, которые предназначены для handoff, замораживаются. Нарушения структуры возвращаются как `{ ok, errors }` либо выбрасываются только для неверно подключённого технического порта.

## Зависимости

Разрешены только `@rus/kernel` и профильные контракты `@rus/contracts`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они
существовали, но не импортирует legacy runtime. Revision 16 /
`spatial-v3-production-v6` активировала эти pure proposals через `@rus/turn`;
current revision 19 / production v9 наследует тот же combat owner. SQL, RNG,
body write и scenario ordering здесь отсутствуют. Unit/contract tests
находятся в `test/domain.test.js` и `test/combat-foundation.test.js`.
