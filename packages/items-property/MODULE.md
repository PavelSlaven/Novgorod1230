# @rus/items-property

## Назначение

Item identity, containers, ownership, access, inventory load, recognition and property relations. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- item and container contracts
- ownership and holder relations
- physical access
- normalized inventory topology, mass/load, hands, access, packing usage, stack signatures and pure transfer plans
- immutable mechanics snapshots for template-less ordinary direct-action instances
- approved property/container transitions that independently preserve owner,
  holder/controller, access, seal and document-content boundaries

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
- `ACTOR_ITEM_PHYSICAL_POSITIONS` — единый closed set placement для общего
  actor-item/container planner и party placement constraints
- `planApprovedActorItemTransition` — pure proposal for an already approved
  actor-to-actor item or container transition
- `planApprovedPropertyTransition` — strict revision-pinned proposal for
  recovery, controlled container opening and sealed child extraction; ownership
  and seal/document access change only when the approved transition says so
- `planApprovedItemZoneTransition` и
  `planApprovedItemVisibilityTransition` — pure proposals для утверждённых
  перемещения предмета между зонами и изменения его видимости без смены
  владельца, держателя или контролёра
- `planApplicableApprovedItemTransition` — выбирает ровно один применимый
  approved transition по реальному target item/location ref; итоговое состояние
  видимости остаётся результатом item owner, а не входным semantic write-state
- `validateInventoryArchetypes` / `resolveInventoryProfile` — разворачивают переданный authoring archetype в точный immutable inventory-профиль до runtime
- `createRuntimeInstanceMechanicsSnapshot` — строго валидирует и отделённо замораживает exact mechanics/provenance обычного direct-action экземпляра
- `createOrdinaryWorldRuntimeInstanceMechanicsSnapshot` — отдельный строгий reader committed O1 v2 snapshot с provenance `ordinary_world_materialization`; direct-action v1 contract не расширяет
- `admitOrdinaryWorldMaterialization` — изолированный O1 owner path: принимает Phase 3 handoff и server-owned evidence, возвращая immutable future-commit proposal и v2 snapshot
- `resolveOrdinaryWorldPropertyPlacement` — pure O1 resolver для version-pinned
  committed property/scene-position catalogs и bound candidate applicability:
  выбирает один basis по precedence
  `explicit_source_item` → `personal_or_communal` →
  `occupied_site_default` → `genuinely_unowned` (только с explicit cause) и
  один наиболее узкий существующий `scene_position`; ambiguity является data gap
- `resolveInventoryMechanicsProfile` — выбирает ровно один источник механики: authored template profile, template-less direct-action v1 snapshot либо disjoint committed O1 v2 snapshot

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Approved actor transition сохраняет item/container ID и owner, меняет только holder/controller/placement и валидирует equipment slot для `equipped`. Тип предмета и согласие holder не являются специальным transition gate; реакция NPC относится к NPC runtime, а legal owner не меняется от физического изъятия. Load admission использует только силу действующего actor: при actor-keyed input отсутствие его значения является gap и никогда не компенсируется силой player/другого holder. O1 property/placement resolver работает только для exact `man_made` common mundane non-container item в committed version-pinned G6 catalogs; source applicability проверяется against independently committed/prepared supporting/causal, personal/communal, occupied и explicit-unowned-cause refs. Active O2a ограничен authored abundant ambient capability: code-owned profile ref выбирает committed source, model wording не является admission password, а persisted public name всегда берётся из safe profile. Общие context-bound/property и finite initialization/decrement owners поддерживают approved precious/remnant/natural cases, но остаются dormant до отдельного authored production provisioning и не объявляют такие instances активными в этой revision. Resolver не считает ordinary unowned по умолчанию, не добавляет position/edge, не меняет `party_scene_baseline` и не размещает предмет на G4/G5. O1 admission принимает raw pinned catalog/context, сам вызывает resolver и только затем сопоставляет Stage B handoff (`evidence_weight = 0`, code-owned identity/classification/policy fields) с его результатом; normalized discovery query вместе с exact target выводит candidate identity, но остаётся лишь `candidate_hint`, а не noun/recipe gate или authority. Exact normalized retry использует persisted resolution, другой normalized query получает другую identity. Готовое evidence не является входным контрактом. Direct-action public constructor остаётся только v1; отдельный O1 reader допускает лишь committed v2 с provenance `ordinary_world_materialization`. O1/O2a admission выдаёт immutable future-commit v2 snapshot с causal ref; persisted P16 интеграция фиксирует её вместе с positive/negative exact resolution и нормализованным runtime item. Authored instance всегда использует template/profile path. Template-less containers, authentic currency identity, significant/hidden content и O2b/A1/F1/S1/N1 запрещены. Одновременное наличие authored и runtime mechanics sources запрещено. Выходы, которые предназначены для handoff, замораживаются.

## Зависимости

Разрешены `@rus/kernel` и узкий contract digest из `@rus/contracts/ordinary-materialization-v1`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.
