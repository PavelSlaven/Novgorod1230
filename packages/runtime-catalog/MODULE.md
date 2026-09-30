# @rus/runtime-catalog

## Назначение

Read-only загрузка и exact verification активного или исторически pinned
item/container runtime catalog и exact world-pinned actor component profiles.

## Владеет

- domain catalog pin и typed runtime-catalog errors;
- exact reconstruction по immutable import membership;
- проверкой compatible full-world pin и runtime contract;
- чистой projection по region/effective date после полной проверки.
- единой загрузкой неперсистентных common catalog lookups до projection.
- чистой проверкой кросс-доменного versioned `needs_check` blocker snapshot по кандидату; чтение authoring queues и сборка snapshot остаются у game-base CLI.

## Не делает

- не пишет в `world_base` или party database;
- не читает live authoring rows для historical party;
- не активирует catalog и не выполняет operator workflow;
- не материализует party instances и не обращается к LLM.

## Публичный API

`loadApprovedG4NaturalCatalog({ verifiedCatalog, pin })` projects exact G4
natural profiles from the existing verified compiled-record membership. It
requires matching world/catalog pins, immutable payload digests and one
profile per G4 version. Authoring candidates are not runtime input.

- `createRuntimeCatalogLoader({ worldBaseReader, supportedRuntimeContractDigests })`;
- `loadActivePin({ catalogScope })`;
- `loadApprovedItemCatalog({ pin })`;
- `loadApprovedActorProfileCatalog({ worldPin, regionId, effectiveDate })`;
- `loadScheduleRoutineRules({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin, placeFamilyId, season, month? })` — D-1 routine rules из `world_base.npc_schedule_routine_rules` только после spatial pin и последнего runtime-catalog activation;
- `loadPresenceRulesForPlaceFamilies({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin, placeFamilyIds })` — M2c `world_base.presence_rules` для `place_family` после тех же gate;
- `loadG0RegionIdForSpatialNode({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin, nodeId, nodeVersion })` — G0 `region_id` для spatial node (presence regional merge, R-2a);
- `createRuntimeCatalogWorldBaseReader(query)` — thin `worldBaseReader` adapter для SQL gate readers в тестах и game-server;
- `loadCategoryParentMap({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin, categoryIds })` — `parent_category_id` для `object_type` (LW-071 ancestor skip в consumer);
- `loadPlacePopulationComposition({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin, placeFamilyId, compositionVersion? })` — D-2 состав населения из `world_base.place_population_composition_rules` с тем же gate;
- `loadApprovedProceduralSceneRecordBundle(...)` verifies the exact world pin,
  latest matching activation event and approved regional applicability before
  exporting compiler inputs; candidate/manifests alone are rejected;
- `loadApprovedProceduralActorTemporalBundle(...)` reads only approved enriched
  role/occupation dependencies, legal/social/archetype/skill rows, exact active
  actor components and approved Temporal records for procedural compilation;
  when `world_base` holds them it adds `npc_identity` (approved regional-context name
  bindings, ordinary pool entries of the bound pools, D29 scale entries and goal/fear items
  of the bundle occupations) for the NPC name and character pick;
- `loadApprovedProceduralCompiledCatalog(...)` exposes only the exact activated
  final-candidate compiled profiles/mappings/categories and fails closed for
  another or missing pin;
- `assertCompatibleWorldPin({ domainPin, worldPin })`;
- `verifyCatalogImportLedger(...)` replays shared canonical record projection,
  exact table/record root digests and the immutable import audit root;
- `selectApplicableItemCatalog({ verifiedCatalog, regionId, effectiveDate })`.
- `loadCommonCatalogLookupRecords({ rootDir })` — cached read-only lookup loader.
- `RUNTIME_CATALOG_CONTRACT` и `RUNTIME_CATALOG_CONTRACT_DIGEST` из
  `@rus/runtime-catalog/runtime-contract`.
- `ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT` и exact digest из того же subpath;
  контракт отделён от item/container scope и не включает equipment allocation.
- `NEEDS_CHECK_BLOCKER` — единственный API для сборки/проверки versioned blocker snapshot и сопоставления кандидата; пакет не решает, допускать ли действие.

## Контракты

`loadApprovedG4NaturalPresentationCatalog({ verifiedCatalog, pin })` reads
`rus.g4_natural_presentation_profile.v1` from verified activated compiled
membership. Every descriptor profile pins the exact natural profile payload
digest and G4; modified payloads, missing natural membership and another pin
fail closed. It returns approved immutable descriptors, not visible facts.

`loadApprovedG4NaturalPlacementCatalog({ verifiedCatalog, pin })` loads the
exact compiled placement pack and verifies every natural/presentation profile
reference, world pin and complete layer-channel partition. Its approved rules
place sources and map current conditions; they do not initialize source states.

`loadApprovedCanonicalNaturalInitialRule({ verifiedCatalog, pin, rule_ref })`
loads the exact compiled canonical initial rule and checks its world tuple and
placement candidate digest/reference. It approves no later-state fallback;
the current-state owner must separately prove that the committed initial state
still applies.

`rus.needs_check_blockers.v2` — immutable snapshot cross-domain queues с проверкой digest. Snapshot включает отсортированный список `regions` из approved G0 registry; digest покрывает schema, regions и entries. Каждая name-строка фиксирует `doubt_kind` (`anachronism` или `regional_presence`), `block_by` (`name`, `archive_id` или `none`), `block_region`, `block_period`, исключения и нормализуемые шаблоны. Только `anachronism` блокирует по имени: известный совпадающий регион применяется, другой известный регион пропускается, отсутствующий или неизвестный регион проверяется по всем name-записям. `block_period` хранит границы формата `YYYY-YYYY`; game-base snapshot относится к 1230 г., дата кандидата пока не учитывается. `regional_presence` всегда информационный (`block_by=none`); активная name-строка без `doubt_kind` — ошибка сборки. Archive ID блокирует только включение сущности, не item-bearing references, и не зависит от региона, поскольку ID глобально уникален; archive name blocker также несёт ID-шаблон для entity inclusion. Однословный шаблон до 5 букв совпадает только с точной формой; `|` задаёт альтернативы. Matcher учитывает RU/Latin aliases и fail-closed на неизвестной схеме, битом digest, пустом после нормализации шаблоне или некорректной записи. Чтение очередей и сборка snapshot принадлежат game-base CLI; runtime передаёт кандидата и регион тому же чистому matcher.

`loadActivePin` возвращает immutable `rus.runtime_catalog_pin.v2`.
`loadApprovedItemCatalog` возвращает полный immutable verified bundle только
после record/table/assertion/target/import digest checks. Partial result
запрещён.

`loadApprovedActorProfileCatalog` отдельно проверяет exact approved world pin
и читает только применимые normalized demographic/appearance entries и их
approved category options; item catalog не является источником actor profiles.
Actor base-attribute runtime loader дополнительно принимает owner row только
из exact membership активного `import_id`; поздняя строка под тем же revision,
tuple drift или изменение import ledger завершаются typed failure.

Materialization trace хранит `catalog_digest` exact domain pin. Digest
применимой immutable projection хранится отдельно как `catalog_bundle_digest`;
эти идентичности не подменяют друг друга.

## Допустимые зависимости

`@rus/world-base`, `@rus/materialization`, `@rus/items-property` и стандартная библиотека Node.js.

## Запрещённые зависимости

Apps, tools, party store, PostgreSQL driver, provider SDK, UI, legacy и
generated artifacts.

## Инварианты

Active event читается только для новой партии. Historical party загружается по
persisted `import_id`. Фильтрация выполняется только после полной проверки.
SQL identifiers статичны.

## Ошибки

`RuntimeCatalogError` с versioned machine-readable code и immutable details.

## Тесты

Parameterized unit/contract suite для pin, exact membership, digests,
compatibility, immutability и pure projection; PostgreSQL integration suite
проверяет только физические readback/privilege boundaries.

## Совместимость

Runtime принимает catalog только если его `runtime_contract_digest` входит в
явный supported set текущего release.
