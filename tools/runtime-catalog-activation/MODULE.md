# Runtime catalog activation tooling

## Назначение

Operator-only tooling для baseline registration, exact overlay compilation,
import/readback и append-only domain catalog activation.

## Владеет

- pure delta compiler и semantic-equivalence gate;
- versioned requests, attestations, manifests и ledger digests;
- explicit typed PostgreSQL adapters и operator CLI;
- preflight/migration/import/activation orchestration.
- exact baseline snapshot reproduction и authoritative compatible-world
  verification;
- new-development-party-only final-candidate cutover preserving every existing
  party pin without migration or rematerialization;
- deterministic baseline registration ID и strict attestation bindings;
- generated static readers/writers для 41 registry tables, включая immutable
  procedural-scene compiled records.
- append-only `actor_base_attributes_v1` owner migration, exact import/readback
  adapter и party pin scope; import-only approval не активирует runtime, а
  runtime activation остаётся отдельным последующим решением.
- target appearance carry-forward authoring и exact approved-status mapping;
  существующий `character-appearance-v1-importer` применяет mapping только после
  независимых exact candidate и mapped-manifest approvals. Он регистрирует тот же
  Spatial world ID/digest в legacy `world_revisions`, проверяет исходные profile
  dependencies и выполняет insert/readback без изменения исторических строк.

## Не делает

`buildG4NaturalCompiledRecords` prepares reviewable exact-G4 natural profile
rows for the existing `procedural_scene_compiled_records` table. It performs
no import or activation and grants no approval; the existing operator
approval/import/readback workflow must admit the resulting rows.

- не импортируется production runtime;
- не подключается к operator database без явного operator invocation;
- не придумывает missing rows, categories или G4 transitions;
- не меняет `graph_nodes` при item/container activation.

## Публичный API

CLI modes `preflight`, `migrate`, `register-baseline`, `compile-overlay`,
`import`, `readback`, `activation-request`, `activate`, `prepare-target-item`,
`build-target-item-import`; pure modules доступны
только для tests и reuse внутри tooling.

`node tools/spatial-v3/character-appearance-v1-importer.mjs --target-transfer`
выдаёт SQL точного approved appearance successor; `--rollback` выдаёт проверочный
вариант транзакции. Команда не подключается к БД. Применение требует существующих
approved v4 appearance dependencies, DDL21 и exact supplemental mapping approval;
оператор использует штатное подключение World Base. SQL проверяет совпадение
каждой уже существующей строки и никогда не выполняет UPDATE.

`--target-transfer-v3` выдаёт отдельный SQL для 129 строк одобренного по DATA
v3 candidate: 44 точных v4 rows вставляются перед 85 target rows. Генератор
проверяет exact candidate, DATA approval, manifest и семь datasets. Команда не
подключается к БД; COMMIT требует отдельного независимого import approval,
live preflight и успешной rollback-пробы.

Machine-readable artifacts описаны
`schemas/runtime-catalog/runtime-catalog-artifacts-v2.schema.json`.
Forward-migration contracts находятся в
`data/runtime-catalog/forward-migration-contracts.v2.json`.
Поле `operator_backup_verified` в статическом контракте не является
attestation конкретного запуска: перед operator apply backup проверяется
внешним deployment/operator gate.

`importApprovedActorBaseAttributes` применяет только exact approved owner row и
immutable import ledger одной транзакцией. `readActorBaseAttributesImport` и
`validateActorBaseAttributesImportResult` проверяют exact membership/readback;
actor activation event при этом обязан отсутствовать. Result явно сохраняет
отказы import-attestation для equipment allocation и world/party migration;
это readback authority, а не новая permission.

Parent pin проверяется через exact append-only Gate1 domain registration: его
V6 world-manifest SHA отличается от actor compatibility-envelope digest.
Исторический actor v1 сохраняет последний в собственной domain revision.
Target actor v2 проверяет exact successor item parent registration и его
compatibility digest из независимо одобренного import request.

`activateActorBaseAttributes` повторно читает exact approved import под
importer role и добавляет один deterministic activation event под activator
role. V1 scope — new-development-party runtime selection. V2 successor scope —
new-production-party selection после отдельного approval и exact import readback;
append требует одобренный predecessor, replay сверяет полный event envelope.
Production preflight требует pin каждой существующей партии и отсутствие
незавершённых commits. Existing-party migration и rematerialization запрещены.

`prepareSpatialV3TargetItemCatalog` читает approved membership и фактический
baseline из PostgreSQL и возвращает запросы с null attestations.
`buildSpatialV3TargetItemImport` требует отдельные baseline/overlay approvals;
оператор применяет результат через существующие register/import/readback modes.
Никакой генератор не утверждает independent approval или activation за аудитора.

## Допустимые зависимости

`@rus/runtime-catalog`, `@rus/world-catalog-workflow`, `pg` и стандартная
библиотека Node.js. PostgreSQL подключается только CLI adapters.

## Запрещённые зависимости

Game-server, new-game, turn, party-store implementation, provider SDK, UI и
legacy runtime.

## Инварианты

`buildG4NaturalPresentationCompiledRecords({ candidateBytes, approval })`
prepares descriptor records for the existing compiled catalog import. It
checks the exact independently approved authoring bytes and produces no DB
writes, runtime pin or activation authorization.

`buildG4NaturalPlacementCompiledRecords({ candidateBytes, approval })` compiles
the separately approved exact placement pack into one existing profile record.
Both natural presentation and placement builders consume the existing
`rus.m2c_supplemental_data_approval.v1` verdict and its exact candidate hashes;
they do not create another approval artifact.

Unknown table/column, missing dependency membership, changed parent row,
invalid attestation или readback mismatch являются hard block. Apply работает
одной явной transaction и не выполняет upsert.

Baseline registration перечитывает static allowlisted tables из restored
database и воспроизводит snapshot manifest. Compatible-world tuple отдельно
проверяется против approved `world_revisions` row и exact runtime configuration
digest.

## Ошибки

Target item preparation включает точные independently approved natural baseline,
presentation, placement и canonical initial-rule compiled records в существующий
overlay. Их import и activation требуют тех же отдельных attestations и
readbacks, что и item membership; authoring approval сам не активирует записи.

`RuntimeCatalogToolingError` с versioned code и immutable details.
Migration, artifact, CLI и runtime-boundary ошибки имеют отдельные typed code:
`MIGRATION_*`, `BASELINE_*`, `OVERLAY_*`, `CATALOG_IMPORT_*`,
`ACTIVATION_*`, `OPERATOR_*`, `PARTY_CATALOG_PIN_*`.

## Тесты

Parameterized/property unit suites для canonical/delta/digest logic и одна
профильная PostgreSQL integration suite для migration/transaction/privileges.
