# ADR-001: Materialization v3 spatial G0–G6

- Status: proposed
- Date: 2026-07-18
- Decision scope: production architecture. Accepted historical P28 evidence did
  not activate production; the later versioned production activation cutover
  release `spatial-v3-production-v1` activated v3 as sole owner.

## Decision

Adopt the target v3 transition defined by `spatial_architecture_standard_g0_g6.md` §0, §3, §13, §15 and §16. Cutover is atomic: `world_base` owns canonical G0–G5, routes, profiles and templates; `party_runtime` owns party-generated G5, G6, positions, movement plans/executions, carriers, perception and append-only history.

Physical v2/v3 storage may coexist for migration/rollback, but one request uses
exactly the v3 schema/runtime path. Dual write, in-turn fallback, mixed reads as
authoritative state and partial activation are forbidden. Schema-version
routing is explicit at composition boundaries.

## Rollback

Rollback is allowed only before activation, from the last validated v2 checkpoint, and never by converting a partially committed v3 request into v2. After activation, v2 data is a read-only migration/rollback source; recovery requires the approved migration and operational plan.

## Production owners

`@rus/world-base` owns canonical authoring; `@rus/materialization` approved expansion; `@rus/space-map` scene topology; `@rus/movement-routes` route planning; `@rus/party-store` persistence; `@rus/turn` orchestration; `@rus/contracts` shared versioned contracts.

## P25 compatibility and deprecation record

Before the completed versioned production activation cutover, `production_v2`
was the sole production profile and owner. `shadow_v3` was the only v3 profile
permitted by P25: it received a separate request identity, read only its
explicitly supplied target/shadow observation, and had no target-state write
capability. Before every `createSpatialV3CompositionProfile` call, composition
supplies the immutable `request_profiles` input and
`bindSpatialV3RequestProfile` resolves the exact
`(party_id, request_id, profile)` owner. A missing, conflicting, or mismatched
binding fails closed; no process-global selection state exists. The adapter
rejects reader/writer schema mixing and any v3 write request.

The compatibility adapter expired at the versioned production activation
cutover, not at historical P28 evidence acceptance or on a calendar date. It is
not retained as an in-turn fallback. Rollback now requires the declared
`production-v2` migration/rollback source together with a validated reverse
migration or snapshot restore, never a reinterpretation of v3 state as v2.

The P25 test matrix is `test/spatial-v3/p25-compatibility-cutover.test.js`: one owner/no dual writer, mandatory explicit binding, deterministic structural shadow parity with an explicit divergence register whose every entry is consumed exactly once (stale and duplicate entries fail), failed-gate abort before a target handler, and an isolated PostgreSQL snapshot/restore drill.
