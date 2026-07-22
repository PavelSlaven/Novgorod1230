# P09 spatial core DDL — independent critic report

**Verdict:** `PASS WITH NOTES`
**Initial reviewed commit:** `b1939948003ca2775bc22a0cbf75e8f0c557fafd`
**Closure review:** 2026-07-21; current P09/P12 subject worktree
**Branch:** `codex/spatial-architecture-g0-g6-v4-2`
**Scope:** P09-S01–P09-S04 only; no P10+, runtime, production database or P28 activation.

## Authority and reviewed surface

The review used the P09 Definition of Done in
`NEW PLAN/PLAN_IMPLEMENTATION_SPATIAL_ARCHITECTURE_G0_G6_V4_2.md`, the target
spatial standard, the active code/LLM materialization boundary, the
world-base table requirements, the G0–G4 workflow, the Novgorod G1 catalog,
the read-only database/graph architecture, the generated schema reference and
the code-critic invocation rule.

The implementation review covered:

- `infra/world-base/schema.sql` and `infra/world-base/schema/12.sql`;
- `infra/world-base/field-descriptions.js` and generated
  `infra/world-base/SCHEMA_REFERENCE.md`;
- `tools/spatial-v3/check-p09.mjs`;
- `tools/spatial-v3/p09-graph-node-migration.mjs`;
- `test/spatial-v3/p09-postgres-ddl.test.js`;
- `test/spatial-v3/p09-graph-node-migration.test.js`;
- the P12 target dataset and generator references that consume the P09 G1
  convention.

Repository Intelligence and Graphify were queried independently for:

```text
P09 world base spatial core DDL schema migration tests critic evidence requirements
P09 PostgreSQL DDL graph_nodes graph_edges level constraints migration checks schema reference
```

The repository graph was rebuilt for the reviewed commit with Graphify
`0.9.17`. Repository Intelligence reported the graph ready and the already
documented knowledge-source semantic-coverage `degraded` warning only.

## Findings

### P09-CRIT-01 — MAJOR — canonical G1 convention is rejected by the DDL

The target standard defines the single world-revision convention as
`grid_east_north_v1`. Part 12 instead constrains
`spatial_v3_g1_grid_cells.grid_convention` to
`novgorod_g1_cardinal_grid_v1`. An isolated PostgreSQL probe proved that an
otherwise valid row using the normative identifier is rejected by the CHECK
constraint (`exit 3`).

This is not a display-label difference: `grid_convention_ref` is part of the
G1 semantic identity contract. The non-normative literal is also propagated
into the P12 generator/dataset and downstream tests, so changing only the
P09 test would leave the compiled target data inconsistent.

Required correction:

1. use the exact approved/version-pinned `grid_east_north_v1` identity (or a
   formal versioned registry row resolving that exact identity);
2. update all target-only fixtures/generators that consume this P09 field;
3. add a PostgreSQL positive case for the normative value and a negative case
   for an unknown convention;
4. regenerate and check the schema reference and affected deterministic
   artifacts.

### P09-CRIT-02 — MAJOR — multiple spatial classes are accepted

The target standard requires each spatial entity to have exactly one primary
spatial class; orthogonal properties are facets. Part 12 stores
`primary_class_id`, but `spatial_v3_node_classes` permits additional distinct
category rows for the same `(node_id, node_version)`. The deferred aggregate
validator only checks that the declared primary class is among those rows.

An isolated PostgreSQL probe committed a valid G1 aggregate with both
`class1` ordinal 0 and `class2` ordinal 1 (`exit 0`). Consequently the physical
schema permits the parallel-class state that the standard forbids.

Required correction:

1. enforce one normalized class row per node version, with equality to
   `primary_class_id`, or remove the redundant plural relation and preserve
   one authoritative class field;
2. keep independent properties in `spatial_v3_node_facets`;
3. add a negative PostgreSQL case proving that a second class cannot commit.

### P09-CRIT-03 — MAJOR — inventory summary digest is content-insensitive

`summarizeGraphNodeMigrationInventory()` hashes an array through:

```js
JSON.stringify(value, Object.keys(value).sort())
```

For an array, the replacer contains only array index keys, so properties of
the nested row objects are omitted. Two one-row inventories whose legacy IDs
and row digests differ therefore produce the same summary digest:

```text
a → e10808d43975dc400731053386849f864f297e6c4f7519c380f3dbaf7067a840
b → e10808d43975dc400731053386849f864f297e6c4f7519c380f3dbaf7067a840
```

This contradicts P09-S03's counts/digests evidence requirement and allows
content drift to retain the same inventory summary digest.

Required correction:

1. use the project's recursive canonical serializer/digest implementation, or
   an equivalent recursive key-ordering function;
2. add a negative regression proving that changing an ID, mapping pin, status
   or source content changes the summary digest;
3. retain deterministic equality for semantically identical input ordering.

### P09-CRIT-04 — NOTE — field descriptions are intentionally partial

The ten P09 tables have approved table descriptions and key P09 columns have
field descriptions, but many physical columns still render as
`Описание отсутствует.` in the generated reference. This is transparent and
does not make the generated reference stale, but P09-S04 should define whether
“field descriptions” means all P09 columns. Completing those descriptions is
recommended in the correction cycle.

## Checks actually run

All existing owner checks pass, but they do not cover the three MAJOR findings:

| Command | Result |
|---|---|
| `npm run spatial-v3:check-p09` | PASS; 10 P09 tables, 185 total |
| `npm run world-db:schema-check` | PASS; ordered parts 01–16, 185 tables, read-only grants |
| `npm run world-db:schema-doc-check` | PASS; digest `c06b4498a3706dcd78dff8c576b4540b05e02cbdf295f4bb6d39b36d5bb1a918` |
| `node --test test/spatial-v3/p09-graph-node-migration.test.js` | PASS 2/2 |
| `npm run spatial-v3:test-p09-postgres` | PASS 1/1; fresh apply, part-12 reapply and existing FK/UNIQUE/deferred negative cases |
| isolated PostgreSQL second-class probe | reproduced defect; invalid second class committed |
| isolated PostgreSQL normative-convention probe | reproduced defect; `grid_east_north_v1` rejected |
| direct inventory digest probe | reproduced defect; different one-row inventories yielded the same summary digest |

The PostgreSQL checks used disposable local `postgres:16-alpine` containers.
No operator or production database was addressed.

## Decision

P09-S04 does not meet its required `PASS`/acceptable `PASS WITH NOTES` gate.
P10 dependency acceptance must not rely on this report as a successful P09
handoff. A separate P09 implementation agent must correct the three MAJOR
findings, run the targeted and downstream target-only checks, regenerate
artifacts, and return the result to an independent critic for re-review.

This report does not activate v3, alter production composition or authorize
P28.

## Correction cycle — pending independent re-review

CRIT-01 is repaired by the canonical `grid_east_north_v1` constraint and
updated target-only P09/P10/P11/P24 fixtures. CRIT-02 is repaired by
`UNIQUE (node_id, node_version)` on normalized spatial classes; facets remain
separate. CRIT-03 is repaired by recursive canonical serialization and its
content/order regression test. Targeted P09 PostgreSQL, P09 inventory, P10
and P11 PostgreSQL checks passed after the correction. This addendum records
implementation evidence only; its verdict remains pending a new independent
critic review.

## Independent closure re-review — 2026-07-21

**Verdict: `PASS WITH NOTES`.**

CRIT-01 is closed: the exact approved `grid_east_north_v1` convention is
canonical, and the P09 upgrade path converts only the exact superseded
literal while unknown values fail closed without mutation. CRIT-02 is closed:
one normalized primary class is enforced per node/version and facets remain a
separate relation. CRIT-03 is closed: migration inventory digests are
recursive, content-sensitive and order-stable.

Independent evidence included isolated PostgreSQL fresh/reapply, captured
old-part-12 upgrade, unknown-grid and multiple-class collision rollback,
FK/UNIQUE and deferred containment negatives; P09 migration tests; generated
schema-reference check; and the affected target-only P10/P11 PostgreSQL
checks. The only note is intentionally compact negative coverage rather than
an exhaustive permutation matrix.

P12 integration was re-audited separately: its canonical-grid package is
correctly fail-closed pending its own independent reapproval and evidence-only
binding. This report neither approves P12 nor changes P28/production status.
