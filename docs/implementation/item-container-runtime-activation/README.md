# Item/container runtime activation

## Статус

```text
ACTIVATION_TOOLING_READY
OPERATOR_DATABASE_PRESENT_LEGACY
OPERATOR_DATABASE_NOT_ACTIVATED
```

Рабочий документ задачи реализации domain-scoped runtime activation для
`item_container_materialization_v2`.

## Readiness

- repository: `PavelSlaven/Novgorod1230`;
- clean worktree: `C:\Users\Slaven\Documents\Novgorod-item-container-runtime-activation`;
- branch: `codex/item-container-runtime-activation`;
- base/head at start: `bb5db7cde2b0e38420234beba8c9bdf6e34a45cf`;
- `origin/main` at start: `bb5db7cde2b0e38420234beba8c9bdf6e34a45cf`;
- Node.js: `v24.16.0`;
- npm: `11.13.0`;
- Python: `3.13.3`;
- uv: `0.8.12`;
- Docker Engine: `29.5.3`;
- Docker Compose: `v5.1.4`;
- Graphify: `0.9.17`;
- dependencies: `npm ci` completed, 0 vulnerabilities;
- worktree was clean before this README was created;
- the local operator database was inspected only through read-only transactions
  after a timestamped backup; it was never modified.

### Operator infrastructure audit

- `knowledge-source` status is `degraded`; Repository Graph is `ready` and pinned
  to the exact HEAD. The documented navigation-MVP exception applies only to
  retrieval coverage, not to materialization readiness.
- A local operator PostgreSQL/NocoDB environment exists. Docker identifies
  `world-base-postgres-1` (`postgres:16`, host port `5432`) and persistent volume
  `world-base_postgres_data`; Compose labels bind it to the earlier
  `Novgorod-pr7-stage3b1` project worktree. `docker-compose.yml` defines the same
  `world-base` project, `world_db`, `world_admin` and the named volume.
- Project history independently identifies this database as the local operator
  source: `db-snapshot/README.txt` records a live dump on 2026-07-10, and the PR17
  audit records a verified read-only inspection on 2026-07-22.
- Before any change, a new full custom-format backup was created:
  `C:\Users\Slaven\Documents\Novgorod-item-container-runtime-activation-operator-evidence\backups\20260723T133356Z\world_db_20260723T133356Z.dump`,
  2,682,539 bytes, SHA-256
  `04c8ded56fc16fc76688fdea3c31876ed626a26d910a092a9a4d61a753f60405`.
- The backup catalog and full restore passed in a disposable PostgreSQL 16
  container. Restored counts are 62 `world_base` tables, 11,359 graph nodes,
  30,248 graph edges, 183 source records and zero item templates.
- A per-primary-key comparison of all tables that differed at raw-dump level
  showed no semantic row differences from tracked
  `db-snapshot/world_base.dump`; only excluded operational timestamps differ.
  The operator database therefore contains no semantic `world_base` data absent
  from the canonical repository snapshot.
- This is a legacy operator source, not an activation-ready production
  database. On the disposable restore its security-aware v2 `world_base`
  fingerprint is
  `0ef23a063edc194ba811b2c4fcd7d88f285d8adceda9aa1bef1624a434721c00`,
  not the required migration source
  `486ef58ba51684f6f2580e444b9421e658508cf23633025a19dad53192694be6`.
  It has the old `party` schema and no `party_runtime` schema. The tooling
  correctly hard-blocks migration/import/activation for that state.
- Provisioning the current operator schemas, approving the older-schema
  transition and performing production rehearsal remain a separate post-merge
  operator step. They do not block this tooling PR.

## Repository Intelligence

### Information need

```text
Реализовать domain-scoped runtime activation для
item_container_materialization_v2: существующие модули, DDL и migration
contracts, baseline/import/activation tooling, runtime catalog loader, party
catalog pins, new-game reload turn persistence, связанные public APIs и tests.
```

### Commands

```text
npm run repo-intel:ensure
npm run repo-intel:status
npm run repo-intel:query -- --query "<information need>"
npm run repo-intel:query -- --query "Существует ли operator или production world_base, где определены PostgreSQL connection configuration, Docker Compose services, volumes, environment variables, backup и pg_dump workflows?"
graphify reflect --if-stale
graphify query "runtime catalog activation baseline import pins persistence migration party loaders" --budget 3500
graphify path "runtime-catalog-loaders.js" "party-transaction.js"
graphify explain "runtime-catalog-loaders.js"
graphify explain "p25-activation-tooling.mjs"
graphify path "p25-activation-tooling.mjs" "party-store.js"
graphify query "runtime activation catalog baseline migration import container item party persistence attestation acceptance" --budget 3500
graphify query "postgresql production docker compose environment connection operator restore volume world database" --budget 4000
```

### Results

- RAG found the active materialization v2 architecture and table-purpose
  normative documents.
- RAG also ranked target Spatial v3 documents. They are navigation noise for
  this task: the plan and active v2 documents explicitly forbid partial P28
  activation, dual read/write and mixing the target runtime path into this
  scope.
- Graphify found the current pure projection owner
  `tools/world-catalog-workflow/src/runtime-catalog-loaders.js`, the PR17
  candidate/promotion tooling, Stage 8/13/14/16 consumers, Stage 24/25 party
  persistence, reload/turn modules and their tests.
- The final Graphify completion traversal connected the migration, baseline,
  overlay/import, activation, immutable runtime loader, new-game and party
  persistence implementations to their focused and PostgreSQL lifecycle tests.
  The graph exposed no additional implementation owner outside the modules
  already in scope.
- The infrastructure query located Compose, PostgreSQL production composition,
  operator executors and restore-related project evidence. Exact Docker labels,
  local environment state and database contents were then verified with
  read-only infrastructure inspection.
- `p25-activation-tooling.mjs` belongs to target Spatial v3 and is not reused as
  the item/container production activation path.
- No previous Graphify lessons existed.

## Fully read normative documents

- `AGENTS.md`;
- `.github/AGENTS.md`;
- `data/knowledge-source/corpus/DOCUMENTS/development_rules.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/code_critic_invocation_rule.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md`;
- `data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md`;
- `data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md`;
- `data/knowledge-source/corpus/DOCUMENTS/map_g0_g4_workflow.txt`;
- `data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md`;
- `data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md`;
- `infra/world-base/SCHEMA_REFERENCE.md`;
- `C:\Users\Slaven\Downloads\runtime_activation_item_container_final_plan.md`.

`infra/world-base/SCHEMA_REFERENCE.md` inspected for the current affected
schemas and then fully reread after fixing its multi-column `ALTER TABLE`
parser. Current generated reference: 186 tables, expanded DDL SHA-256
`8e4bbb7d1128ad560a16e84a61736ae21c79245314c6866b240bd252037e51d2`.

## Existing owners and affected boundaries

- `@rus/world-catalog-workflow`: current editor/import tooling and pure approved
  runtime projections; does not own runtime I/O.
- `@rus/world-base`: generic injected read-only SQL port.
- `@rus/materialization`: persistence-free deterministic materialization.
- `@rus/new-game`: Stage 8/13/14/16 and Stage 24/25 orchestration.
- `@rus/party-store`: Stage 25 persistence boundary.
- `@rus/turn` and game-server party adapters: persisted-party reload/turn path.
- `infra/world-base/schema/09.sql`–`11.sql`: current v2 revisions,
  materialization tables and basic import audit.
- `schemas/party-db/001_party_runtime.sql`: current party runtime v2 schema.

## Confirmed public test seams

The user-provided plan is the agreement for these seams:

1. `@rus/runtime-catalog` public API:
   `createRuntimeCatalogLoader`, `loadActivePin`,
   `loadApprovedItemCatalog`, `assertCompatibleWorldPin`,
   `selectApplicableItemCatalog`.
2. Operator CLI modes:
   `preflight`, `migrate`, `register-baseline`, `compile-overlay`, `import`,
   `readback`, `activation-request`, `activate`.
3. Exact legacy/target fingerprint migration boundary for world and party DBs.
4. Baseline registration, import and activation transactional boundaries.
5. Stage 8/13/14/16 immutable pin continuity and Stage 24/25 atomic
   persistence/readback.
6. Reload/turn historical import loading from persisted party pin without
   reading the active default.

The section 17 list is a coverage matrix. Scenarios are consolidated into
parameterized and property-based suites. The same assertion is not duplicated
across unit, integration and E2E levels.

## Test execution policy

```text
development
→ affected unit/contract tests only

major stage complete
→ relevant PostgreSQL integration suite

final candidate
→ npm test
→ one clean-clone acceptance
→ one independent critic
→ GitHub CI

after critic findings
→ affected tests
→ necessary final checks
→ repeated critic
```

## Work log

- Created a new clean worktree and one branch from exact `origin/main`.
- Installed dependencies.
- Rebuilt and queried Repository Intelligence.
- Updated the four active materialization/map normatives before code or DDL.
- Updated the canonical corpus manifest and regenerated only the dependent
  documentation, RAG and knowledge-graph artifacts.
- Added the `@rus/runtime-catalog` documented public boundary and its module,
  ownership, dependency, interaction and pipeline maps.
- Added the versioned 40-table canonical record registry and deterministic
  generator/check.
- Fixed the schema-reference parser so every column in a multi-column
  `ALTER TABLE` is represented separately.
- Implemented active-domain and exact historical import loading, compatible
  full-world checks, immutable applicable projection, shared canonical row
  projection and versioned runtime contract digest.
- Added exact additive world/party forward migrations with source/target
  fingerprints, immutable ledgers, append-only triggers, least-privilege roles
  and fail-closed partial/unknown-state classification.
- Implemented operator artifact builders, authoritative compatible-world
  manifest verification, reproducible baseline snapshot verification,
  deterministic baseline registration, exact delta compiler, nine scoped G4
  assertions, semantic-equivalence comparison, promotion/approval/import
  ledgers, import/readback and append-only CAS activation.
- Added the operator CLI modes `preflight`, `migrate`, `register-baseline`,
  `compile-overlay`, `import`, `readback`, `activation-request`, `activate`.
  Confirmed writes require `--confirm` and the exact request digest.
- Integrated one immutable runtime-catalog context into new-game Stages
  8/13/14/16/24/25. Stage 8 and Stage 13 now derive their approved projections
  from that exact verified context; Stage 13 preserves the G4 template-set
  artifact for Stage 14, and every listed boundary fails on a broken domain or
  world pin chain. Stage 24 writes the full world pin, party domain pin and run
  pin; Stage 25 persists them atomically.
- Integrated persisted-pin reload/turn behavior in game-server composition.
  Existing parties load the exact historical import without reading the active
  event or live authoring rows.
- Updated first-entry materialization so its domain pin and projection digest
  remain separate, missing/incompatible pins fail before the loader, and every
  baseline/repair run receives an exact normalized run pin in the same
  transaction.
- Added the combined JSON Schema
  `schemas/runtime-catalog/runtime-catalog-artifacts-v2.schema.json` and the
  [operator runbook](OPERATOR_RUNBOOK.md).
- Audited the local operator infrastructure, created and checksummed a
  timestamped full backup before any changes, proved its disposable restore,
  and compared its `world_base` content with the canonical tracked snapshot.
- Classified the operator database as a legacy, non-activation-ready source.
  Production provisioning, rehearsal, approval and activation are kept as the
  documented post-merge operator step rather than a tooling-PR blocker.
- The first independent critic returned `CHANGES REQUIRED` for two major gaps:
  the loader trusted the imported G4 assertion ledger without re-reading live
  `graph_nodes`, and the exact migration fingerprint omitted roles and ACLs.
- Closed both findings test-first. Historical/active catalog loading now compares
  every asserted G4 row with its exact live canonical projection and digest.
  Schema fingerprint v2 now binds scoped role attributes, grants, default ACLs
  and scoped memberships; unexpected privilege drift fail-closes before an
  `already_applied` result.
- The same independent critic repeated the audit after the fixes and returned
  `PASS`. It repeated the focused runtime/new-game/migration suites (23 tests),
  the PostgreSQL forward-migration lifecycle and `git diff --check`; all passed.
- The first GitHub CI run exposed a test-cleanup race only: the disposable
  PostgreSQL container could stop before the test pool closed, producing late
  asynchronous activity under Node.js 22 after an otherwise passing lifecycle.
  Cleanup is now one ordered async callback (`pool.end()` then container removal);
  the affected PostgreSQL integration suite passed locally.

## Implemented files and contracts

- runtime package: `packages/runtime-catalog/`;
- operator tooling and migrations: `tools/runtime-catalog-activation/`;
- registry and migration contracts: `data/runtime-catalog/`;
- runtime artifact JSON Schema: `schemas/runtime-catalog/`;
- game-server coordinator and PostgreSQL party boundaries:
  `apps/game-server/src/runtime/runtime-catalog.js` and
  `apps/game-server/src/infrastructure/postgres/party-store.js`;
- new-game pin continuity and Stage 24/25 persistence:
  `packages/new-game/src/orchestrator/runtime-catalog-context.js`,
  Stage 24 and `packages/party-store/src/stage-25/schema-mapping.js`.

The local operator database was contacted only for `pg_dump` and explicitly
read-only SQL inspection. No DDL, migration, import, seed or test was directed
at it. Backup validation, fingerprint checks and every integration test ran in
disposable PostgreSQL 16 containers that were removed afterward.

## Checks performed

```text
npm run docs:generate
→ PASS

npm run docs:check
→ PASS

node --test tools/docs-tools/test/documentation-generation.test.js \
  tools/docs-tools/test/knowledge-corpus-verifier.test.js
→ PASS, 13 tests

node --test packages/runtime-catalog/test/*.test.js \
  tools/docs-tools/test/documentation-generation.test.js
→ PASS, 20 tests

npm run runtime-catalog:registry-check
→ PASS, 40 tables

npm run world-db:schema-doc-check
→ PASS, 186 tables

node --test tools/runtime-catalog-activation/test/*.test.js \
  packages/runtime-catalog/test/*.test.js \
  apps/game-server/test/party-store-runtime-catalog.test.js \
  packages/materialization/test/materialization.test.js \
  apps/game-server/test/runtime-catalog-boundary.test.js \
  test/modules/runtime-catalog-new-game.test.js \
  test/modules/stage24-modular-parity.test.js \
  test/modules/code-materialization-run.test.js \
  tools/world-catalog-workflow/test/runtime-catalog-loaders.test.js
→ PASS, 90 tests

node --test --test-name-pattern="production first-entry repository|production Stage 25 ports" \
  test/integration/production-infrastructure.test.js
→ PASS, 4 selected integration scenarios

node --test test/integration/runtime-catalog-forward-migrations-postgres.test.js
→ PASS, PostgreSQL 16 profile suite

node --test packages/runtime-catalog/test/runtime-catalog.test.js \
  apps/game-server/test/runtime-catalog-boundary.test.js \
  test/modules/runtime-catalog-new-game.test.js
→ PASS, 18 affected tests after first critic

node --test tools/runtime-catalog-activation/test/forward-migration.test.js
→ PASS, 5 affected migration contract tests after first critic, including
  exact published-contract/executable-migration parity

node --test test/integration/runtime-catalog-forward-migrations-postgres.test.js
→ PASS after first critic; privilege-drift regression proves that a temporary
  unauthorized GRANT invalidates the target fingerprint and exact REVOKE restores
  idempotent already_applied classification

node --test test/integration/runtime-catalog-forward-migrations-postgres.test.js
→ PASS after CI cleanup-order fix; no asynchronous activity after test completion

npm run architecture:check
→ PASS

npm run knowledge:check
→ PASS, 35 documents; graph and RAG current

npm run repo-intel:status
→ repository graph/Graphify ready at 0.9.17; knowledge source degraded warning
  only because pre-existing semantic coverage gaps remain

graphify update .
→ PASS, 24,942 nodes / 49,500 edges

npm test
→ PASS on the final local functional candidate
→ the dedicated runtime-catalog PostgreSQL lifecycle ran and passed
→ five unrelated opt-in PostgreSQL scenarios were skipped without their env
→ browser E2E was skipped because Chromium is not installed

git diff --check
→ PASS

git fetch --prune origin
git rev-parse HEAD
git rev-parse origin/main
→ PASS; both bb5db7cde2b0e38420234beba8c9bdf6e34a45cf

docker inspect world-base-postgres-1
docker volume inspect world-base_postgres_data
→ PASS; local operator Compose provenance and persistent volume confirmed

docker exec world-base-postgres-1 pg_dump -U world_admin -d world_db \
  --no-owner --no-acl -Fc
Get-FileHash <timestamped backup> -Algorithm SHA256
→ PASS; 2,682,539-byte full backup, SHA-256
  04c8ded56fc16fc76688fdea3c31876ed626a26d910a092a9a4d61a753f60405

pg_restore --list <timestamped backup>
pg_restore --exit-on-error <timestamped backup> into disposable PostgreSQL 16
→ PASS; full restore and exact key counts verified

BEGIN TRANSACTION READ ONLY
→ PASS; operator identity/schema/content inventory captured without writes

per-table and per-primary-key operator-vs-repository snapshot comparison
→ PASS; no semantic row absent from canonical db-snapshot/world_base.dump

runtime-catalog schema fingerprint reader against disposable operator restore
→ expected FAIL-CLOSED classification; legacy world fingerprint differs and
  party_runtime is absent

clean checkout at C:\Users\Slaven\rca-38720
candidate base bb5db7cde2b0e38420234beba8c9bdf6e34a45cf
candidate tracked-diff SHA-256
  ebab036bb340850f9ca157d3de9f8f349b646d06ae6111d196b6d80365cd5ec6
npm ci
npm test
post-test candidate parity
→ PASS; 41 untracked deliverables matched byte-for-byte, full suite exit 0,
  runtime-catalog PostgreSQL lifecycle and architecture checks passed
```

The operator-source backup is valid but is not an activation-ready baseline.
Its provisioning/migration rehearsal and approval evidence belong to the
post-merge operator procedure. The independent critic returned `PASS`;
commit/push and GitHub CI are the remaining PR gates.

## Plan completion matrix

Status meanings:

- `IMPLEMENTED` — code/document contract exists and has local automated
  evidence;
- `PR GATE PENDING` — an ordered tooling-PR check has not run yet;
- `POST-MERGE OPERATOR` — explicitly belongs to the maintenance window, not to
  the tooling PR.

| Plan sections | Status | Implementation and evidence |
| --- | --- | --- |
| 1–3: boundaries, identities, active normatives | `IMPLEMENTED` | One clean worktree/branch and exact base SHA; active materialization and graph normatives, registries and maps updated. Operator access was limited to backup/read-only inspection. |
| 4: authoritative inputs | `IMPLEMENTED` + `POST-MERGE OPERATOR` | Strict artifact builders and validators exist. Backup provenance is now fixed; compatible-world and approval attestations are intentionally produced during the operator maintenance procedure. |
| 5: forward migrations | `IMPLEMENTED` | Exact security-aware legacy/target fingerprints, immutable ledgers, atomic DDL, grants/revokes and append-only triggers; PostgreSQL 16 lifecycle and privilege-drift regression passed. |
| 6: baseline snapshot/registration | `IMPLEMENTED` + `POST-MERGE OPERATOR` | Reproducible manifest, request, attestation verification and registration executor are tested. The concrete registration is maintenance-window evidence, not a code-PR artifact. |
| 7: canonical registry | `IMPLEMENTED` | Versioned 40-table registry, static generated adapters, composite keys and canonical row projection; generator/check and canonicalization suite passed. |
| 8–9: overlay and semantic equivalence | `IMPLEMENTED` + `POST-MERGE OPERATOR` | Exact insert/assert-existing delta, dependency closure, nine scoped G4 assertions, promotion/approval chain and strict PR17 comparator are tested. Concrete report/approval evidence is produced after operator provisioning. |
| 10: exact import membership | `IMPLEMENTED` + `POST-MERGE OPERATOR` | Transactional import/readback, immutable snapshots, composite membership, dependency assertions and idempotency passed the disposable PostgreSQL lifecycle. No import was attempted against the legacy operator database. |
| 11–12: runtime package and release identity | `IMPLEMENTED` | Documented public API, supported contract digest, exact active/historical reconstruction, live G4 dependency revalidation, immutable projection, typed errors and deterministic release identity are covered by contract tests. |
| 13: party persistence and trace continuity | `IMPLEMENTED` | One pin crosses Stages 8/13/14/16/24/25; party/run pins persist atomically; reload/turn uses exact historical import and never falls back to active state. |
| 14: activation | `IMPLEMENTED` + `POST-MERGE OPERATOR` | Empty-party preflight, request/attestation binding, fixed advisory lock, CAS sequence, exact replay and append-only event passed artifact and PostgreSQL lifecycle tests. Operator activation was not performed. |
| 15: operator CLI | `IMPLEMENTED` | All eight modes exist, default to read-only/dry-run where applicable, produce machine-readable results and require `--confirm` plus the exact request digest for writes. |
| 16: maintenance-window rollout | `POST-MERGE OPERATOR` | Exact ordered procedure, evidence set, hard blocks and non-destructive recovery are documented in `OPERATOR_RUNBOOK.md`; only backup/read-only inspection occurred. |
| 17: coverage matrix | `IMPLEMENTED` | Consolidated parameterized/contract suites plus one PostgreSQL lifecycle cover 17.1–17.9 and the synthetic CI lifecycle in 17.10. Assertions are not duplicated one-for-one across test levels. |
| 18: final PR gates | `PR GATE PENDING` | Implementation, generated artifacts, focused/profile/full tests, PostgreSQL lifecycle, one clean-clone acceptance, affected post-critic regressions and repeated critic (`PASS`) completed. Commit/push and CI remain. |
| 19: PR deliverables | `IMPLEMENTED` + `POST-MERGE OPERATOR` | Normatives, documentation, DDL, schemas, validators, runtime/operator code and tests exist. Concrete operator manifests, report and attestations remain local maintenance evidence. |
| 20: Definition of Done | `PR GATE PENDING` | Tooling implementation, clean-clone acceptance and critic are complete; GitHub CI remains. Production provisioning/rehearsal is a post-merge operator gate. |

### Coverage matrix evidence

| Coverage area | Consolidated suite owner |
| --- | --- |
| 17.1 migrations | `tools/runtime-catalog-activation/test/forward-migration.test.js`; `test/integration/runtime-catalog-forward-migrations-postgres.test.js` |
| 17.2 canonicalization | `packages/runtime-catalog/test/canonical-records.test.js` |
| 17.3 baseline | `tools/runtime-catalog-activation/test/artifact-contracts.test.js`; PostgreSQL lifecycle |
| 17.4 overlay compiler | `tools/runtime-catalog-activation/test/overlay-compiler.test.js` |
| 17.5 semantic equivalence | semantic comparator cases in `artifact-contracts.test.js` and `semantic-equivalence.js`, exercised again only as lifecycle composition |
| 17.6 import | one parameterized runtime-loader failure matrix plus the single PostgreSQL import/readback lifecycle |
| 17.7 activation | activation artifact cases plus the same PostgreSQL lifecycle, including concurrency/append-only behavior |
| 17.8 runtime loader | `packages/runtime-catalog/test/runtime-catalog.test.js` |
| 17.9 party/runtime | `test/modules/runtime-catalog-new-game.test.js`, game-server catalog boundary/party-store suites and selected production adapter scenarios |
| 17.10 CI/acceptance | existing full-profile GitHub workflow runs `npm test`; the new disposable PostgreSQL lifecycle is part of `test:integration`; one tooling clean-clone acceptance passed |

## Post-merge operator work

The current operator database is backed up and recoverable, but it predates the
accepted migration source schemas. The following evidence is therefore created
only after a separately approved operator provisioning/rehearsal step:

- `OPERATOR_BASELINE_SNAPSHOT_MANIFEST.json`;
- `BASE_WORLD_COMPATIBILITY_MANIFEST.json`;
- baseline request/attestation;
- rebuilt PR17 candidate and semantic-equivalence `PASS`;
- overlay approval request/attestation;
- real import/readback and activation request/event evidence.

The new timestamped backup is used only through disposable restore until that
operator step. The tooling PR is not blocked by the absence of an
activation-ready production environment. Operator database activation remains
out of scope for this code PR and was not performed.

Current branch: `codex/item-container-runtime-activation`.
Base `origin/main`: `bb5db7cde2b0e38420234beba8c9bdf6e34a45cf`.
Implementation commit:
`2ac568894a6ec8eee1e44624ac8bb61cd21b953c`.
Draft PR:
[`PavelSlaven/Novgorod1230#18`](https://github.com/PavelSlaven/Novgorod1230/pull/18).
GitHub CI: pending on the final evidence commit.
