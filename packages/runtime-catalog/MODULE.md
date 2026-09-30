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

- `createRuntimeCatalogLoader({ worldBaseReader, supportedRuntimeContractDigests })`;
- `loadActivePin({ catalogScope })`;
- `loadApprovedItemCatalog({ pin })`;
- `loadApprovedActorProfileCatalog({ worldPin, regionId, effectiveDate })`;
- `assertCompatibleWorldPin({ domainPin, worldPin })`;
- `selectApplicableItemCatalog({ verifiedCatalog, regionId, effectiveDate })`.
- `loadCommonCatalogLookupRecords({ rootDir })` — cached read-only lookup loader.
- `RUNTIME_CATALOG_CONTRACT` и `RUNTIME_CATALOG_CONTRACT_DIGEST` из
  `@rus/runtime-catalog/runtime-contract`.
- `NEEDS_CHECK_BLOCKER` — единственный API для сборки/проверки versioned blocker snapshot и сопоставления кандидата; пакет не решает, допускать ли действие.

## Контракты

`rus.needs_check_blockers.v2` — immutable snapshot cross-domain queues с проверкой digest. Snapshot включает отсортированный список `regions` из approved G0 registry; digest покрывает schema, regions и entries. Каждая name-строка фиксирует `doubt_kind` (`anachronism` или `regional_presence`), `block_by` (`name`, `archive_id` или `none`), `block_region`, `block_period`, исключения и нормализуемые шаблоны. Только `anachronism` блокирует по имени: известный совпадающий регион применяется, другой известный регион пропускается, отсутствующий или неизвестный регион проверяется по всем name-записям. `block_period` хранит границы формата `YYYY-YYYY`; game-base snapshot относится к 1230 г., дата кандидата пока не учитывается. `regional_presence` всегда информационный (`block_by=none`); активная name-строка без `doubt_kind` — ошибка сборки. Archive ID блокирует только включение сущности, не item-bearing references, и не зависит от региона, поскольку ID глобально уникален; archive name blocker также несёт ID-шаблон для entity inclusion. Однословный шаблон до 5 букв совпадает только с точной формой; `|` задаёт альтернативы. Matcher учитывает RU/Latin aliases и fail-closed на неизвестной схеме, битом digest, пустом после нормализации шаблоне или некорректной записи. Чтение очередей и сборка snapshot принадлежат game-base CLI; runtime передаёт кандидата и регион тому же чистому matcher.

`loadActivePin` возвращает immutable `rus.runtime_catalog_pin.v2`.
`loadApprovedItemCatalog` возвращает полный immutable verified bundle только
после record/table/assertion/target/import digest checks. Partial result
запрещён.

`loadApprovedActorProfileCatalog` отдельно проверяет exact approved world pin
и читает только применимые normalized demographic/appearance entries и их
approved category options; item catalog не является источником actor profiles.

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
