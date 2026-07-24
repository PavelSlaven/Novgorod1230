# Temporal advance pipeline (target-only v4)

`temporal-world-v1` / `4.3.0-target.1` is an active-norm target pipeline. Until the
single atomic P28 gate, active `production_v2` remains the sole production
read/write owner. This document permits target contracts, fixtures, migration,
tests and shadow composition only; it does not permit dual write, mixed
authoritative reads, in-turn v4-to-v2 fallback or a partial temporal cutover.

## Interval and boundary rule

An advance operates on the exact half-open interval `(from, to]`: an effect due
at `to` is included and one at `from` is not replayed. `GameTimestamp` and
elapsed values are exact rational values; calendar fields are a pinned
projection, not another clock. `@rus/time-events-history` owns arithmetic,
calendar projection, candidate ordering and the same-time cascade. It never
rounds a duration to invent a boundary.

For each slice, `@rus/turn` collects only explicit, pinned candidates and
advances to the earliest eligible boundary no later than `to`. It first applies
the continuous portion of the slice, then resolves every candidate at that
timestamp in the fixed resolution order. A resolution can add only explicit
same-time follow-ups; the cascade ends only at a deterministic fixed point.
Duplicate identities, conflicting definitions, causal cycles, stale candidates
and configured slice/candidate/iteration limits fail closed with typed errors.

## Target workflow

1. `@rus/turn` validates the immutable request, exact clock ownership,
   dependency pins, idempotency context and explicit finite limits.
2. `@rus/time-events-history` selects the earliest `(from,to]` boundary batch
   and resolves its deterministic same-time cascade.
3. Pure owners receive frozen snapshots plus approved, version-pinned data and
   return proposals only:
   - `@rus/body-state` — continuous body effects and threshold candidates;
   - `@rus/turn` with `@rus/party-store` — availability, placement, capacity,
     access and consequences (ADR-004 deliberately creates no place/access
     package);
   - `@rus/environment-state` — weather/light effects;
   - `@rus/time-events-history` — historical phases and due event effects;
   - `@rus/npc-runtime` — schedule and perception proposals;
   - temporal carrier handling — synchronized transport/local results with one
     root clock owner;
   - `@rus/world-processes` — approved remote catch-up and propagation
     proposals.
4. `@rus/turn` deterministically merges proposals. A duplicate write target,
   incompatible transition, double move/resource consumption, missing event
   dependency or conflicting clock owner is `temporal_change_set_conflict` or
   `time_owner_conflict`, never a best-effort choice.
5. `@rus/turn` creates the logical combined plan. `@rus/party-store` validates
   party persistence and submits it; `apps/game-server` executes the physical
   PostgreSQL transaction. The factual state, exact clock result, effects,
   time-slice results, idempotency record and player-safe
   `VisiblePackagePersistenceEnvelope` commit atomically.
6. Only after commit may presentation load that persisted package and ask
   narration for prose. Narration is retryable delivery work, is never inside
   the factual write plan, and cannot add a time, event, schedule, route or
   consequence.

## Fail-closed data readiness and replay

Every provider input names its exact policy/profile/catalog pins. Missing or
incompatible pins, a required empty candidate set, a missing calendar/activity/
event/NPC/weather/history/remote/propagation rule, or an unsafe visible package
is a typed gap and stops the affected advance; no default profile, semantic
fallback or invented remote result is allowed. A committed idempotency replay
returns only the matching persisted result; the same key with a different
canonical input is `idempotency_conflict`.

The direct party operation owns exactly one clock update. A carrier-local
result keeps its local elapsed time, but a synchronized root transport result
owns the single shared clock update; local participants never update it again.
Remote processing is lazy and coarse: it runs only for an approved trigger or
catch-up boundary, not as continuous simulation of every distant entity.

## Boundary of this document

This describes the target lifecycle and its contracts, not a new production
entrypoint. Production activation remains impossible before the complete,
atomic P28 decision for the exact final PR HEAD.
