# ADR-006: Temporal world-process owner

- Status: accepted
- Date: 2026-07-23
- Decision scope: production architecture. Historical P28 acceptance did not
  activate production; the later `versioned production activation cutover`
  release `spatial-v3-production-v1` did.

## Decision

Create the minimal pure `@rus/world-processes` owner for remote catch-up and propagation proposals. It composes no NPC, environment, route or persistence logic internally: those facts are supplied as pinned process candidates and its output is a bounded batch of proposed changes. `@rus/turn` remains the autonomous-update orchestration owner and `@rus/party-store` remains the persistence boundary.

Public input is frozen `{ party_snapshot, process_candidates, elapsed_time, catalog_pins }`. Public output is frozen `{ status, change_set_proposals, deferred_work, trace }` or a typed gap. Allowed dependencies are `@rus/kernel`, `@rus/time-events-history` and versioned contracts. Database, network, LLM, narration, UI, global state and direct calls to other runtime owners are forbidden.

Process profiles, causal rules and candidate data are read-only `world_base` data. Missing provenance, invalid pins, a required empty candidate set, or an unresolved propagation target produces a typed gap; the module cannot invent an event, target, schedule or catch-up result. Only `@rus/turn` may validate and submit an approved change set through `CombinedAtomicCommitter`.

## Rollback

Before the completed `versioned production activation cutover`, this owner was
shadow/fixture-only. It is now consumed only through the v3 combined write
plan. Rollback drops uncommitted proposals and uses the declared reverse
migration or checkpoint recovery, without dual writers, partial fallback, or
recomputation of already committed party history.
