# P27 candidate `2ec109c` — exact acceptance evidence

## Subject binding

```text
repository: PavelSlaven/Novgorod1230
branch: codex/temporal-world-v4
candidate_commit: 2ec109c99c5e2b33f43dc5f89735e6e72686299b
candidate_parent: 5d3c3e6a9d9408ef2472250bb1653542646f8bb5
base_commit: 520c0ea8cc366fc16c949a874c710f3547a322f6
pull_request: 19
```

This record is non-authoritative evidence for exactly the candidate above. It
does not authorize a production import, database write, composition change or
activation. P28 authority remains the live exact-head GitHub proof configured
in `release-evidence.v1.json`.

## Exact clean-clone acceptance

The candidate was checked out detached into
`C:\tmp\Novgorod-temporal-clean-2ec109c` from a `--no-local` clone. The run
completed successfully in 125.9 seconds:

- `npm ci`: 91 packages, 0 vulnerabilities;
- world staging/import: 42,577 rows across 30 tables, 0 errors, 0 warnings;
- staged FK audit: 42,577 rows, 0 errors, 0 warnings;
- PostgreSQL 16 schema: 18 ordered SQL parts, 190 `world_base` tables;
- `world_reader`: 190 SELECT grants, schema USAGE, no CREATE/write grants;
- Stage 3B-1 PostgreSQL integration: passed;
- knowledge corpus, generated documentation and reproducibility: passed;
- Graphify/Repository Intelligence build, status and tests: passed;
- full root `npm test` with real Chrome: passed;
- architecture boundary check: passed.

The PostgreSQL container was isolated on host port `55433` and removed by the
runner. No operator or production database was opened.

## Full candidate validation

- Full Spatial/Temporal suite: 280 passed, 0 failed, one explicit Windows
  symlink-capability skip. The skipped capability is covered by committed-path
  validation and was not counted as a pass.
- Root wrapper with real Chromium: all modules, domain, apps, tools, shadow,
  cutover, documentation, integration, browser and architecture stages passed.
- Temporal approved-data PostgreSQL acceptance: atomic rollback/commit,
  idempotent replay, immutable rows, read-only role and corruption rejection
  passed.
- P12 target/import/closure suites, P02/P05, runtime catalog forward migration,
  schema/reference and P28 static tests passed.
- Repository Intelligence and Graphify `0.9.17` are bound to the exact
  candidate. The documented knowledge-source semantic-coverage baseline remains
  a non-blocking warning with no readiness errors.

## Independent review

The independent final critic audited this exact candidate and returned
`VERDICT: PASS`, with no content findings. The complete report is
`docs/migration/spatial-v3/p27-final-critic-report.md`.

## Boundary

The clean-clone and critic evidence establish candidate readiness only. This
direct evidence child still has to pass its evidence-only CI and live GitHub
completion proof. The gate remains non-mutating:

```text
production_writes: 0
composition_changed: false
```
