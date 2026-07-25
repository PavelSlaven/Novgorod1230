# ADR-002: Temporal World v4 exact time and boundary ownership

- Status: accepted
- Date: 2026-07-23
- Decision scope: production Temporal World v4. Accepted historical P28
  evidence did not activate production; the later cutover release
  `spatial-v3-production-v1` did.

## Decision

Adopt `temporal-world-v1` as the active target contract for exact game time and bump the Spatial v3 target contract set to `4.3.0-target.1`. This decision is based on the approved Temporal World v4 implementation plan (`d8464cbb91708379c3a4cf288b1842ee41676199fb8a0acaf51b79bcb0623016`) and specification (`f97e71536c08a3b5cc0414fe25460bf70b2d95ee94ff861f785b0a3d9fbfb26e`), recorded in `docs/work/temporal-world-v4/README.md`.

The separate `versioned production activation cutover` release
`spatial-v3-production-v1` makes v3 the sole production read/write profile.
Production v2 remains only the explicit migration/rollback source. No dual
write, mixed authoritative read, in-turn fallback, or temporal-only activation
is permitted.

`GameTimestamp` is an exact linear game-time value with
`whole_minutes`, `subminute_numerator` and `subminute_denominator`. Calendar
fields are a version-pinned projection from that timestamp and are never a
second authoritative clock. `RationalMinutes` is reduced and non-negative.
DTOs serialize every integral component as a canonical decimal string and
runtime arithmetic uses `BigInt`; JavaScript floating point and numeric JSON
literals are not authoritative representations. Persisted integral temporal
components use PostgreSQL integral `NUMERIC`, because the approved domain has
no finite `BIGINT` upper bound. `TIMESTAMPTZ` remains technical metadata only.

The temporal interval is `(from, to]`: effects due exactly at `to` are included, and effects at `from` are not replayed. Boundary processing is event-driven: advance to the earliest eligible boundary, process a deterministic same-time cascade, deduplicate effect identities, and fail closed on configured cycle/resource guards. A boundary may not be invented from a rounded duration.

Every committed time-bearing operation has exactly one clock owner. A direct party operation advances the party clock once; carrier-local results retain local exact elapsed time but a synchronized root transport result owns the single shared clock update. Existing P19 `createSpatialV3ExecutionEngine` remains the sole execution owner for timed activity, traversal interval and synchronized-slice accumulation. `@rus/time-events-history` remains the sole owner of exact rational arithmetic, calendar projection and temporal boundary ordering; movement, body, NPC, weather and other domains consume its explicit results and do not recalculate duration or clock state.

The atomic factual commit persists the state change, exact clock result, deterministic effects and a factual visible package together. Narration is invoked only after that commit and only from the persisted player-safe package; prose is never an authoritative temporal fact. Remote world processing is lazy/coarse: it advances only approved remote process state when an explicit trigger or catch-up boundary requires it, rather than continuously simulating all distant entities.

## Production owners and dependencies

`@rus/time-events-history` owns `GameTimestamp`/`RationalMinutes` arithmetic, calendar projection and boundary scheduling. `@rus/contracts/spatial-v3` owns versioned temporal DTOs and typed errors. `@rus/turn` owns P19 temporal execution and the atomic write-plan lifecycle. `@rus/movement-routes` supplies sealed traversal inputs but does not own clock arithmetic. `@rus/party-store` and the target PostgreSQL committer own persistence, idempotency and lock ordering. `@rus/visibility-knowledge-memory` owns code-based player-safe projection; `@rus/narration` owns only post-commit prose.

The active v2 `addMinutes`, rounded travel-duration helpers, and legacy delayed-event clock remain compatibility paths only. They are not dependencies of target Temporal World v4 execution.

## Rollback

Before the completed `versioned production activation cutover`, rollback meant
keeping `production_v2` as the sole production profile and discarding
target/shadow work. After cutover, recovery follows the declared rollback
release identity, migration and snapshot-restore procedure. It never uses dual
write, mixed authoritative reads, or reinterpretation of v4 temporal state
through legacy rounding rules.
