# P11 expansion and scene authoring DDL — independent critic report

**Verdict:** `PASS WITH NOTES`
**Reviewed commit:** `2983d7ef941acc161b7d327b063b15259c62ea49`
**Review date:** 2026-07-21
**Branch:** `codex/spatial-architecture-g0-g6-v4-2`
**Scope:** P11-S01–P11-S05 only. This review neither changes runtime/DDL nor
approves P12 data or P28 activation.

## Authority and surface

The review read P11 in `NEW PLAN/PLAN_IMPLEMENTATION_SPATIAL_ARCHITECTURE_G0_G6_V4_2.md`,
the target spatial standard, the active code/LLM materialization boundary,
world-base table requirements, G0–G4 workflow, Novgorod G1 catalog,
read-only database/graph architecture, generated schema reference and the
code-critic invocation rule.

Repository Intelligence and Graphify were independently queried for:

```text
P11 expansion scene DDL capacity contracts check-p11 tests
```

At the reviewed commit Repository Intelligence and Graphify were ready on
Graphify `0.9.17`. The documented knowledge-source semantic-coverage
`degraded` condition remained a warning only.

Reviewed implementation and consumers:

- `infra/world-base/schema/14.sql` and its `schema.sql` entrypoint;
- `tools/spatial-v3/check-p11.mjs` and `tools/spatial-v3/p11-capacity-proof.mjs`;
- `test/spatial-v3/p11-postgres-ddl.test.js` and
  `test/spatial-v3/p11-capacity-proof.test.js`;
- `infra/world-base/SCHEMA_REFERENCE.md`;
- P10 endpoint-slot dependency record and the P12 authoring importer/tests.

## Findings

### P11-CRIT-01 — finite expansion capacity: PASS

The deterministic max-flow proof consumes only explicit slots, template
limits and allowed relations. It rejects empty candidates as
`controlled_vocabulary_gap`, unbounded/unknown candidates as
`generated_schema_mismatch`, and insufficient aggregate capacity without
selecting a generated world instance. The rerouting case proves that feasible
capacity is not rejected merely because of input ordering.

The proof is a static authoring artifact, not a concurrent runtime allocator;
no shared mutable state or P11 runtime write path exists, so a separate
concurrency witness is not applicable to this P11 boundary.

### P11-CRIT-02 — exact endpoint and finite scene contracts: PASS

Part 14 supplies the normalized profile/candidate, G6, position and endpoint
relations. Deferred validation rejects empty approved candidate sets,
out-of-range endpoint ordinals, missing/ambiguous endpoint compatibility,
orphan/disconnected approved scenes and incompatible generation-template
profiles. No name/title/slug matching occurs in the P11 static surface.

### P11-CRIT-03 — topology and portal behaviour: PASS

The DDL keeps movement, visibility and acoustic relations authored separately
from layout. It requires reciprocal links where declared, explicit asymmetry
evidence where reciprocal visibility is absent, portal-scene identity and all
four portal states for each portal-bound relation kind. `default_clear` is
constrained to a non-null default visibility band, preventing a mixed implicit
visibility state.

### P11-CRIT-04 — integration with P09/P12: PASS

The current P11 isolated PostgreSQL rehearsal applies parts 01–14 from an
empty database after the P09 canonical-grid/class corrections, reapplies part
14 idempotently, and accepts the complete approved expansion/scene fixture.
The P12 authoring-importer contract suite also passes, including fail-closed
typed-gap, schema, digest and dangling-dependency cases. No P09/P12 change
regressed P11 contracts.

### P11-NOTE-01 — evidence is intentionally targeted

The isolated P11 witness is a target-only authoring DDL rehearsal, not a
production migration or runtime materialization test. That is the correct
phase boundary; P12/P24 own import/migration evidence and P28 alone may
consider activation. The positive/negative fixture is compact rather than an
exhaustive permutation matrix.

## Checks actually run

| Command | Result |
|---|---|
| `npm run spatial-v3:check-p11` | PASS; 20 P11 tables, 185 total world-base tables |
| `npm run spatial-v3:test-p11-capacity` (twice) | PASS; 4/4 each run |
| `npm run spatial-v3:test-p11-postgres` | PASS; 1/1 fresh apply, part-14 reapply, malformed/approved/deferred negative fixtures |
| `npm run world-db:schema-check` | PASS; ordered parts 01–16, 185 tables, read-only grants |
| `npm run world-db:schema-doc-check` | PASS; digest `36633dc334cd22ea9ed85583427c40d31c1fa36b4df278ccc0d248b58b0a188b` |
| `npm run spatial-v3:test-p12` | PASS; 5/5 P12 importer consumer regressions |

The PostgreSQL check used a disposable local `postgres:16-alpine` container.
It did not address operator or production databases. `git diff --check`
reports only pre-existing, user-owned CRLF whitespace in the modified
`AGENTS.md`; this report introduces no source/DDL defect.

## Decision

P11-S05 meets its required `PASS`/acceptable `PASS WITH NOTES` gate. All
remaining remarks are a `NOTE` about the intentionally scoped target-only
fixture. P11 is accepted as a predecessor for its already implemented P12
consumer work, but this report does not re-approve P12 data, alter production
composition or authorize P28.
