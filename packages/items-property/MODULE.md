# @rus/items-property

## Назначение

Item identity, containers, ownership, access, inventory load, recognition and property relations. Код модуля работает только с переданными данными и не создаёт смысловые сущности мира.

## Владеет

- item and container contracts
- ownership and holder relations
- physical access
- normalized inventory topology, mass/load, hands, access, packing usage, stack signatures and pure transfer plans
- immutable mechanics snapshots for template-less ordinary direct-action and
  admitted O1/O2a instances
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
- `admitOrdinaryWorldMaterialization` — общий items-property owner для O1/O2a:
  принимает Phase 3 handoff и server-owned evidence; authority-sensitive O2a
  descriptor выводит только из exact safe identity profile
- `resolveOrdinaryWorldPropertyPlacement` — pure O1/O2a resolver для
  version-pinned committed property/scene-position catalogs. V2 precedence:
  `explicit_source_item` → `personal_possession` →
  `communal_public_service` → `container_property` →
  `occupied_site_default` → `genuinely_unowned` (только с explicit closed cause).
  Legacy v1 precedence сохраняется только для O1; ambiguity является data gap
- `resolveInventoryMechanicsProfile` — выбирает ровно один источник механики: authored template profile, template-less direct-action v1 snapshot либо disjoint committed O1 v2 snapshot

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Approved actor transition сохраняет item/container ID и owner, меняет только holder/controller/placement и валидирует equipment slot для `equipped`. Тип предмета и согласие holder не являются специальным transition gate; реакция NPC относится к NPC runtime, а legal owner не меняется от физического изъятия. Load admission использует только силу действующего actor: при actor-keyed input отсутствие его значения является gap и никогда не компенсируется силой player/другого holder. O1 использует legacy property context v1; O2a требует v2 с precedence `explicit_source_item → personal_possession → communal_public_service → container_property → occupied_site_default → genuinely_unowned`. Source applicability проверяется against independently committed/prepared supporting/causal refs и explicit closed unowned cause. Active O2a включает authored abundant ambient capability и provisioned first-entry context-bound finite stock: code-owned profile ref выбирает source, model wording не является admission password, persisted public identity для `currency_or_precious`, `document_like` и `other_restricted` берётся только из server-owned safe identity profile, а любой admitted `finite_source` обязан иметь initialization/decrement независимо от admission class. Constrained policy добавляет resource permissions, но не владеет conservation. Не provisioned precious/remnant profiles остаются dormant. Resolver не считает ordinary unowned по умолчанию, не добавляет position/edge, не меняет `party_scene_baseline` и не размещает предмет на G4/G5. O1/O2a admission принимает raw pinned catalog/context, сам вызывает resolver и только затем сопоставляет Stage B handoff (`evidence_weight = 0`, code-owned identity/classification/policy fields) с его результатом; normalized discovery query вместе с exact target выводит candidate identity, но остаётся лишь `candidate_hint`, а не noun/recipe gate или authority. Exact normalized retry использует persisted resolution, другой normalized query получает другую identity. Готовое evidence не является входным контрактом. Direct-action public constructor остаётся только v1; отдельный O1 reader допускает лишь committed v2 с provenance `ordinary_world_materialization`. O1/O2a admission выдаёт immutable future-commit v2 snapshot с causal ref; persisted P16 интеграция фиксирует её вместе с positive/negative exact resolution и нормализованным runtime item. Authored instance всегда использует template/profile path. Active A1 принимает committed либо sealed same-root revealed authored/template-less non-container mechanics через этот же owner, не доверяет числовой mechanics модели и при preserve переводит изменённый authored item в exact runtime snapshot. Independent output требует material allocation: finite source уменьшается owner-native, а полностью разделённый единичный source без resource row retire-ится; известная масса сохраняется, hand/packing выводятся code-owned. Safe ordinary descriptor результата сохраняется рядом с mechanics и переживает reload. Token-like output сохраняется non-currency, inscription остаётся физической надписью, а weapon-capable state содержит только закрытую qualitative class для последующего `@rus/combat-health`. Template-less containers, authentic currency identity, significant/hidden content и O2b/F1/S1/N1 запрещены. Одновременное наличие authored и runtime mechanics sources запрещено. Выходы, которые предназначены для handoff, замораживаются.

## Зависимости

Разрешены `@rus/kernel` и узкий contract digest из `@rus/contracts/ordinary-materialization-v1`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.
