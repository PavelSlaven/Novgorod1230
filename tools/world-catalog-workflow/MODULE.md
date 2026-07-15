# @rus/world-catalog-workflow

## Назначение

Автономный редакторский инструмент для регистрации ревизий региональной карты, структурной проверки G1-маски, построения очереди по координатам, проверки пакета одной G1, формирования dry-run импорта и fail-closed проверки authoring-каталогов materialization.

## Владеет

- контрактами `rus.region_map_revision.v1`, `rus.g1_work_queue.v1`, `rus.g1_cell_package.v1` и `rus.g1_boundary_contract.v1`;
- чистой структурной валидацией ревизии и G1-пакетов;
- детерминированной очередью `global_grid_y DESC, global_grid_x ASC`;
- техническим сравнением существующих и входящих записей без молчаливого удаления.
- публичными `validateCatalogImportManifest`, `validateClassificationCatalog` и `importClassificationCatalog`: проверкой manifest, FK-derived порядка, pinned schemes, controlled label/relation/mapping types, category hierarchy cycles, dry-run и transaction adapter с readback digest/count gate.
- публичными `validateItemContainerClassificationCatalog`, `assessItemContainerClassificationMigration` и `assessItemContainerClassificationReadiness`: fail-closed проверкой нормализованных item/container facets, content compatibility, typed legacy gaps/conflicts и обязательных profile/G4 rule.
- публичной чистой `calculatePackingSlots({ quantity, packing_slot_cost, packing_bundle_size })`: расчётом `ceil(quantity / packing_bundle_size) × packing_slot_cost` без доступа к БД, файлам, глобальному состоянию, массы или fallback.
- публичной чистой `validateSupplementalCatalogBundle(manifest, recordsByTable, { externalIds })`: проверкой отдельного `draft` supplemental authoring bundle, canonical SHA-256, table registry, local/external FK и XOR. Она не импортирует данные, не делает records runtime-candidates и запрещает party tables.

## Не делает

- не создаёт G1–G4, названия, маршруты, исторические факты или источники;
- не назначает отсутствующие `control_status`, `evidence_status`, `playability_status`, доли воды/суши или субрегион;
- не пишет в PostgreSQL/NocoDB;
- не изменяет runtime;
- не создаёт конкретных NPC, предметы, контейнеры или G5.
- не превращает external mapping в региональное разрешение, materialization rule или runtime live-запрос.
- не выполняет массовый historical mapping legacy fields и не меняет party instances.

## Побочные эффекты

Только CLI-адаптер читает и записывает явно переданные файлы. Все экспортированные функции являются чистыми.

## Тесты

`node --test tools/world-catalog-workflow/test/*.test.js`
