# P18 planner critic report

**Verdict: PASS**

**Scope.** Independent re-audit of P18-S01–P18-S05 after the second repair,
against `PLAN_IMPLEMENTATION_SPATIAL_ARCHITECTURE_G0_G6_V4_2.md`, target
standard §9.3/§9.7 and the P08 public-interface registry. This report makes
no runtime, schema, activation or P28 decision.

## Evidence reviewed

- `packages/movement-routes/package.json`
- `packages/movement-routes/src/spatial-v3.js`
- `packages/movement-routes/src/spatial-v3-validation.js`
- `packages/movement-routes/src/spatial-v3-activation.js`
- `packages/movement-routes/src/spatial-v3-ports.js`
- `docs/migration/spatial-v3/p08-public-interface-registry.json`
- `test/spatial-v3/p18-movement-planning.test.js`
- `test/spatial-v3/p08-public-ports.test.js`
- `tools/spatial-v3/check-p18.mjs`

## Resolution of prior findings

### CRIT-P18-01 — PASS

The registered P08 entry `@rus/movement-routes/spatial-v3` now exports
`createTraversalResolver` and `createTraversalCommitValidator`, exactly as
recorded in the registry. With all mandatory collaborators, the former calls
`createMovementPlanner` and the latter wraps the real activation validator;
without them, each returns the P07 typed fail-closed result. The import-level
P18 test proves the registered resolver produces a real ready v3 option with
explicit ports and fails closed when unwired. An independent import of the
registered activation entry proved its `validate` method is live when wired.

### CRIT-P18-02 — PASS

`createMovementPlanner` now requires `loadTopology`, `snapshotEndpoint` and
`validateCapability` at construction. It calls the capability port before
topology is accepted into candidates and deterministically rejects each
`timed_traversal` whose selected movement method is absent from the sealed
context. The P18 negative test proves both missing-port rejection and a
selected-method mismatch.

### CRIT-P18-03 — PASS

`validCapabilityContext` requires a closed key set, canonical digest,
dependency-pin envelope, all listed capability fact/pin fields, and coverage
of every non-null capability fact by that envelope. `validateQuery` additionally
requires party-state pins to be covered by `expected_state_versions`. The exact
context is embedded in the sealed query and option; activation emits its digest
into the plan and rejects activation when planning-context pins do not cover
the capability pins. The P18 suite covers digest tampering, malformed/stale
pin rejection, and successful covered binding.

### CRIT-P18-04 — PASS

The planner has been separated into planner, validation, proposals, activation
and public-port modules. `spatial-v3.js` is 22,737 bytes, below the 25,600-byte
architecture limit. The actual repository architecture gate passes.

## Additional boundary checks

- Character-known paths resolve knowledge separately, filter hidden topology
  before endpoint snapshots, and reject factual/hidden leakage.
- Cost/risk summaries require canonical digests and valid ranges/precision;
  hidden risk is unknown and carries no visible tags.
- The P18 module imports only explicit collaborators and contracts. A scan of
  its v3 sources found no database, filesystem, network, v2, or process access
  (the sole text match is a comment stating that invariant).

## Checks run

| Command | Result |
| --- | --- |
| `npm run spatial-v3:check-p18` | PASS |
| `npm run spatial-v3:test-p18` | PASS, 22/22 |
| `node --test test/spatial-v3/p08-public-ports.test.js` | PASS, 8/8 |
| registered `createTraversalCommitValidator` import/wiring probe | PASS |
| `npm run architecture:check` | PASS |

P18-S05 and its registered P08 entry evidence are accepted. This acceptance
does not authorize P28 activation or any production write path.
