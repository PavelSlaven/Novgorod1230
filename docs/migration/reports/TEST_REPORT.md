# Test report — 0.23.0-migration.23

Дата: 2026-07-13
Ветка: `agent/restore-canonical-docs-generated-ci`
Проверенный commit: `1169090878d28a3e661a25ba67532570096d1a8f`
GitHub Actions run: `#53` (`29266053035`)

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

## Verified contracts

- executable `world_base` entrypoint and eight ordered SQL parts;
- 62 unique `world_base` tables and read-only schema permissions;
- canonical corpus file bytes and SHA-256;
- corpus ownership delegation from `CANONICAL_PATHS.json` to `corpus-manifest.json`;
- approved semantic graph/RAG snapshot preservation;
- deterministic structural graph coverage for native documents;
- deterministic lexical-only RAG coverage where approved embeddings are absent;
- separate provenance, semantic-index and lexical-index digests;
- production startup rejection of missing or stale generated knowledge artifacts;
- CI workflow contract preventing false-green truncated workflows.

## Coverage state

- Corpus documents: 22.
- Legacy documents with provenance: 19.
- Native project documents: 3.
- Semantic documents: 19.
- Structural-only graph documents: 3.
- Lexical-only RAG documents: 3.
- Approved semantic chunks: 813.

## Remaining release gates

- byte-for-byte import and registration of the remaining normative documents;
- regeneration after the final corpus expansion;
- migration report and PR description synchronization;
- mandatory independent code critic audit;
- repeat audit after any `CHANGES REQUIRED` or `REJECT` result.

Decision: `automation_green_migration_incomplete_critic_pending`.
