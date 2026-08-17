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
- `admitOrdinaryWorldMaterialization` — изолированный O1 owner path: принимает Phase 3 handoff и server-owned evidence, возвращая immutable future-commit proposal и v2 snapshot
- `resolveOrdinaryWorldPropertyPlacement` — pure O1 resolver для version-pinned
  committed property/scene-position catalogs и bound candidate applicability:
  выбирает один basis по precedence
  `explicit_source_item` → `personal_or_communal` →
  `occupied_site_default` → `genuinely_unowned` (только с explicit cause) и
  один наиболее узкий существующий `scene_position`; ambiguity является data gap
- `resolveInventoryMechanicsProfile` — выбирает ровно один источник механики: authored template profile либо template-less runtime snapshot
- `createAmbientOrdinaryPortionAdmission` — O2a-only admission finite ordinary
  portion из SHA-pinned committed ambient context; выбирает только authored
  source/profile/destination и создаёт v1 mechanics snapshot; abundant ambient
  source не уменьшается (decrement принадлежит отдельному finite resource owner)
- `classifyExistingContainerContents` — descriptor-safe authoritative-first
  O2b eligibility: принимает только committed supported container/access;
  authoritative path не требует ordinary policy, а `ordinary_unresolved`
  требует exact explicit versioned policy и nonempty canonical container ref
- `buildExistingContainerOrdinarySeedRequest` — immutable candidate-free O2b
  request только из committed container/template/mechanics, owner-controller,
  property/site/economic/permissions и prior resolutions; player/root/desired
  text, query, use и narration не входят в контракт
- `validateOrdinaryContainerContentsMechanics` — pure all-or-nothing admission
  ordinary children: exact parent placement, closed authority/admission/
  availability/disclosure classes, individual mechanics/mass, packing/capacity
  и approved `max_new_entities` в диапазоне `1..8`
- `admitActionProducedResult` — descriptor-safe A1 admission, который связывает
  qualitative result с committed source/tool/context/profile pins и возвращает
  только frozen pending owner handoff
- `createActionProducedTransitionPlanner` — pure owner-native A1 identity,
  mechanics и conservation proposal: preserve-source сохраняет entity ID,
  independent outputs получают deterministic causal IDs, а no-result не
  создаёт entity; raw semantic caller не задаёт mechanics или SQL

## Контракты и инварианты

Входы являются plain-object/array значениями. Функции нормализации не придумывают отсутствующие ID, имена, предметы, причины или последствия. Approved actor transition сохраняет item/container ID и owner, меняет только holder/controller/placement и валидирует equipment slot для `equipped`. Тип предмета и согласие holder не являются специальным transition gate; реакция NPC относится к NPC runtime, а legal owner не меняется от физического изъятия. Load admission использует только силу действующего actor: при actor-keyed input отсутствие его значения является gap и никогда не компенсируется силой player/другого holder. O1 property/placement resolver работает только для exact `man_made` common mundane non-container item в committed version-pinned G6 catalogs; source applicability проверяется against independently committed/prepared supporting/causal, personal/communal, occupied и explicit-unowned-cause refs. Он не считает ordinary unowned по умолчанию, не добавляет position/edge, не меняет `party_scene_baseline` и не размещает предмет на G4/G5. O1 admission принимает raw pinned catalog/context, сам вызывает resolver и только затем сопоставляет Stage B handoff (`evidence_weight = 0`, code-owned identity/classification/policy fields) с его результатом; normalized discovery query может поставлять только `candidate_hint` и уточнённый `coverage_ref`. Готовое evidence не является входным контрактом; unknown paraphrase не получает magical equivalence, а no-reroll ограничен exact deterministic normalization. Public runtime snapshot остаётся только direct-action v1. O1 admission выдаёт immutable future-commit v2 snapshot с causal ref; persisted P16 интеграция фиксирует её вместе с positive/negative exact resolution. Authored instance всегда использует template/profile path. O1 admission запрещает template-less containers, context-bound weapons/value/currency и natural finite sources, не создаёт topology, persistence, runtime activation или budget delta сам по себе; A1/F1/S1/N1 остаются вне его contract.

O2b pure boundary никогда не читает player wording и не делает model/DB call. Authoritative contents возвращаются до parse/require ordinary policy. Ordinary admission требует existing committed container, exact canonical ref/template/mechanics/context, explicit versioned policy, plain descriptor-safe data и approved limits. Все children валидируются в temporary array до mutation: accessor/symbol/custom prototype/cycle/alias/extra field, duplicate/collision, foreign parent, nonfinite mechanics, capacity overflow и authority выше ordinary отклоняют весь batch. `concealed` — disclosure state, не hidden authority; human label не является классификацией. Module не владеет ledger, model, commit или reveal. Одновременное наличие authored and ordinary source не создаёт fallback: authoritative route всегда выигрывает. Выходы, предназначенные для handoff, замораживаются.

A1 owner boundary принимает только exact committed source/tool snapshots и
server-owned profile/policy pins. Same-identity transform сохраняет holder,
property и placement; independent output требует finite allocation/decrement и
exact destination; known output+waste не превышает exact decrement и не
смешивает units. Physical inscription остаётся qualitative fact, token-like
output не становится currency, weapon-capable output остаётся pending concrete
combat boundary. Active Lower Dvina revision 21 использует лишь узкий
preserve/no-result ordinary-mundane subset; это не расширяет O1/O2 и не делает
module владельцем model, RNG, time или persistence.

## Зависимости

Разрешён только `@rus/kernel`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Модуль сохраняет подтверждённые чистые формулы legacy там, где они существовали, но не импортирует legacy runtime. Unit/contract tests находятся в `test/domain.test.js`. Cutover выполняется отдельно после shadow run.
