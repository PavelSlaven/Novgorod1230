# P24 migration independent critic report

## Verdict

**PASS**

This supersedes the earlier `CHANGES REQUIRED` verdict. The previous blocker
was a test-control-flow defect: a Docker-unavailable branch marked the test
skipped but continued into `docker run`. The current tests return immediately
after `t.skip`, and both isolated PostgreSQL witnesses ran live and passed on
the audited commit `27f901cb640b97d6ea34eedb11937879ee528a4e`.

The evidence now covers the finite v2 relation inventories, party-scoped
source extraction, one reviewed disposition per source row, typed hard gaps,
digest-pinned source snapshots, append-only coverage artifacts, exact reviewed
target rows, atomic apply, dry-run non-write behaviour, readback, and rollback
after a multi-row target write failure.

## Scope inspected

- `tools/spatial-v3/p24-migration.mjs`
- `tools/spatial-v3/check-p24.mjs`
- `schemas/party-db/006_party_runtime_v3_migration.sql`
- `infra/world-base/schema/17.sql`
- `test/spatial-v3/p24-migration.test.js`
- `test/spatial-v3/p24-migration-postgres.test.js`
- `test/spatial-v3/p24-world-migration-postgres.test.js`

No P28 activation path was modified or invoked by this audit.

## Witnesses

- Party PostgreSQL witness enumerates an actual v2
  `party_runtime.party_positions` row, proves dry-run produces no target rows,
  applies the reviewed mapping, persists the coverage artifact, and proves a
  later duplicate-key failure rolls the whole transaction back.
- World PostgreSQL witness enumerates actual legacy `world_revisions`,
  `regions`, `graph_nodes`, and `graph_edges`; it applies the canonical
  G0–G5/grid/route/template chain, reads it back, persists source coverage,
  and proves the intentional later duplicate-key failure rolls every prior
  target write back.

## Checks actually run

```text
npm run repo-intel:build                         PASS (graph commit 27f901c)
npm run repo-intel:status                        PASS; knowledge-source degraded warning only
npm run spatial-v3:check-p24                    PASS
npm run spatial-v3:test-p24                     PASS (7/7)
npm run spatial-v3:test-p24-postgres            PASS (1/1, live PostgreSQL)
npm run spatial-v3:test-p24-world-postgres      PASS (1/1, live PostgreSQL)
```

## Notes

`knowledge-source` remains `degraded` because of documented semantic coverage
gaps. Repository Intelligence and Graphify were rebuilt successfully at the
audited HEAD; that warning does not alter this P24 verdict.
