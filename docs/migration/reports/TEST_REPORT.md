# Test report — 0.23.0-migration.23

Дата: 2026-07-13
Ветка: `agent/restore-canonical-docs-generated-ci`
Последний проверенный implementation commit: `c132601c4dce2eb3c8a5adbe8892339e6d29a7d1`
GitHub Actions run: `#65` (`29273919381`), job `86898128637`

## Clean-clone pipeline

| Gate | Result |
|---|---|
| Checkout clean clone | PASS |
| Node.js 22 setup | PASS |
| Lockfile registry normalization | PASS |
| `npm ci` | PASS |
| `npm run world-db:schema-check` | PASS |
| `npm run world-db:schema-doc-check` | PASS |
| PostgreSQL 16: DDL с `ON_ERROR_STOP=1`, 62 таблицы, `world_reader`, read-only grants | PASS |
| `npm run knowledge:check-corpus` | PASS |
| Deterministic documentation and knowledge generation | PASS |
| `git diff --exit-code -- MODULE_INDEX.md generated/ infra/world-base/SCHEMA_REFERENCE.md` | PASS |
| Проверка отсутствия untracked generated outputs | PASS |
| Full `npm test` | PASS |

GitHub Actions completed the full job with conclusion `success`. The workflow summary does not expose reliable per-suite test counts, therefore this report does not repeat stale historic totals.

Run `#65` выполнил schema-reference и PostgreSQL gates в чистом checkout. PostgreSQL service принял весь DDL; подтверждены 62 таблицы, одна не-привилегированная роль `world_reader`, `USAGE` без `CREATE`, 62 `SELECT` grants и 0 write grants.

В run `#65` прошли regression tests public v2 writer и exact manifest-derived corpus count. Третий critic audit обнаружил, что semantic snapshot не был связан с текущим semantic text, graph locations не проверялись v2-путём, а re-import терял native registration. Negative tests воспроизвели все три дефекта; локальный remediation теперь проходит 19 targeted tests.

## Verified contracts

- executable `world_base` entrypoint and eight ordered SQL parts;
- 62 unique `world_base` tables and read-only schema permissions;
- DDL-driven `infra/world-base/SCHEMA_REFERENCE.md` with 1679 extracted columns and explicit missing descriptions;
- canonical corpus file bytes and SHA-256;
- corpus ownership delegation from `CANONICAL_PATHS.json` to `corpus-manifest.json`;
- approved semantic graph/RAG snapshot preservation;
- deterministic structural graph coverage for native documents;
- deterministic lexical-only RAG coverage where approved embeddings are absent;
- semantic subset hash and exact ordered chunk parity before approved vectors are accepted;
- semantic graph source-file and line-range validation;
- native-preserving repeat legacy import;
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

- новый clean-clone execution после round3 remediation;
- следующий independent code critic audit;
- owner disposition of the byte-only critic-rule conflict;
- repeat audit after any `CHANGES REQUIRED` or `REJECT` result.

Decision: `run_65_green_round3_changes_required_remediated_locally`.
