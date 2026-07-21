# P23 cross-domain integration — independent critic report

**Verdict:** `PASS WITH NOTES`

**Reviewed workspace:** branch `codex/spatial-architecture-g0-g6-v4-2`, committed ancestor `5b224a9d01c7fbd957b5a7c7c24b8f9a03b07c29` plus the uncommitted P16/P23 sole-writer repair.

**Date:** 2026-07-21

## Scope and authority

This is the independent P23-S04 review required by the implementation plan:
NPC placement and schedules; items, containers and property; transport and attached
G6; cross-domain causal basis; and the P16 persistence boundary.  The review also
checks the relevant P21 target/shadow path.  It does not authorize P28, production
activation, a database migration, or any semantic fallback.

Authority: P23-S01–S04 and Gate G-RUNTIME in
`NEW PLAN/PLAN_IMPLEMENTATION_SPATIAL_ARCHITECTURE_G0_G6_V4_2.md`, the sealed
`combined_write_plan` boundary, and the code-driven materialization rule that a
module may not infer absent facts.

Repository-navigation query attempted:

```text
P23 cross-domain integration P16 combined atomic committer approval target contract P21
```

The installed Graphify CLI could not canonicalize its script path in this
synchronized checkout, so this review used the corresponding targeted source and
test inspection. This is a navigation-tool limitation, not evidence about runtime
behaviour.

## Evidence and findings

### P23-CRIT-01 — authoritative placement and no semantic inference — PASS

`createSpatialV3DomainPlacementIntegrator()` accepts only the closed set of
placement entity kinds, requires one placement per entity, requires every nested
placement to resolve through an acyclic host chain to an active persisted scene
position, and rejects absent hosts, cycles and duplicate ownership.  It does not
derive topology from ordering, labels or a latest catalog revision.

The relative-position path is separate from placement and admits only a closed
relation vocabulary with an exact approved condition/profile reference.  Thus
movable cover cannot become a second location owner.

`spatial-v3:test-p23` covers duplicate placements, cycles, unknown endpoints,
property-style control/capacity validation and metamorphic label/order cases.

### P23-CRIT-02 — NPC schedules, ownership, access and capacity — PASS

The persisted-snapshot validation requires each active NPC schedule to match its
current placement's exact scene-position endpoint, an explicit versioned schedule
profile, dependency pins and a causal state reference. It rejects anchor-only or
rematerialized locations.

For all controlled entities, the same validation requires explicit owner, holder,
controller and access profile; checks host and scene-position capacity; and rejects
an access-profile mismatch. No ownership, holder, controller, access or capacity
value is inferred across module boundaries.

### P23-CRIT-03 — transport and attached scenes — PASS

Carrier validation requires an explicit transport root, approved attached-G6
template reference, persisted attachment chain and carrier-derived context. It
rejects a simultaneous own journey location, an invalid chain, a mismatched
attached template, and a local action not started from the exact persisted interior
position. A moving carrier-local action also requires the exact shared root slice,
execution/travel-state versions and change-set/write-plan pins. Attached G6 IDs are
read from persisted rows and are not re-materialized.

### P23-CRIT-04 — one target-v3 writer and sealed target contract — PASS

`spatial-v3-p23-domain-repository.js` is now read/recheck-only. Static inspection
finds no target-v3 DML, no `pool.connect()` and no `BEGIN`/`COMMIT`/`ROLLBACK` in
that adapter. Its snapshot is reloaded through the P16 transaction immediately
before writes.

P23 creates a sealed `spatial_v3.combined_write_plan.v2`; an injected approval
verifier must accept the plan input before P16 receives it. `buildCombinedWritePlan`
requires all eight commit rechecks, exact expected versions, disjoint allowed write
sets, idempotency and a matching append-only change set. The sole DML source found
for P23 target tables (`entity_placements`, `party_v3_change_sets`,
`party_command_idempotency`, route execution and carrier attachment tables) is
`spatial-v3-combined-atomic-committer.js`.

P16 validates the sealed digest and table allowlist, takes global-order advisory
locks, reloads/rechecks in its transaction, uses version CAS, and settles
idempotency with the change set atomically. This closes the former second-writer
path without creating a hidden database side effect in P23.

### P23-CRIT-05 — P21 composition boundary — PASS

The targeted P21 tests establish that target composition remains
`target_shadow_only`, reports `not_authorized` activation, has no v2 fallback, and
passes an approved P16 sealed plan through the sole committer. Therefore P23's
cross-domain path does not imply P28 activation.

## Checks actually run

| Command | Result |
|---|---|
| `node --test test/spatial-v3/p16-persistence.test.js test/spatial-v3/p23-domain-integration.test.js test/spatial-v3/p23-domain-postgres.test.js test/spatial-v3/p21-orchestration.test.js` | 25 semantic/static tests passed; 1 PostgreSQL test skipped because Docker is unavailable |
| `node tools/spatial-v3/check-p23.mjs` | PASS |
| `npm run spatial-v3:check-p16` | PASS |
| `npm run spatial-v3:check-p23` | PASS |
| `npm run architecture:check` | PASS |
| targeted target-v3 DML search | PASS: only `spatial-v3-combined-atomic-committer.js` writes the P23 target-table set |

Docker confirmation failed locally: the Docker config and daemon named pipe are
access-denied. Consequently `test/spatial-v3/p23-domain-postgres.test.js` could
not independently exercise the disposable PostgreSQL path in this audit. It
reported as skipped, not passed; no operator or production database was contacted.

## Decision

P23-S04 is accepted as `PASS WITH NOTES`: all available target-contract,
cross-domain, P16 sole-writer, approval-gate and P21 shadow-boundary evidence is
positive. The only remaining note is to rerun the isolated P23 PostgreSQL test once
the local Docker daemon is accessible. This verdict neither completes P27 nor
authorizes P28.
