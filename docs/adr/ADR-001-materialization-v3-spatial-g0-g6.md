# ADR-001: Materialization v3 spatial G0–G6

- Status: proposed
- Date: 2026-07-18
- Decision scope: target architecture; accepted historical P28 evidence did not
  activate production, which remains v2 until a separate versioned production
  activation cutover.

## Decision

Adopt the target v3 transition defined by `spatial_architecture_standard_g0_g6.md` §0, §3, §13, §15 and §16. Cutover is atomic: `world_base` owns canonical G0–G5, routes, profiles and templates; `party_runtime` owns party-generated G5, G6, positions, movement plans/executions, carriers, perception and append-only history.

Physical v2/v3 storage may coexist before cutover, but one request uses exactly one schema/runtime path. Dual write, in-turn fallback, mixed reads as authoritative state and partial activation are forbidden. Schema-version routing is explicit at composition boundaries; v3 is fixtures/shadow/migration-only until the final integration gate.

## Rollback

Rollback is allowed only before activation, from the last validated v2 checkpoint, and never by converting a partially committed v3 request into v2. After activation, v2 data is a read-only migration/rollback source; recovery requires the approved migration and operational plan.

## Production owners

`@rus/world-base` owns canonical authoring; `@rus/materialization` approved expansion; `@rus/space-map` scene topology; `@rus/movement-routes` route planning; `@rus/party-store` persistence; `@rus/turn` orchestration; `@rus/contracts` shared versioned contracts.

## P25 compatibility and deprecation record

Until the separate versioned production activation cutover, `production_v2`
is the sole production profile and owner. `shadow_v3` is the only v3 profile
permitted by P25: it receives a separate request identity, reads only its
explicitly supplied target/shadow observation, and has no target-state write
capability. Before every `createSpatialV3CompositionProfile` call, composition
supplies the immutable `request_profiles` input and
`bindSpatialV3RequestProfile` resolves the exact
`(party_id, request_id, profile)` owner. A missing, conflicting, or mismatched
binding fails closed; no process-global selection state exists. The adapter
rejects reader/writer schema mixing and any v3 write request.

The compatibility adapter expires at the versioned production activation
cutover, not at historical P28 evidence acceptance or on a calendar date. It
must not be retained as an in-turn fallback after that cutover. Before the
first v3-only mutation rollback returns to the validated v2 checkpoint; after
that mutation rollback needs a validated reverse migration or a snapshot
restore, never a reinterpretation of v3 state as v2.

The P25 test matrix is `test/spatial-v3/p25-compatibility-cutover.test.js`: one owner/no dual writer, mandatory explicit binding, deterministic structural shadow parity with an explicit divergence register whose every entry is consumed exactly once (stale and duplicate entries fail), failed-gate abort before a target handler, and an isolated PostgreSQL snapshot/restore drill.
