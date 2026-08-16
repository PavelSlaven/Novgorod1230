# Stage 16 — item-placement

Code-only Stage 16 materializes item/container/property instances from approved profiles and rules. The `materialize` port is a code service; LLM is limited to audit and cannot repair or create item state.

Initial garments use the existing item materializer: target NPC candidates are
resolved through the Stage 15 mapping, while an explicit player target resolves
through the Stage 11 character. An absent or ambiguous target is a typed hard
block. Every garment becomes a concrete equipped item with normalized
owner/holder/controller/slot placement. Its immutable
`item_visual_profile_snapshot_v1` comes from the exact pinned item visual
profile referenced by the equipment candidate. Candidate-owned inline visual
snapshots and a profile for another template or equipment slot are hard
errors; actor identity never stores clothing.

Scenario materializers author only the approved equipment candidates and the
candidate-to-instance mapping. The public Stage 16 finalizer consumes that
handoff, appends the concrete items and seals the updated materialization trace.

Before the draft can pass its code precheck, each selected container is checked with packing slots v1. Capacity is an internal packing measure, not mass, litres or character inventory slots. For every direct item line the module uses `ceil(quantity / packing_bundle_size) × packing_slot_cost`; a nested container uses its own external `packing_slot_cost`, while its contents remain separate for mass. Missing packing metadata or overflow is a hard block (`CONTAINER_CAPACITY_EXCEEDED`); no quantity reduction, additional container or fallback is permitted. The immutable trace is stored in the Stage 16 code-precheck evidence.

When an explicit reviewed `inventory_foundation.required` candidate is supplied, the same precheck additionally validates normalized placement topology, mass, hands, access and container usage through `@rus/items-property`; a missing candidate is the hard gap `INITIAL_INVENTORY_PLACEMENT_DATA_GAP`. This optional gate does not invent player inventory or change the existing scene-item materialization route.
