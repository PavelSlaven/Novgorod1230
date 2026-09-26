# Tools inventory

REFERENCE. tools с MODULE.md — [MODULE_INDEX](../../MODULE_INDEX.md); граница tools/runtime —
[`docs/architecture/DEPENDENCY_RULES.md`](../architecture/DEPENDENCY_RULES.md) (+LW-038).
Запись в БД и operator flows — `MODULE.md` соответствующего tool
(например [tools/runtime-catalog-activation/MODULE.md](../../tools/runtime-catalog-activation/MODULE.md)).

Числа таблиц/миграций сюда не копируются — [DB_SCHEMA](../context/DB_SCHEMA.md).

| Tool | Responsibility | Runtime side effects |
|---|---|---|
| `@rus/map-maker` | Import approved graph contracts, create separate layout sidecars and previews | No canonical DB writes |
| `@rus/db-tools` | Build and validate dry-run/approval packages | No SQL execution |
| `@rus/docs-tools` | Deterministic documentation generation, canonical-path validation, corpus delegation checks, graph/RAG materialization and migration verification | Writes generated documentation only through explicit CLI |
| `@rus/runtime-catalog-activation-tooling` | Exact forward migrations, baseline/compatible-world verification, overlay compile, immutable import/readback and append-only activation | Writes only through explicit confirmed operator CLI against operator-selected databases |
| `scripts/check-world-base-schema.mjs` | Validate the executable 62-table `world_base` DDL, ordered SQL parts and read-only permissions | Read-only source inspection |
| `scripts/generate-world-base-schema-reference.mjs` | Extract tables, columns, types, FK and constraints from current DDL and apply only approved field descriptions | Writes only generated `infra/world-base/SCHEMA_REFERENCE.md` through explicit commands/docs CLI |
| `tools/docs-tools/src/knowledge-corpus-verifier.js` | Validate corpus manifest, aliases, file existence, bytes and SHA-256 | Read-only corpus inspection |
| `tools/docs-tools/src/canonical-corpus-registry.js` | Enforce that `CANONICAL_PATHS.json` delegates corpus ownership to the single corpus manifest and does not duplicate corpus paths | Read-only registry inspection |
| `tools/docs-tools/src/knowledge-materializer-v2.js` | Build structural graph nodes and deterministic lexical RAG chunks for every registered corpus document; no embedding snapshot | Writes only declared `generated/knowledge-source/*` outputs through explicit generate commands |
| `@rus/audit-tools` | Safe release/audit tree manifests | Read-only source scan |
| `@rus/shadow-run` | Execute allowlisted old/new parity corpus and classify differences | Runs test processes and writes dated reports; no provider/DB/cutover |
| `@rus/cutover` | Execute versioned 13-step cutover with repeated gates and import proof | Writes cutover evidence only; no live environment mutation |
| `@rus/finalization` | Aggregate release evidence and separate automated completion from manual owner gates | Writes finalization evidence only; no secrets, deployment mutation or deletion |

## CI contract

[.github/workflows/test.yml](../../.github/workflows/test.yml) — матрица suite;
обязательные schema gates на `fast` и `integration`: `world-db:schema-check`,
`world-db:schema-doc-check`, DDL + table count (см. DB_SCHEMA / TESTING).
`test/integration/ci-workflow-contract.test.js` ловит выпадение gates.
