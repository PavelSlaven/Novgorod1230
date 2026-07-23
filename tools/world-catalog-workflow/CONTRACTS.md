# @rus/world-catalog-workflow — реестр публичных контрактов

## Статус и владелец

**Владелец:** `@rus/world-catalog-workflow`.
**Публичный entrypoint:** [`src/index.js`](src/index.js).
**Статус:** editor/import tool; не является runtime и не владеет party state.

Этот документ — реестр контрактов и публичных интерфейсов модуля. Он дополняет [MODULE.md](MODULE.md); физические поля authoring-данных определяют DDL, `SCHEMA_REFERENCE.md` и versioned JSON Schema.

## Контрактные группы

| API | Обязательный вход | Результат | Типичные hard errors | Потребители |
|---|---|---|---|---|
| `validateMapRevision`, `validateG1Mask`, `validateG1CellPackage`, `validateBoundaryContract` | versioned revision/mask/cell/boundary data | immutable `{ errors }` | missing fields, invalid scale/coordinates, orphan/cross-scale references | regional-map CLI, editor checks |
| `projectLegacyG1Rows`, `buildG1WorkQueue`, `buildImportDryRun` | declared legacy/map records | deterministic projection, queue или dry-run report | unresolved semantic fields, duplicate coordinates, invalid input | regional-map staging |
| `validateCatalogImportManifest`, `validateClassificationCatalog` | manifest, datasets, declared external IDs | immutable `{ errors }` | unknown scheme/type/table, dangling reference, cycle, digest/order violation | classification importer/readiness |
| `importClassificationCatalog` | validated classification plan and injected transaction adapter | dry-run/apply result with readback counts/digests | adapter/readback failure, invalid manifest/datasets | classification importer only |
| `validateItemContainerClassificationCatalog` | normalised item/container datasets and external IDs | immutable `{ errors }` | wrong facet/domain, duplicate active binding, invalid XOR, incompatible content | item/container authoring importer |
| `assessItemContainerClassificationMigration` | exported legacy rows and explicit bindings | typed `data_gap` / `migration_conflict` report | unknown/ambiguous legacy mapping | migration review, never runtime |
| `assessItemContainerClassificationReadiness` | approved candidate closure | concerns/hard blocks | missing category/template/permission/profile/G4 rule, deprecated candidate | Stage 8/16 readiness gate |
| `calculatePackingSlots` | positive integer `quantity`, `packing_slot_cost`, `packing_bundle_size` | exact `ceil(quantity / packing_bundle_size) × packing_slot_cost` | non-positive/fractional/missing input | `@rus/new-game`, `@rus/items-property` |
| `supplementalDigest` | JSON-compatible records | SHA-256 canonical JSON digest | — | Stage 3B-1 generator and tests |
| `validateSupplementalCatalogBundle` | `draft` manifest, datasets, declared external IDs | immutable `{ errors }` | unknown/party table, schema/digest/FK/order/XOR/status violation | Stage 3B-1 dry-run/readiness |
| `applySupplementalCatalogBundle` | validated supplemental input and adapter `{ begin, insert, readback, commit, rollback }` | `{ applied, errors, tables }` or rejected promise after rollback | invalid adapter, validation failure, readback mismatch | disposable PostgreSQL integration only |
| `LEGACY_CLASSIFICATION_FIELD_REGISTRY`, `flattenLegacyRows`, `buildLegacyClassificationInventory` | verified operator source, existing resolutions, approved categories | versioned legacy snapshot with one status per non-empty field | `LEGACY_SOURCE_NOT_VERIFIED`, missing/non-approved mapping, duplicate/stale decision | Stage 3C operator migration review |
| `buildCatalogEditorialReadinessReport` | exact 120-template cohort, records and verified legacy snapshot | digest-bound readiness report with per-template blockers | cohort size/kind, source/parameter/profile/rule/legacy blockers | Stage 3C editorial gate |
| `buildEditorialEvidenceReviewPlan`, `buildCoherentEditorialApprovalPlan` | valid readiness digest and human attestation | atomic status-transition proposal or blocked plan | missing attestation, incomplete all-120 cohort | editorial workflow; no direct write |
| `buildRevisionPromotionPlan`, `validateApprovedDependencyClosure`, `buildRevisionRollbackPlan` | approved parent, new target revision, explicit subset/attestation | revision-pinned manifest, dependency closure and rollback plan | missing approved dependency, wrong revision pin, empty subset | promotion dry-run |
| `buildAllTemplateRevisionPromotionPlan` | exact 120 IDs, complete readiness report, verified legacy snapshot, `approve_all_120` attestation | blocked or ready promotion plan | partial cohort, digest/attestation mismatch, unresolved legacy inventory | mandatory Stage 3C promotion gate |
| `applyRevisionPromotionPlan` | ready promotion plan and adapter `{ begin, transition, readTransition, insert, readback, readRevision, commit, rollback }` (`transition` methods required only when declared) | transaction audit or rejected promise after rollback | transition precondition/readback, parent changed, target exists, dataset readback mismatch | explicitly approved database apply only |

## Общие гарантии

1. Validators не изменяют входные objects и не выполняют I/O.
2. Результат не создаёт category/template/profile/rule IDs и не дополняет candidate set.
3. Unknown, dangling, ambiguous, invalid or empty-required input возвращает typed error/concern и блокирует дальнейший шаг.
4. Supplemental path принимает только registered authoring tables, `approval = draft` и `deletion_policy = none`; party tables запрещены.
5. Transactional apply читает count/digest после каждой таблицы, а при исключении вызывает rollback.
6. Любая SQL-запись принадлежит injected adapter; module не владеет database connection и не выполняет live external query.
7. Stage 3C promotion не делает activation, не меняет runtime loader и не rematerialize existing parties; partial promotion из 120 templates запрещён. Объявленные G4 status transitions входят в тот же manifest и transaction, проверяются readback и откатываются вместе с datasets.

## Внешние и внутренние зависимости

| Зависимость | Назначение | Граница |
|---|---|---|
| `schemas/materialization/*.schema.json` | closed structural validation datasets | read-only versioned schema |
| `infra/world-base/schema*.sql` / `SCHEMA_REFERENCE.md` | FK/table semantics | authoritative physical contract, не читается runtime через этот module |
| transaction adapter | explicit apply/readback/rollback | caller owns connection and approval |
| `scripts/stage3b1-parent-source-bundle.mjs` | verified parent source IDs for Stage 3B-1 callers | caller-side utility; module receives its result only through declared `externalIds` |

## Internal reusable utility: parent source bundle

`scripts/stage3b1-parent-source-bundle.mjs` не экспортируется package entrypoint, но используется Stage 3B-1 dry-run и PostgreSQL executor; поэтому его контракт зарегистрирован здесь.

| Function | Input → result | Stop conditions | Side effects |
|---|---|---|---|
| `collectSupplementalParentSourceIds(recordsByTable)` | supplemental datasets → frozen unique external `source_id[]` | invalid/missing values are excluded; local `source_records` IDs are not treated as parent IDs | none |
| `loadVerifiedParentSourceRecords(requiredIds)` | non-empty IDs → frozen parent source rows | invalid IDs/path/manifest/archive/dataset digest/CSV/missing row throws typed `PARENT_SOURCE_*` error | reads registered archive and extracts only declared source CSV |

The utility never treats `record_sources` as the sole evidence source: typed item/container source bindings are included. It neither changes source records nor grants historical, regional or runtime permission.

## Internal immutable migration tooling: PR17

`src/internal/pr17-stage3c.js` and `src/internal/pr17-spatial-records-v1.schema.json` bind the one-time PR17 candidate, 9/9 approved runtime-G4 coverage, approval request and attestation to exact digests. They are used only by PR17 scripts/tests, are absent from `src/index.js`, and are not reusable or permanent public API.

## Версии и совместимость

- Existing reusable public contracts remain unchanged; PR17-only migration helpers are deliberately excluded from the public entrypoint.
- Stage 3B-1/3C add draft-only validation and blocked-or-approved promotion planning; they do not alter Stage 8/16 candidate loading until a separately activated revision exists.
- Existing party instances are outside this module and are never rematerialized by its validators, generator or import helpers.
- New incompatible public behaviour requires a versioned schema/contract change and updates to this registry, [MODULE.md](MODULE.md), module index and interaction map.

## Тестовые доказательства

| Contract area | Tests |
|---|---|
| classification and item/container failures | `classification-catalog.test.js`, `item-container-classification.test.js` |
| supplemental schema/digest/FK/order/source guards | `supplemental-catalog-bundle.test.js` |
| transactional apply/readback/rollback | `supplemental-catalog-postgres.test.js` |
| readiness hard blocks | `materialization-readiness.test.js`, `materialization-readiness-positive.test.js` |
| packing formula | `packing-slots.test.js` and Stage 16 regression tests |
| legacy inventory, all-120 readiness and promotion rollback | `legacy-classification-inventory.test.js`, `editorial-readiness.test.js`, `all-template-promotion.test.js`, `revision-promotion.test.js` |
