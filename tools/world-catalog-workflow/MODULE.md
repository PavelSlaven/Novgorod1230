# @rus/world-catalog-workflow

## Назначение

Автономный редакторский инструмент для регистрации ревизий региональной карты, структурной проверки G1-маски, построения координатной очереди, проверки G1-пакетов и fail-closed проверки authoring-каталогов materialization. Модуль также предоставляет нейтральные чистые projections утверждённых `world_base` records для Stage 8 и G5 materialization. Он не владеет runtime I/O, не создаёт исторические факты и не изменяет `world_base` без явно переданного transaction adapter.

Полный реестр публичных контрактов и ошибок находится в [CONTRACTS.md](CONTRACTS.md). Единственный package entrypoint — `./src/index.js`; прямой импорт внутренних файлов другими пакетами запрещён.

## Владеет

- контрактами `rus.region_map_revision.v1`, `rus.g1_work_queue.v1`, `rus.g1_cell_package.v1` и `rus.g1_boundary_contract.v1`;
- чистой структурной валидацией ревизии и G1-пакетов, детерминированной очередью `global_grid_y DESC, global_grid_x ASC` и dry-run без implicit delete;
- `validateCatalogImportManifest`, `validateClassificationCatalog` и `importClassificationCatalog`: manifest, FK-derived order, pinned schemes, controlled label/relation/mapping types, category hierarchy cycles и readback gate;
- `validateItemContainerClassificationCatalog`, `assessItemContainerClassificationMigration` и `assessItemContainerClassificationReadiness`: normalised facets, compatibility, typed legacy gaps/conflicts и required profile/G4 rule;
- чистой `calculatePackingSlots({ quantity, packing_slot_cost, packing_bundle_size })` без доступа к БД, файлам, глобальному состоянию, массы или fallback;
- `validateSupplementalCatalogBundle` и `applySupplementalCatalogBundle`: draft-only manifest, canonical SHA-256, table registry, local/external FK, XOR и injected transaction adapter с readback digest/count и rollback.
- Stage 3C contracts: `buildCatalogEditorialReadinessReport`, evidence/approval plans, verified legacy inventory и all-120-only revision promotion/rollback with atomic G4 status transitions and without activation.
- `buildApprovedItemCatalogSnapshot` и `buildAllowedG5TemplateSet`: чистые immutable projections caller-provided approved `world_base` readback records, revision ID и catalog digest в Stage 8 catalog snapshot и разрешённый G5 template set.

## Публичные интерфейсы

| Группа | Экспорт | Вход → результат |
|---|---|---|
| map authoring | `validateMapRevision`, `projectLegacyG1Rows`, `validateG1Mask`, `cellBlockingReasons`, `buildG1WorkQueue`, `validateBoundaryContract`, `validateG1CellPackage`, `buildImportDryRun` | versioned map/cell input → immutable validation/projected result или typed errors |
| classification | `validateCatalogImportManifest`, `validateClassificationCatalog`, `importClassificationCatalog` | manifest + records + injected transaction adapter → validation/dry-run/apply result без semantic repair |
| item/container | `validateItemContainerClassificationCatalog`, `assessItemContainerClassificationMigration`, `assessItemContainerClassificationReadiness`, `calculatePackingSlots` | normalised records/legacy inventory → errors, typed gaps/conflicts/readiness или exact packing count |
| supplemental | `SUPPLEMENTAL_AUTHORING_TABLES`, `supplementalDigest`, `validateSupplementalCatalogBundle`, `applySupplementalCatalogBundle` | draft manifest + datasets + declared external IDs → deterministic validation или transactional adapter result |
| Stage 3C readiness/promotion | `LEGACY_CLASSIFICATION_FIELD_REGISTRY`, `flattenLegacyRows`, `buildLegacyClassificationInventory`, `buildCatalogEditorialReadinessReport`, `buildEditorialEvidenceReviewPlan`, `buildCoherentEditorialApprovalPlan`, `buildRevisionPromotionPlan`, `buildAllTemplateRevisionPromotionPlan`, `validateApprovedDependencyClosure`, `applyRevisionPromotionPlan`, `buildRevisionRollbackPlan` | verified operator export + exact candidate/coverage digests + all-120 attestation → typed readiness/blocked plan или revision-pinned transactional promotion with exact G4 transitions and without activation |
| approved runtime projections | `buildApprovedItemCatalogSnapshot`, `buildAllowedG5TemplateSet` | approved `world_base` records + revision ID + catalog digest (+ exact G4 for G5 projection) → immutable approved Stage 8 catalog snapshot / allowed G5 template set либо typed `RUNTIME_*` hard error |

`validateSupplementalCatalogBundle` и `applySupplementalCatalogBundle` никогда не переводят `draft` records в `approved`, не активируют revision и не создают party/runtime candidates. Детали всех входов, результатов, ошибок и test cases приведены в [CONTRACTS.md](CONTRACTS.md).

PR17-specific `buildPr17Stage3CApprovalRequest`, `buildPr17Stage3CPromotionPlan` и их spatial JSON Schema находятся в `src/internal/`. Это immutable migration tooling для единственного PR17 lifecycle: оно не экспортируется package entrypoint и не является постоянным публичным контрактом модуля.

## Внешние зависимости и побочные эффекты

- exported validators и calculators чисты: не читают сеть, БД, часы, случайность или глобальное состояние;
- approved runtime projections также чисты и детерминированы: PostgreSQL readback и формирование `records_by_table` выполняет caller, модуль не открывает connection и не читает БД;
- JSON Schema и DDL-derived rules являются входной нормативной зависимостью validator-а;
- apply APIs имеют только явно переданные adapter side effects; Stage 3C дополнительно использует `transition/readTransition` для exact G4 status transitions в той же transaction;
- CLI/readers могут читать явно переданные versioned files; публичные runtime projections принимают только уже прочитанные records и сами I/O не выполняют.

## Ошибки и stop conditions

Ошибки validators возвращаются typed strings в immutable `errors` (`*_UNKNOWN`, `*_INVALID`, `*_MISMATCH`, `*_DUPLICATE`, `*_FORBIDDEN`, `*_REQUIRED`); transactional APIs выбрасывают ошибку на неверном adapter/readback contract. Runtime projections fail-closed выбрасывают `Error` с typed `RUNTIME_*` code при неверной revision/digest pin, неутверждённой или неоднозначной dependency, unresolved G4 binding/template/slot либо пустом required candidate set. Ни один hard block не заменяется fallback или guessed mapping.

## Запрещённые действия

- создавать G1–G4, названия, маршруты, категории, исторические факты или источники;
- писать в PostgreSQL/NocoDB напрямую, изменять party state или materialize конкретные NPC/items/containers/G5;
- превращать external mapping в regional permission, materialization rule или live runtime query;
- массово маппировать legacy fields, менять старые party instances или ослаблять required filters.

## Взаимодействия и потребители

- `@rus/new-game` и `@rus/items-property` используют только публичную `calculatePackingSlots` для fail-closed inventory checks;
- caller читает approved revision records из `world_base`, затем `buildApprovedItemCatalogSnapshot` передаёт чистую проекцию в Stage 8, а `buildAllowedG5TemplateSet` — G4-specific template set в Stage 13/14/16; database readback остаётся вне модуля;
- Stage 3B-1 CLI использует supplemental validator и injected PostgreSQL executor только в editor/import workflow;
- карта взаимодействий и границы party/runtime Stage 3B-1/3C — [INTERACTION_MAP.md](../../data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/INTERACTION_MAP.md).

## Тесты

- `node --test tools/world-catalog-workflow/test/*.test.js` — public contracts, negative fixtures, dry-run, rollback и no-runtime boundary;
- `node --test tools/world-catalog-workflow/test/runtime-catalog-loaders.test.js` — revision/digest pins, typed projection failures, Stage 8/13/14/16 consumption и repeat-entry;
- `npm run test:world-catalog` — полный набор workflow;
- `npm run world-db:import:stage3b1:dry-run` — manifest/digest/FK-derived dry-run Stage 3B-1.

## История значимых изменений

- 2026-07-15: добавлены classification и item/container authoring contracts, readiness и supplemental draft bundle.
- 2026-07-15: добавлены quantity profiles и typed template-source bindings с revision guards.
- 2026-07-16: публичные контракты, ошибки, зависимости и Stage 3B-1 interaction boundary зарегистрированы явно; runtime behaviour не изменён.
- 2026-07-16: добавлены Stage 3C fail-closed readiness, verified legacy inventory и all-120-only promotion APIs; activation и existing parties по-прежнему вне модуля.
- 2026-07-23: Stage 3C расширен полной item/container spatial closure, exact candidate/coverage approval request и атомарными G4 transitions без activation.
- 2026-07-23: зарегистрированы нейтральные чистые runtime projection contracts для approved catalog snapshot и allowed G5 template set; I/O и PostgreSQL readback остаются у caller.
