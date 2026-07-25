# ADR-005: Temporal environment owner

- Status: accepted
- Date: 2026-07-23
- Decision scope: production architecture. Historical P28 acceptance did not
  activate production; the later `versioned production activation cutover`
  release `spatial-v3-production-v1` did.

## Decision

Create the minimal pure `@rus/environment-state` owner for weather and light effects. `@rus/time-events-history` continues to own exact clock arithmetic and due-time requests; this owner derives environment state and effects from that supplied time result. New Game Stage 17 remains a start-time gate, not the temporal environment runtime owner.

Public input is frozen `{ clock, weather_state, light_profile, place_access_context, catalog_pins }`. Public output is frozen `{ status, environment_state, effects, trace }` or a typed gap. Allowed dependencies are `@rus/kernel`, `@rus/time-events-history` and versioned contracts. The package must not access a database, network, LLM, narration, UI, global clock or random source.

Weather/light profiles and regional applicability remain read-only `world_base` data. A missing required profile, incompatible pin or empty candidate set is a typed gap; no default weather, light level or access override is allowed. `@rus/turn` is the only workflow consumer and persistence occurs only through the target `CombinedAtomicCommitter`.

## Rollback

Before the completed `versioned production activation cutover`, environment
proposals were shadow/fixture-only. They are now consumed only through the v3
combined write plan. Rollback discards an uncommitted proposal and follows the
declared reverse migration or a validated checkpoint; it never silently
recomputes old party facts from changed authoring data.
