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
- deterministic baseline registration ID и strict attestation bindings;
- generated static readers/writers для 40 registry tables.

## Не делает

- не импортируется production runtime;
- не подключается к operator database без явного operator invocation;
- не придумывает missing rows, categories или G4 transitions;
- не меняет `graph_nodes` при item/container activation.

## Публичный API

CLI modes `preflight`, `migrate`, `register-baseline`, `compile-overlay`,
`import`, `readback`, `activation-request`, `activate`; pure modules доступны
только для tests и reuse внутри tooling.

Machine-readable artifacts описаны
`schemas/runtime-catalog/runtime-catalog-artifacts-v2.schema.json`.
Forward-migration contracts находятся в
`data/runtime-catalog/forward-migration-contracts.v1.json`.

## Допустимые зависимости

`@rus/runtime-catalog`, `@rus/world-catalog-workflow`, `pg` и стандартная
библиотека Node.js. PostgreSQL подключается только CLI adapters.

## Запрещённые зависимости

Game-server, new-game, turn, party-store implementation, provider SDK, UI и
legacy runtime.

## Инварианты

Unknown table/column, missing dependency membership, changed parent row,
invalid attestation или readback mismatch являются hard block. Apply работает
одной явной transaction и не выполняет upsert.

Baseline registration перечитывает static allowlisted tables из restored
database и воспроизводит snapshot manifest. Compatible-world tuple отдельно
проверяется против approved `world_revisions` row и exact runtime configuration
digest.

## Ошибки

`RuntimeCatalogToolingError` с versioned code и immutable details.
Migration, artifact, CLI и runtime-boundary ошибки имеют отдельные typed code:
`MIGRATION_*`, `BASELINE_*`, `OVERLAY_*`, `CATALOG_IMPORT_*`,
`ACTIVATION_*`, `OPERATOR_*`, `PARTY_CATALOG_PIN_*`.

## Тесты

Parameterized/property unit suites для canonical/delta/digest logic и одна
профильная PostgreSQL integration suite для migration/transaction/privileges.
