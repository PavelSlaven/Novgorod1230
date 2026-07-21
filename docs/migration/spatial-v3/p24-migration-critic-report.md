# P24 migration independent critic report

## Verdict

**CHANGES REQUIRED**

The static P24 contract and Node unit suite pass, and the implementation now
contains the required finite v2 relation inventories, party-scoped extraction,
one-disposition-per-source enforcement, typed hard gaps, digest-pinned source
snapshots, and append-only coverage artifacts.  This is not yet accepted: both
claimed PostgreSQL integration tests fail in this environment rather than skip
cleanly when Docker is unavailable, so the required live evidence for the real
v2 fixtures, atomic persistence, and rollback is not established.

## Scope inspected

- `tools/spatial-v3/p24-migration.mjs`
- `tools/spatial-v3/check-p24.mjs`
- `schemas/party-db/006_party_runtime_v3_migration.sql`
- `infra/world-base/schema/17.sql`
- `test/spatial-v3/p24-migration.test.js`
- `test/spatial-v3/p24-migration-postgres.test.js`
- `test/spatial-v3/p24-world-migration-postgres.test.js`

No P28 activation path was modified or invoked by this audit.

## Findings

### CRIT-01 — PostgreSQL tests do not stop after `t.skip`

Both integration tests call `t.skip('Docker required')` and then immediately
execute `docker run` with an assertion that requires exit code zero. When Docker
is unavailable, the test is reported as skipped but also fails at the next line:

- `test/spatial-v3/p24-migration-postgres.test.js:11-12`
- `test/spatial-v3/p24-world-migration-postgres.test.js:62-63`

Observed command:

```text
node --test test/spatial-v3/p24-migration-postgres.test.js test/spatial-v3/p24-world-migration-postgres.test.js
exit 1; pass 0; skipped 2; failing assertions 1 !== 0
```

Repair the guard with an immediate `return` after `t.skip`, or use the test
runner's conditional skip option. Then rerun both isolated PostgreSQL tests with
Docker available. Their evidence must cover the real legacy relation fixtures,
per-party isolation, target rollback, and persisted coverage artifacts.

## Checks actually run

```text
npm run spatial-v3:check-p24                       PASS
node --test test/spatial-v3/p24-migration.test.js  PASS (7/7)
node --test ...p24-migration-postgres... ...world...  FAIL as above
```

Repository-intelligence graph status was unavailable because its script-path
canonicalization failed; normative RAG query completed with the documented
`knowledge_source: degraded` warning. This does not alter the concrete test
failure above.
