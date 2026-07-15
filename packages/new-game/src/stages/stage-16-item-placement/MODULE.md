# Stage 16 — item-placement

Code-only Stage 16 materializes item/container/property instances from approved profiles and rules. The `materialize` port is a code service; LLM is limited to audit and cannot repair or create item state.

Before the draft can pass its code precheck, each selected container is checked with packing slots v1. Capacity is an internal packing measure, not mass, litres or character inventory slots. For every direct item line the module uses `ceil(quantity / packing_bundle_size) × packing_slot_cost`; a nested container uses its own external `packing_slot_cost`, while its contents remain separate for mass. Missing packing metadata or overflow is a hard block (`CONTAINER_CAPACITY_EXCEEDED`); no quantity reduction, additional container or fallback is permitted. The immutable trace is stored in the Stage 16 code-precheck evidence.

When an explicit reviewed `inventory_foundation.required` candidate is supplied, the same precheck additionally validates normalized placement topology, mass, hands, access and container usage through `@rus/items-property`; a missing candidate is the hard gap `INITIAL_INVENTORY_PLACEMENT_DATA_GAP`. This optional gate does not invent player inventory or change the existing scene-item materialization route.
