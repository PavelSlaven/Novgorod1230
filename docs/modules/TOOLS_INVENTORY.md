# Tools inventory

Tools are autonomous and are not imported by production runtime.

| Tool | Responsibility | Runtime side effects |
|---|---|---|
| `@rus/map-maker` | Import approved graph contracts, create separate layout sidecars and previews | No canonical DB writes |
| `@rus/db-tools` | Build and validate dry-run/approval packages | No SQL execution |
| `@rus/docs-tools` | Deterministic documentation generation, canonical-path validation, corpus delegation checks, graph/RAG materialization and migration verification | Writes generated documentation only through explicit CLI |
| `scripts/check-world-base-schema.mjs` | Validate the executable 62-table `world_base` DDL, ordered SQL parts and read-only permissions | Read-only source inspection |
| `tools/docs-tools/src/knowledge-corpus-verifier.js` | Validate corpus manifest, aliases, file existence, bytes and SHA-256 | Read-only corpus inspection |
| `tools/docs-tools/src/canonical-corpus-registry.js` | Enforce that `CANONICAL_PATHS.json` delegates corpus ownership to the single corpus manifest and does not duplicate corpus paths | Read-only registry inspection |
| `tools/docs-tools/src/knowledge-materializer-v2.js` | Preserve approved semantic graph/RAG snapshots and add deterministic structural/lexical coverage for native documents without fabricated embeddings | Writes only declared `generated/knowledge-source/*` outputs through the docs CLI |
| `@rus/audit-tools` | Safe release/audit tree manifests | Read-only source scan |
| `@rus/shadow-run` | Execute allowlisted old/new parity corpus and classify differences | Runs test processes and writes dated reports; no provider/DB/cutover |
| `@rus/cutover` | Execute versioned 13-step cutover with repeated gates and import proof | Writes cutover evidence only; no live environment mutation |
| `@rus/finalization` | Aggregate release evidence and separate automated completion from manual owner gates | Writes finalization evidence only; no secrets, deployment mutation or deletion |

## CI contract

`.github/workflows/test.yml` must execute, in order:

1. clean checkout;
2. Node.js setup;
3. lockfile registry normalization;
4. `npm ci`;
5. `world-db:schema-check`;
6. `knowledge:check-corpus`;
7. deterministic documentation and knowledge generation;
8. generated-file reproducibility check;
9. full `npm test`.

`test/integration/ci-workflow-contract.test.js` prevents a false-green workflow that omits mandatory gates.

`@rus/finalization` owns `rus.finalization_plan.v1` and `rus.finalization_report.v1`. Missing operator or critic evidence produces a hold, never implicit approval.
