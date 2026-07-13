# Test report — 0.23.0-migration.23

Дата: 2026-07-13
Ветка: `agent/restore-canonical-docs-generated-ci`
Последний проверенный baseline commit: `eb88619c4304849515a22428e1c05f6e3c32d7de`
Baseline GitHub Actions run: `#62` (`29267544106`)

## Clean-clone pipeline

| Gate | Result |
|---|---|
| Checkout clean clone | PASS |
| Node.js 22 setup | PASS |
| Lockfile registry normalization | PASS |
| `npm ci` | PASS |
| `npm run world-db:schema-check` | PASS |
| `npm run knowledge:check-corpus` | PASS |
| Deterministic documentation and knowledge generation | PASS |
| `git diff --exit-code -- MODULE_INDEX.md generated/` | PASS |
| Full `npm test` | PASS |

GitHub Actions completed the full job with conclusion `success`. The workflow summary does not expose reliable per-suite test counts, therefore this report does not repeat stale historic totals.

Текущая ветка локально дополнена обязательными `world-db:schema-doc-check` и PostgreSQL 16 execution gate. Финальный clean-clone run для этих новых gates ещё должен быть зафиксирован после push.

## Verified contracts

- executable `world_base` entrypoint and eight ordered SQL parts;
- 62 unique `world_base` tables and read-only schema permissions;
- DDL-driven `infra/world-base/SCHEMA_REFERENCE.md` with 1679 extracted columns and explicit missing descriptions;
- canonical corpus file bytes and SHA-256;
- corpus ownership delegation from `CANONICAL_PATHS.json` to `corpus-manifest.json`;
- approved semantic graph/RAG snapshot preservation;
- deterministic structural graph coverage for native documents;
- deterministic lexical-only RAG coverage where approved embeddings are absent;
- separate provenance, semantic-index and lexical-index digests;
- production startup rejection of missing or stale generated knowledge artifacts;
- CI workflow contract preventing false-green truncated workflows.

## Coverage state

- Corpus documents: 26.
- Legacy documents with provenance: 19.
- Native project documents: 7.
- Semantic documents: 19.
- Structural-only graph documents: 7.
- Lexical-only RAG documents: 7.
- Approved semantic chunks: 813.
- Lexical-only chunks: 346.

## Remaining release gates

- clean-clone execution of the new PostgreSQL 16 gate;
- migration report and PR description synchronization with final run evidence;
- mandatory independent code critic audit;
- owner disposition of the byte-only critic-rule conflict;
- repeat audit after any `CHANGES REQUIRED` or `REJECT` result.

Decision: `automation_green_migration_incomplete_critic_pending`.
