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
- `loadApprovedProceduralSceneRecordBundle(...)` verifies the exact world pin,
  latest matching activation event and approved regional applicability before
  exporting compiler inputs; candidate/manifests alone are rejected;
- `loadApprovedProceduralActorTemporalBundle(...)` reads only approved enriched
  role/occupation dependencies, legal/social/archetype/skill rows, exact active
  actor components and approved Temporal records for procedural compilation;
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
