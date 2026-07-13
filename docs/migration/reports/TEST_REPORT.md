# Test report — 0.23.0-migration.23

Дата: 2026-07-13
Ветка: `agent/restore-canonical-docs-generated-ci`
Последний проверенный implementation commit: `cfb98442aeda85495da42af7071af05fe18d6dac`
GitHub Actions run: `#74` (`29282256574`), job `86926064785`

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

Run `#74` выполнил schema-reference и PostgreSQL gates в чистом checkout. PostgreSQL service принял весь DDL; подтверждены 62 таблицы, одна не-привилегированная роль `world_reader`, `USAGE` без `CREATE`, 62 `SELECT` grants и 0 write grants.

Run `#68` подтвердил remediation пятого аудита: provenance checks для nodes/links/hyperedges, exact graph/RAG semantic-set boundary, structural endpoint guard и collision-before-write. В clean clone прошли generation/reproducibility и полный `npm test`; локальный обязательный цикл также прошёл полностью.

Evidence-only commit `afed3740e6fecb5de57d9aa961cdb77abcabf75a` прошёл run `#69` (`29278114051`), job `86912220316`, со всеми теми же gates. Шестой critic audit выявил непроверенные `hyperedge.member_source_files` и import-history conflict после записи. Новые negative tests воспроизвели оба дефекта; текущий remediation проходит targeted tests.

Run `#70` подтвердил исправления шестого аудита в clean clone: member-source provenance и import-history preflight tests прошли вместе с generation/reproducibility и полным `npm test`.

Evidence-only commit `a0821be3ddf9663c49b80b0a7bcb1010b7d0e3aa` прошёл run `#71` (`29279761828`), job `86917792948`; каждый обязательный workflow step завершился `success`. Седьмой critic audit выявил stale mutable counts/evidence в корневых migration summaries и отсутствие автоматического malformed-history regression. Новый integration contract сначала воспроизвёл stale summaries, после делегирования manifests/reports прошёл; malformed-history test подтверждает отсутствие изменений manifest, aliases, inventory и всех corpus targets.

Локальный remediation-цикл седьмого аудита завершён: schema, schema-reference, corpus, graph/RAG, knowledge-source (19/19), docs (6/6), integration (11/11) и полный `npm test` прошли. В полном наборе: modules 218, domain 35, apps 11, tools 76, shadow 6, cutover 4 и integration 11; architecture PASS. Browser E2E корректно отмечен skipped из-за отсутствующего локального Chromium.

Run `#72` подтвердил remediation седьмого аудита в clean clone: migration-summary contract, malformed-history fail-before-write regression, generation/reproducibility и полный `npm test` прошли.

Evidence-only commit `97d7c29aa53582d5f00c1f07a2920497708eb559` прошёл run `#73` (`29281176623`), job `86922469253`; все обязательные workflow steps завершились `success`. Восьмой critic audit выявил отдельный stale corpus migration report, не охваченный первым summary contract. Расширенный contract сначала воспроизвёл старые totals/verdict, затем прошёл после делегирования canonical manifests и evidence reports.

Локальный remediation-цикл восьмого аудита завершён: schema, schema-reference, corpus, graph/RAG, knowledge-source (19/19), docs (6/6), integration (11/11) и полный `npm test` прошли; architecture PASS. Browser E2E корректно отмечен skipped из-за отсутствующего локального Chromium.

Run `#74` подтвердил remediation восьмого аудита в clean clone: расширенный knowledge-source summary contract, generation/reproducibility и полный `npm test` прошли.

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
- root migration summaries delegate mutable counts to canonical manifests and evidence reports;
- malformed import history is rejected before any canonical write, with byte-preservation regression coverage.
- every knowledge-source migration summary rejects stale historic test totals and delegates current evidence.

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

Decision: `run_74_green_round8_remediation_pending_critic`.
