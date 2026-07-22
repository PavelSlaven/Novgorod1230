# P12 approved target projection — independent critic report

## Verdict

**PASS**.

The approved Novgorod source package is compiled deterministically into the exact P12 target contracts. The review found no invented source fact, permissive fallback, unresolved authoring gap, production write, or activation side effect. This verdict approves the P12 authoring projection only; `materialization_authorized` remains `false`, P28 remains `not_authorized`, and v2 remains the production owner.

## Reviewed closure

- The primary authoring manifest is `approved`, contains 37 SHA-256-pinned datasets, and has `data_gaps: []`.
- Source coverage is exact: 195 canonical G5 records; 358 approved physical source-pair identities and 716 reverse-consistent directions; 600 typed mappings decomposed as 47 retained hierarchy, 195 canonical G5 parent, and 358 physical mappings; 17 scene families with 195 profiles and 195 single candidates.
- Physical compilation is disjoint and exhaustive: 227 intra-G4 pairs, 32 host-entry pairs, 43 direct-route pairs, and 56 route-context pairs. The 43 direct-route pairs compile to 86 directional contexts, 86 exits, 86 routes, 172 route points, 86 segments, and 172 endpoint bindings.
- The complete target bundle contains 276 nodes, 275 parent relations, 358 approved source-pair registry rows, 454 canonical G5 connection bindings, 32 G4 entry bindings, 32 traversal profiles, 195 materialization profiles, 195 candidates, and 3,249 authoring dependency edges.
- Generation is reproducible from the immutable source, dependency-closure, and V1.1 target-approval packages; every emitted dataset is digest-bound by the primary manifest.

## MAJOR findings closed

1. **Traversal dependency type loss.** The first review found that the 32 `g4traversal__*` identities fell through `kindOf()` as `external_dependency`. The compiler now emits `g4_traversal_profile` in both `spatial_v3_authoring_versions` and `spatial_v3_authoring_dependency_edges`. Reserved compiled namespaces fail closed on an unknown identifier, with a negative regression test.
2. **Missing V1.1 approval gate.** The first review found that target ZIP drift followed by regeneration could still produce a nominally approved main manifest. Both `materialize-p12-approved-target.mjs` and default `validateAuthoringBundle()` now require `validateP12TargetMaterializationApprovalV11()` to pass while also requiring `materialization_authorized=false` and `p28_activation=not_authorized`. Digest drift is covered by corruption-negative tests.

The review also confirmed the repaired source-pair registry: all 358 approved source rows are preserved with SHA-256 of the complete source payload. The earlier 259-row partial registry is not accepted.

## Executed evidence

- `npm run spatial-v3:generate-p12-approved-target` — PASS; regenerated the 37 datasets and primary manifest.
- `npm run spatial-v3:test-p12` — PASS, 16/16 tests, including exact-set, multiplicity, reverse-direction, mapping decomposition, scene bijection, corruption, unknown-ID, and target-import regressions.
- `npm run spatial-v3:test-p12-target-materialization-v1_1` — PASS, 9 passed, 1 Windows symlink-capability skip, 0 failures.
- `npm run spatial-v3:check-p12-target-materialization-v1_1` — PASS; V1.1 package valid, `materialization_authorized=false`, P28 `not_authorized`.
- `node --test test/spatial-v3/p12-target-import-postgres.test.js` — PASS against an isolated PostgreSQL container. The test loads every ordered SQL part declared by `infra/world-base/schema.sql`, imports closure and projection atomically, and reads back 276 nodes, 358 approved physical source pairs, 86 routes, 86 segments, 172 endpoints, and 3,249 dependency edges.
- Scoped `git diff --check` for the P12 implementation and evidence files — PASS.

No operator or production database was opened. No P27 evidence, fresh-checkout attestation, release-authority decision, production composition, or P28 activation was created by this work.
