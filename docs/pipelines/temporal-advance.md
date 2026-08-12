# Temporal advance pipeline (production v6)

`temporal-world-v1.1` / `4.4.0-target.1` is the current active-norm target
pipeline; accepted `temporal-world-v1` / `4.3.0-target.1` remains an immutable
historical contract snapshot.
Accepted historical P28 evidence changed no production composition. The later
`versioned production activation cutover` completed as
`spatial-v3-production-v1`; this pipeline is now the sole production path.
`spatial-v3-production-v6` retains the Phase 7 autonomous NPC path and
activates revision-16 combat on the same turn/temporal ownership boundary.
Dual write, mixed authoritative reads,
in-turn v4-to-v2 fallback and partial activation remain forbidden.

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
   - `@rus/npc-runtime` — schedule, perception and generic NPC signal
     proposals (`npc_decision_signal_v1`);
   - temporal carrier handling — synchronized transport/local results with one
     root clock owner;
   - `@rus/world-processes` — approved remote catch-up and propagation
     proposals.
4. `@rus/turn` deterministically merges proposals. A duplicate write target,
   incompatible transition, double move/resource consumption, missing event
   dependency or conflicting clock owner is `temporal_change_set_conflict` or
   `time_owner_conflict`, never a best-effort choice.
   After a fully resolved same-time batch, new `material|critical` generic NPC
   signals for one NPC aggregate into at most one `npc_decision_boundary_v1`.
   Conversation and autonomous modes share that protocol: a handler may request
   `stop_after_current_batch` only as a common advance stop after the ordered
   same-time cascade finishes; the turn owner then builds the NPC-safe request,
   awaits the decision model outside the synchronous resolver at most once per
   NPC/batch pair, applies the code-owned actor-step, and resumes the same
   timestamp from the updated working projection until a same-time fixed point
   or a typed temporal safety error. Replay uses the persisted decision trace
   and does not re-call the LLM.
   The common turn owner creates the active NPC actor-step, its exact completion
   candidate and the completion transition. Scenario adapters supply approved
   profiles and domain proposals but do not implement that lifecycle.
   Before domain applicability, the turn owner re-reads the current decision
   state. A stale model response is discarded; the NPC-safe request is rebuilt
   and the model is called again only when the same boundary remains applicable.
   An obsolete boundary consumes no signal and applies no actor-step.
   If the committed base changed concurrently, the application discards the
   whole draft and performs one bounded root-turn retry from the reloaded state.
   Multiple NPCs at one timestamp keep sequential autonomous decisions ordered
   by `timestamp → npc_ref → boundary_id`; each later NPC sees the updated
   projection. Combat uses one fully constructed exchange snapshot: all
   eligible NPC intents are chosen from that snapshot before code-owned
   technical steps run. Heterogeneous technical steps are scheduled by their
   approved exact completion time; the exchange stops at the earliest boundary,
   persists progress for later steps and rechecks them from the evolved state.
   A due combat technical step is registered as a normal `activity` candidate
   in that same cross-domain batch. The common resolution-class order therefore
   applies hazards/access before the step and reactions after its factual
   result; combat never drains an external batch and executes the step in a
   separate post-batch loop.
   A route traversal inside that slice returns a shared-clock paused/terminal
   result and never commits a second clock update. Meaningful outcome events
   then aggregate into the next combat decision batch without reusing the
   sequential autonomous loop.
   A conversation clause may occupy a positive final segment of an already
   active parent activity when the authored time profile declares that
   relation. The parent first advances to the causal decision point; the
   conversation and parent continuous effects then advance together through
   the common temporal owner against one evolving working projection. The
   parent completion boundary is resolved at the shared final timestamp, its
   body effect is applied once for the full parent duration, and the root turn
   records only the parent elapsed time rather than adding both durations.
   Every autonomous and conversation decision in that workflow carries the
   one `root_turn_id` created by `@rus/turn`; temporal/scenario adapters do not
   synthesize a second turn identity.
5. `@rus/turn` applies the merged proposals to an immutable candidate
   post-change state. `@rus/visibility-knowledge-memory` creates a player-safe
   package candidate and validates hidden-leak absence.
6. Only after that validation does `@rus/turn` create the logical combined
   plan. `@rus/party-store` validates party persistence and submits it;
   `apps/game-server` executes the physical PostgreSQL transaction. The
   factual state, exact clock result, effects, time-slice results, idempotency
   record, player-safe `VisiblePackagePersistenceEnvelope` and
   presentation-pending metadata commit atomically.
7. Only after commit may presentation load that persisted package and ask
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

This describes the active production temporal lifecycle after the completed
`versioned production activation cutover`. Composition, authoritative reads and
writes follow the sole production path; `spatial-v3-production-v6` keeps Phase 7
autonomous decisions and revision-16 combat on common owners without a second
scheduler or scenario-local combat state machine.
