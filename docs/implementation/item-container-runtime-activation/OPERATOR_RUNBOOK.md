# Operator runbook: item/container runtime catalog

Этот runbook описывает только явную operator-процедуру для scope
`item_container_materialization_v2`. Production runtime не выполняет эти
операции и не получает write-доступ к `world_base`.

## Preconditions

Перед началом оператор фиксирует:

- текущий commit канонической ветки `main`;
- путь и SHA-256 актуального operator backup;
- disposable PostgreSQL 16 instances для `world_base` и `party_runtime`;
- exact runtime release manifest;
- локальный evidence directory вне репозитория;
- отдельные baseline, overlay-import и activation attestations.

Backup восстанавливается только в disposable database. Operator/production
database нельзя использовать для rehearsal, migrations, import или tests.

## Обязательная последовательность

```text
operator backup
→ disposable restore
→ migration preflight
→ exact forward migrations
→ baseline snapshot reproduction
→ compatible-world verification
→ baseline registration
→ overlay compile
→ semantic equivalence PASS
→ overlay approval
→ exact import/readback
→ runtime release verification
→ empty-party preflight
→ activation request
→ activation attestation
→ append-only activation event
→ smoke
```

Любой unknown fingerprint, partial migration state, digest mismatch, missing
membership row, invalid attestation или changed party preflight является hard
block.

## CLI

```powershell
$worldDbUrl = '<disposable world database URL>'
$partyDbUrl = '<disposable party database URL>'

npm run runtime-catalog:operator -- preflight `
  --world-db-url $worldDbUrl `
  --party-db-url $partyDbUrl
```

Write modes сначала запускаются без `--confirm`. Confirmed invocation требует
exact request digest:

```powershell
npm run runtime-catalog:operator -- migrate `
  --world-db-url $worldDbUrl `
  --party-db-url $partyDbUrl

npm run runtime-catalog:operator -- migrate `
  --confirm `
  --expected-request-digest '<migration request digest>' `
  --world-db-url $worldDbUrl `
  --party-db-url $partyDbUrl
```

Остальные режимы:

```text
register-baseline
compile-overlay
import
readback
activation-request
activate
```

`register-baseline` получает exact baseline manifest, compatible-world
manifest, runtime configuration tuple, request и attestation. Registration ID
вычисляется кодом из request digest.

`compile-overlay` получает canonical registry, parent/compatible tuples,
candidate rows, полный dependency-link contract и девять G4 transitions.

`import` принимает только новый overlay approval с
`activation_authorized=false`. Exact repeat является no-op; другой digest для
того же import ID блокируется.

`activation-request` повторно читает party preflight. Для initial rollout
требуются:

```text
party_count = 0
missing_domain_pin_count = 0
inflight_stage24_stage25_count = 0
```

`activate` под advisory lock повторяет party preflight, проверяет CAS predecessor
и authenticated database principal, затем вставляет один append-only event.

## Evidence

В локальном evidence directory сохраняются:

- backup provenance и restore log;
- migration preflight/result;
- `OPERATOR_BASELINE_SNAPSHOT_MANIFEST.json`;
- `BASE_WORLD_COMPATIBILITY_MANIFEST.json`;
- baseline request/attestation;
- rebuilt candidate и promotion manifest;
- semantic-equivalence report с `PASS`;
- overlay approval request/attestation;
- import ledger/readback;
- runtime release identity;
- party preflight;
- activation request/attestation/event;
- smoke result.

Секреты, database URLs и operator evidence не коммитятся. Их публикация требует
отдельной evidence-only задачи.

## Rollback и повтор

Destructive down migration запрещена. До activation event безопасный rollback —
удалить disposable databases и повторить процедуру из того же backup. После
activation исправление выполняется новой approved revision/import/event; старые
ledger rows и events не изменяются.

Новые партии читают active event один раз. Existing parties всегда используют
persisted `party_catalog_pins` и exact historical import; автоматический
backfill или rematerialization запрещён.

## Текущее состояние operator environment

Локальная operator database обнаружена в `world-base-postgres-1`. До любых
изменений создан timestamped full backup, его SHA-256 зафиксирован в рабочем
README, а полный restore проверен в disposable PostgreSQL 16.

Read-only inventory показал legacy state: 62 таблицы `world_base`, старую схему
`party` вместо `party_runtime` и fingerprint, не совпадающий с разрешённым
source fingerprint forward migration. Поэтому tooling fail-closed блокирует
migration/import/activation этой базы.

Provisioning current source schemas, production rehearsal, compatible-world
proof и attestations выполняются отдельным operator step после merge. Это не
блокирует PR с инструментарием. До того момента backup используется только для
disposable restore; operator database не изменяется и activation evidence не
создаётся.
