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
- чистой проверкой кросс-доменного versioned `needs_check` snapshot для новых фактов бытности мира и NPC-кандидатов; чтение authoring queues и сборка snapshot остаются у game-base CLI, решение о фильтрации результата или отклонении NPC-операции принадлежит consumer owner.
- чистой идентичностью PostgreSQL-схемы, общей для activation и runtime ledger: `readPostgresSchemaFingerprint(client, schemaName)` публичного subpath `@rus/runtime-catalog/schema-fingerprint` вычисляет fingerprint по переданному query-клиенту; пакет не создаёт соединение и не владеет пулом.
- чтением и exact validation последнего approved runtime-catalog activation pin: `loadActiveRuntimeCatalogPin(queryClient, catalogScope)` публичного subpath `@rus/runtime-catalog/active-pin` использует переданный query-клиент; пакет не создаёт соединение и не владеет пулом.

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

The natural, presentation and placement G4 projections cache successful
validation per verified catalog object and canonical pin. Only deeply frozen
verified inputs use the cache; mutable inputs keep the uncached validation
path. Failed stages are retried, while completed successful stages can be
reused by later projections.

- `createRuntimeCatalogLoader({ worldBaseReader, supportedRuntimeContractDigests })`;
- `loadActivePin({ catalogScope })`;
- `loadActiveRuntimeCatalogPin(queryClient, catalogScope)` из
  `@rus/runtime-catalog/active-pin` — читает и проверяет последний activation;
- `loadApprovedItemCatalog({ pin })`;
- `loadApprovedNeedsCheckBlockerSnapshot({ verifiedCatalog, pin })` — exact
  immutable `profile:needs_check_blockers` member, без latest fallback;
- `needsCheckBlockerSnapshotRequired({ verifiedCatalog, pin })` — exact import
  binding, требующий blocker snapshot;
- `loadApprovedActorProfileCatalog({ worldPin, regionId, effectiveDate })`;
- `loadScheduleRoutineRules({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin, placeFamilyId, season, month? })` — D-1 routine rules из `world_base.npc_schedule_routine_rules` только после spatial pin и последнего runtime-catalog activation;
- `loadPresenceRulesForPlaceFamilies({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin, placeFamilyIds })` — M2c `world_base.presence_rules` для `place_family` после тех же gate;
- `loadG0RegionIdForSpatialNode({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin, nodeId, nodeVersion })` — G0 `region_id` для spatial node (presence regional merge, R-2a);
- `loadG1NodeIdForSpatialNode({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin, nodeId, nodeVersion })` — единственный ancestor с `spatial_level = 'G1'` по exact pinned ancestry; отсутствие или неоднозначность даёт `PRESENCE_G1_REGION_AMBIGUOUS`;
- `createRuntimeCatalogWorldBaseReader(query)` — thin `worldBaseReader` adapter для SQL gate readers в тестах и game-server;
- `loadCategoryParentMap({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin, categoryIds })` — `parent_category_id` для `object_type` (LW-071 ancestor skip в consumer);
- `loadPlacePopulationComposition({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin, placeFamilyId, compositionVersion? })` — D-2 состав населения из `world_base.place_population_composition_rules` с тем же gate;
- `loadNpcRelationshipMaterializationRules({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin })` — approved NPC relationship rules from the exact world revision, after spatial and latest runtime-catalog activation gates; rejects multiple approved versions of one rule id.
- `loadNpcSpeechAddressForms({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin })` — approved speech-address forms from the exact world revision after the same spatial and runtime-catalog gates.
- `NPC_SPEECH_REGISTERS_PIN` and `loadNpcSpeechRegisters({ rootDir?, readFile?, onDiagnostic? })` — read-only process-cached CSV projection, available only when the `C007c2` source matches its pinned SHA-256 (`8f0c1d91` approval snapshot); the default root is derived from the module location, `rootDir` overrides it, and cache entries are keyed by absolute source path. Pin/read/parse failure returns no rows and emits one sanitized diagnostic per source path.
  The game-server v17 target startup requires a nonempty result from this reader and rejects an unavailable pinned source with `SPATIAL_V3_TARGET_NPC_SPEECH_REGISTERS_REQUIRED` (503), including cached failures. Direct callers retain the fail-soft contract.
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
- `selectApprovedItemMaterial({ item_template_id, bindings })` — общий чистый
  выбор категории материала из утверждённых `item_template_category_bindings`.
  При отсутствии явного утверждённого выбора берётся первый `category_id` после
  сортировки; `mode` равен `deterministic_from_approved_bindings`. Это выбор по
  порядку, не по сезону, занятию или иной причине. Stage 8 и Stage 16 используют
  одну функцию. Отсутствующая привязка даёт `unknown` и типизированный пробел.
- `loadCommonCatalogLookupRecords({ rootDir? })` — cached read-only lookup loader for common catalog records; by default it derives the project root from the module location, with an explicit `rootDir` override and cache keyed by absolute path.
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

`rus.runtime_catalog_context.v2.needs_check_blocker_snapshot` — snapshot,
загруженный из verified catalog context того же immutable pin. Обязательность
определяет `needs_check_blocker_snapshot_required` по binding этого import.
`rus.needs_check_blockers.v2` — immutable snapshot cross-domain queues с проверкой digest. Snapshot включает отсортированный список `regions` из approved G0 registry; digest покрывает schema, regions и entries. Каждая name-строка фиксирует `doubt_kind` (`anachronism` или `regional_presence`), `block_by` (`name`, `archive_id` или `none`), `block_region`, включительный `block_period` (`YYYY-YYYY`), исключения и нормализуемые шаблоны. Только `anachronism` даёт совпадение по имени в том же регионе и внутри периода; другой известный регион или год вне периода пропускается. Отсутствующий или неизвестный регион проверяется по всем name-записям. `regional_presence` всегда информационный (`block_by=none`). Runtime получает year из committed clock и регион из committed G0 места. Matcher сообщает совпадение, но не задаёт admission policy: world-presence consumers фильтруют совпавшие новые факты, NPC owner отклоняет только совпавшую операцию, а действия игрока список не блокирует. Изменение активного указателя не меняет snapshot исторического party pin.

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
