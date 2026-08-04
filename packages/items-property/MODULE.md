# @rus/items-property

## Назначение

Item identity, containers, ownership, access, inventory load, recognition and property relations. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- item and container contracts
- ownership and holder relations
- physical access
- normalized inventory topology, mass/load, hands, access, packing usage, stack signatures and pure transfer plans
- immutable mechanics snapshots for template-less ordinary direct-action instances

## Не делает

- creating items from player requests
- route or combat decisions
- persistence or legal adjudication

## Public API

- `normalizeItem`
- `validateItem`
- `physicalAccessTier`
- `calculateCarriedWeight`
- `resolveLoadCategory`
- `buildRecognitionRequest`
- `validatePropertyRelation`
- `planApprovedActorItemTransition` — pure proposal for an already approved actor-to-actor item transition
- `validateInventoryArchetypes` / `resolveInventoryProfile` — разворачивают переданный authoring archetype в точный immutable inventory-профиль до runtime
- `createRuntimeInstanceMechanicsSnapshot` — строго валидирует и отделённо замораживает exact mechanics/provenance обычного direct-action экземпляра
- `resolveInventoryMechanicsProfile` — выбирает ровно один источник механики: authored template profile либо template-less runtime snapshot

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Runtime snapshot допустим только без `template_id`, с полным exact profile и provenance `ordinary_direct_action_result`; authored instance всегда использует template/profile path. Одновременное наличие обоих источников запрещено. Выходы, которые предназначены для handoff, замораживаются. Нарушения структуры возвращаются как `{ ok, errors }` или `{ pass, errors }` либо выбрасываются фабрикой строгого snapshot до его передачи runtime-владельцу.

## Зависимости

Разрешён только `@rus/kernel`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.
