# ADR-009: Physical NPC schedule in the live CDDA path

- Status: accepted
- Date: 2026-10-21
- Decision scope: physical NPC schedule in the live CDDA path of the vertical slice; ADR-003 remains accepted for spatial-v3.

## Context

The CDDA reuse-first rule in `AGENTS.md` and owner decisions D228/D253 select native CDDA mechanics for Part 2. The approved Part 2 plan assembles the schedule from `work_hours`, `guard_pos`, an hourly recurrent EOC, native ground travel, sleep and hunger. Owner decision D266 approves the authored schedule data for the slice. This ADR records the owner boundary; implementation and activation are established by the slice code, mod data and tests.

## Decision

In the live CDDA path, CDDA owns physical execution of an NPC's schedule: place by game hour, travel to it, guard post, sleep, hunger and food, flight from fire and return to the post. The slice mod supplies the approved NPC class, work-hours window, posts and hourly recurrent EOC. CDDA's existing movement, sleep and need mechanics perform the behavior; no second schedule or movement engine is introduced.

When the native path has no schedule data, the NPC retains CDDA default behavior. Missing authored data required by an approved scenario is caught by mod acceptance tests, not by a runtime `npc_schedule_gap` hard block. The approved-source requirement in the temporal contract remains in force for authored data.

The NPC model cannot propose a physical schedule transition, move the NPC, or change its post or position in this path. Part 2 removes the JS `request_movement` → `npc_move` route. Semantic NPC decisions, conversation, speech and knowledge remain governed by the active NPC contracts.

## Boundary with ADR-003

ADR-003 continues to assign pure schedule and perception proposals to `@rus/npc-runtime` in spatial-v3; the temporal contract continues to assign traversal there to `@rus/movement-routes`. This ADR narrows only physical schedule execution in the live CDDA path. It does not cancel ADR-003 or change the spatial-v3 path, which is removed by a separate task.
