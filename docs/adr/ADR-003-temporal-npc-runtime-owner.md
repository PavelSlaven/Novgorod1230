# ADR-003: Temporal NPC runtime owner

- Status: accepted
- Date: 2026-07-23
- Decision scope: production architecture. Historical P28 acceptance did not
  activate production; the later `versioned production activation cutover`
  release `spatial-v3-production-v1` did.

## Decision

Create the minimal pure `@rus/npc-runtime` owner for temporal NPC schedule and perception proposals. It does not replace initial NPC materialization: `@rus/materialization` and New Game Stage 15 remain responsible for creating approved NPC instances. `@rus/visibility-knowledge-memory` remains the owner of knowledge and hidden-information validation; `@rus/turn` remains the workflow owner.

Public input is a frozen `{ npc_snapshot, schedule_profile, perception_context, elapsed_time, catalog_pins }`. Public output is a frozen `{ status, schedule_proposals, perception_proposals, trace }` or a typed gap. The module may depend only on `@rus/kernel` and versioned contracts. It must not access a database, network, LLM, narrator, UI, global clock, or hidden process state.

Profiles and candidate data remain read-only authoring data owned by `world_base` (`region_schedule_profiles`, NPC profile sets and approved bindings). The owner may only propose changes from the supplied, pinned data; an empty required candidate set returns a typed gap and cannot trigger fallback. Persistence is performed only through `@rus/turn` and the target `CombinedAtomicCommitter`; this module emits neither SQL nor a persistence plan.

## Rollback

Before the completed `versioned production activation cutover`, the package was
shadow/fixture-only. It is now part of sole-owner v3 production composition.
Rollback uses the declared v2 migration/rollback source with the last validated
checkpoint or an approved reverse migration; a partially committed NPC update
is never reinterpreted as v2.
