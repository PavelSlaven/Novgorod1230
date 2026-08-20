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
- `ACTION_PRODUCED_WEAPON_CLASSES`
- `resolveActionProducedCombatWeaponClass`

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
active revision 20 / M8 наследует тот же combat owner, а revision 19 /
production v9 сохраняется как historical recovery path. SQL, RNG,
body write и scenario ordering здесь отсутствуют. Unit/contract tests
находятся в `test/domain.test.js` и `test/combat-foundation.test.js`.

Revision 21 A1 не пишет damage, combat class либо canonical weapon identity.
При конкретном combat use существующая exact weapon mechanics имеет приоритет
и не вызывает модель. Для одного held action-produced item без exact weapon
mechanics combat owner получает current player-safe physical facts/form,
bounded-классифицирует их в один из `ACTION_PRODUCED_WEAPON_CLASSES`, включая
`not_weapon_capable`, и code-owned mapping переводит класс в `weapon_danger`
только для этого resolution. Последний A1 `output_class` не является combat
gate. Класс не сохраняется и после физического изменения определяется заново.
Digest/profile-pin слоя нет; strict validation достаточна.
Damaged/unknown/ambiguous items fail-closed.
