# P16 persistence — independent critic report

**Verdict:** `PASS`

**Reviewed HEAD:** `5b224a9d01c7fbd957b5a7c7c24b8f9a03b07c29`

**Date:** 2026-07-21

**Branch:** `codex/spatial-architecture-g0-g6-v4-2`

## Scope and authority

Scope is P16-S01–P16-S05 plus P14 execution/history-ledger integration.

No runtime code, DDL, production composition, operator database or P28 state changed.

Authority: P16 plan, target-standard Appendix B `combined_write_plan`,
materialization architecture sections 4.3/11/12, table-requirements normative,
and code-critic invocation rule.

Independent queries:

```text
P16 persistence transaction repository contracts P14 ledger integration
```

Repository Intelligence rebuilt the graph at this HEAD using Graphify `0.9.17`.

It was ready; only the known `KNOWLEDGE_SOURCE_DEGRADED` coverage warning remained.

## Passing evidence

- World-base reader uses exact version/revision/digest pins and a read-only port.
- Party repository exposes typed loads and fail-closed persistence.
- Builder seals approved party-owned writes with expected state versions.
- P16 committer validates the seal, locks in global phase order, rechecks,
  applies its allowlist, and settles idempotency atomically.
- P14 deferred bidirectional execution/event ledger remains physically enforced.

## Finding

### P16-CRIT-01 — MAJOR — P23 bypassed the sole atomic committer

**Status: remediated and independently re-reviewed (`PASS`).**

`apps/game-server/src/infrastructure/postgres/spatial-v3-p23-domain-repository.js`
is executable target-v3 PostgreSQL adapter code and has an isolated integration test.

It directly owns a transaction and writes party-runtime state:

- `acquireIdempotency()` inserts `party_command_idempotency`.
- `applyAtomically()` updates `entity_placements` and inserts `party_v3_change_sets`.
- `completeIdempotency()` updates `party_command_idempotency`.

This is a second v3 writer besides P16 `createSpatialV3CombinedAtomicCommitter()`.

It bypasses sealed `combined_write_plan`, P16 allowlist/identity validation,
the single lock-order implementation, its complete recheck set, and canonical
change-set persistence. `target-only` does not remove this conflict because the
adapter is executable and tested against PostgreSQL.

It contradicts P16-S04 and the target-standard rule:

```text
Only CombinedAtomicCommitter may apply the plan.
```

## Implemented correction (2026-07-21)

1. P23 now builds an immutable `spatial_v3.combined_write_plan.v2`; its one
   `entity_placements` update and `party_v3_change_sets` append are applied only
   by `createSpatialV3CombinedAtomicCommitter()`.
2. `spatial-v3-p23-domain-repository.js` is read/recheck-only: it contains no
   target-v3 DML, connection or transaction control. P16's PostgreSQL
   committer factory retains transaction, lock ordering, idempotency
   lease/settlement and change-set persistence.
3. The P16 write-plan/committer allowlist now models the composite
   `entity_placements` identity. P23 supplies its domain snapshot only as an
   explicit commit recheck, so replay occurs before stale CAS revalidation.
4. P23 now fails closed unless an approval verifier is injected, and rejects
   a verifier denial before a committer receives a plan. Added negative
   one-writer/transaction/approval tests and reran isolated PostgreSQL P23
   replay, rollback, carrier-local root locking and inverse-order concurrency
   evidence through the P16 committer path.

Independent re-review confirmed this correction as `PASS`. No P28 state or
production-owner boundary changed.

## Checks actually run

| Command | Result |
|---|---|
| `spatial-v3:check-p16` | PASS |
| `spatial-v3:test-p16` | PASS 5/5 |
| `spatial-v3:test-p16-postgres` | PASS 1/1 |
| `spatial-v3:test-p16-committer-postgres` | PASS 1/1 |
| `spatial-v3:check-p14` and `test-p14-postgres` | PASS; 1/1 |
| `spatial-v3:check-p15` and `test-p15-postgres` | PASS; 1/1 |
| `spatial-v3:test-p09-postgres` and `test-p13-postgres` | PASS; 1/1 each |
| `architecture:check` | PASS |
| `world-db:schema-doc-check` | PASS; 185 tables; digest `36633dc334cd22ea9ed85583427c40d31c1fa36b4df278ccc0d248b58b0a188b` |
| `spatial-v3:test-p23` | PASS 8/8; sealed-plan handoff and recheck witness |
| `spatial-v3:test-p23-postgres` | PASS 1/1; replay, rollback and concurrency via P16 committer |
| target-v3 party-write source audit | PASS: P23 adapter has no direct target-v3 DML |

All PostgreSQL checks used disposable local Docker containers.

No operator or production database was contacted.

## Decision

The original `CHANGES REQUIRED` finding is fixed. The independent re-review
returned `PASS`; P16-S05 is accepted for this remediation scope.
