# Test report — 0.23.0-migration.23

Дата: 2026-07-13
Ветка: `agent/restore-canonical-docs-generated-ci`
Последний проверенный implementation commit: `3cb8eab2c7acc0f272d792018d39d659a829fba9`
GitHub Actions run: `#70` (`29279548326`), job `86917091894`

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

Run `#70` выполнил schema-reference и PostgreSQL gates в чистом checkout. PostgreSQL service принял весь DDL; подтверждены 62 таблицы, одна не-привилегированная роль `world_reader`, `USAGE` без `CREATE`, 62 `SELECT` grants и 0 write grants.

Run `#68` подтвердил remediation пятого аудита: provenance checks для nodes/links/hyperedges, exact graph/RAG semantic-set boundary, structural endpoint guard и collision-before-write. В clean clone прошли generation/reproducibility и полный `npm test`; локальный обязательный цикл также прошёл полностью.

Evidence-only commit `afed3740e6fecb5de57d9aa961cdb77abcabf75a` прошёл run `#69` (`29278114051`), job `86912220316`, со всеми теми же gates. Шестой critic audit выявил непроверенные `hyperedge.member_source_files` и import-history conflict после записи. Новые negative tests воспроизвели оба дефекта; текущий remediation проходит targeted tests.

Run `#70` подтвердил исправления шестого аудита в clean clone: member-source provenance и import-history preflight tests прошли вместе с generation/reproducibility и полным `npm test`.

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
- semantic graph provenance validation for every node/link/hyperedge: required matching source paths, safe canonical path, logical EOF and exact approved embedding document set;
- semantic relations cannot touch structural-only node IDs;
- native-preserving repeat legacy import;
- complete collision validation before the first legacy-import write;
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

- следующий independent code critic audit;
- owner disposition of the byte-only critic-rule conflict;
- repeat audit after any `CHANGES REQUIRED` or `REJECT` result.

Decision: `run_70_green_round6_remediation_pending_critic`.
