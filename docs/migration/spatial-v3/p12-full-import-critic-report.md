# P12 full target-import critic report

**Verdict:** `PASS WITH NOTES`

**Reviewed subject:** working tree rooted at committed ancestor
`5b224a9d01c7fbd957b5a7c7c24b8f9a03b07c29`, including the uncommitted P12
full-import repair. This is an independent review only; it does not apply data,
change a production composition, or authorize P28.

## Scope

The review covers the repaired P12-S import path:

```text
immutable V1.1 historical intake
  -> approved Novgorod source
  -> complete dependency-closure bundle
  -> compiled V1.1 physical projection
  -> one world_base transaction
```

It also checks that the default incomplete manifest remains a typed-gap result,
that an invalid V1.1 package stops all downstream work, that the evidence chain
retains its exact ancestry/scope/digest rules, and that route topology is
validated beyond row counts.

## Findings

### Default gaps are not re-labelled as closure — PASS

`p12-authoring-importer.mjs` still defaults to
`data/world-catalogs/novgorod/spatial-v3/manifest.json`. Its four blocking
typed gaps remain observable there. `buildTransactionalImportSql()` rejects
them unless its explicitly dry-run-only caller supplies `allowTypedGaps`.

The target entrypoint never uses that default. It pins
`target-materialization-approval/dependency-closure/v1/import-manifest.json`,
requires `closure.ok`, no errors and no data gaps, and the reviewed closure
manifest has an empty `data_gaps` array. Thus the new completed closure is not
a semantic fallback or a disguised reuse of the incomplete default bundle.

### Ordered gate and single transaction — PASS

`buildP12TargetImportPlan()` validates, in order:

1. immutable V1.1 intake/evidence;
2. approved source package;
3. complete dependency-closure manifest; and
4. physical contract coverage and compiler.

Only after all four gates are positive does it build SQL. Both the closure and
the physical compiler are requested with `wrapTransaction: false`; the entrypoint
alone adds one `BEGIN` and one `COMMIT`/`ROLLBACK`. The positive test checks the
single-wrapper dry run and the CLI produced a plan with `target_import_authorized:
true`, `materialization_authorized: false`, and `p28_activation:
not_authorized`.

The negative V1.1 test injects a failed approval gate and throwing downstream
collaborators; it rejects at the V1.1 stage, proving no source, closure,
projection, or SQL construction follows an invalid package.

### Immutable evidence chain — PASS

The V1.1 validator reads the historical binding at its fixed evidence commit,
pins the binding blob and historical subject commit, requires the evidence
commit to have that subject as its sole parent, validates the exact changed-file
allowlist, and hashes every declared subject-tree file. The new closure binding
is separately accepted only when its unique introducing commit is an ancestor
of HEAD, has the declared subject as sole parent, has the constrained change
scope, and preserves the manifest-derived path coverage and file digests.

Targeted tests reject missing evidence, altered subject files, broad scope,
non-ancestor evidence, duplicate/unsafe/incomplete declarations and unapproved
closure status. The current V1.1 CLI returns `ok: true` while keeping
`materialization_authorized: false` and `p28_activation: not_authorized`.

### Physical projection and route topology — PASS

The physical compiler maps every non-staging row family in the immutable DDL
matrix to a reviewed compiler and a real `world_base` table. The coverage audit
reports no hard gaps: 227 canonical nodes, 86 routes, 172 points, 86 segments,
86 segment contexts, 172 endpoint bindings, and 3,249 authoring dependency
edges among the compiled rows.

The closure importer now rejects orphan route points/segments/endpoints/contexts,
non-contiguous point or segment ordinals, segment-to-adjacent-point mismatch,
wrong endpoint point, missing/extra endpoint roles, wrong arrival/departure slot,
bad exit binding, and endpoint slots unbound from a canonical G5 connection or
G4 entry binding. This is a genuine topology check rather than count-only
acceptance.

## Checks actually run

| Command | Result |
| --- | --- |
| `node --test test/spatial-v3/p12-target-materialization-approval-v1_1.test.js test/spatial-v3/p12-target-import.test.js test/spatial-v3/p12-target-import-postgres.test.js` | 7 passed, 1 PostgreSQL test skipped |
| `node tools/spatial-v3/p12-target-materialization-approval-v1_1.mjs` | PASS; authorization remains non-production |
| `node tools/spatial-v3/p12-source-approval.mjs` | PASS; activation `not_authorized` |
| `node tools/spatial-v3/p12-authoring-importer.mjs --bundle .../dependency-closure/v1/import-manifest.json` | PASS; no errors or data gaps |
| `node tools/spatial-v3/p12-v1_1-physical-projection.mjs` | PASS; no physical coverage gap |
| `node tools/spatial-v3/p12-target-import.mjs --rollback` | PASS; one target import plan, P28 still `not_authorized` |

Repository Intelligence knowledge query completed with the expected degraded
knowledge-source warning. The local Graphify executable could not canonicalize
its script path in this synchronized checkout, so its result is not used as
architecture evidence.

## Notes

The isolated PostgreSQL test did not run because Docker is unavailable locally;
it was reported as **skipped**, not as passing. No operator or production database
was contacted. The static and plan-level single-transaction evidence is positive,
but the disposable PostgreSQL apply should be rerun when Docker is available.

## Decision

P12 full-import repair is accepted as `PASS WITH NOTES` for the stated P12-S
requirements. It establishes an approved offline authoring-import plan only.
It does not activate target runtime semantics, introduce dual write/fallback, or
authorize P28.
