# Transport readiness audit — compiled 457

## Scope and boundary

Independent read-only readiness assessment of compiled
`production-v1/runtime-bundle.json` (457 claims), the active coverage matrix,
and the current historical-processes shard. The four transport additions are
treated as existing independently verified inputs; this audit neither checks
their sources nor approves individual claims. No authoring, matrix, data,
code or pipeline artifact was changed.

The exact relevant spatial cell is `wk:space:river-market`.

A factual-family verdict does not require a currently navigable route,
water/weather state, bridge or vehicle entity, cargo, stock, controller,
capacity, destination, fare, permission, market opening, landing access or a
completed crossing. Those are map/world state, property/policy and mechanics
owners. It does require a bounded historical premise where that premise is
part of the cell's declared family.

## Actual Core unseen-equivalent probes

At year 1230 / `region_novgorod_land`, `materialization_support` Core queries
returned supported slices for:

- repairing a boat and sending a cargo by water: boat form/work, wooden-peg
  and iron-nail joints, clamp/tarred-tow caulking, cargo dispatch and hired
  boatman;
- hauling a load by cart or sledge and crossing built infrastructure: wooden
  cart/sledge, street-cart use, tack, horse-sledge equipment, summer cargo
  use and rjaz bridge support;
- moving goods between river work/storage and market context: public market,
  riverside storage, river/boat work, fur-sale accounting, cargo dispatch and
  hired boatman;
- asking a boatworker/fisher/agricultural or construction worker for help:
  boat and net work, rural agricultural context, economic activities and
  auxiliary construction labour.

These prove retrieval of available premises, not scene presence or automatic
success.

## Findings

| Cell | Verdict | Whole-family factual basis | Remaining factual premise / boundary |
|---|---|---|---|
| `wk:process:transport` (P0) | **COVERED recommendation** | Boat/cart/sledge construction forms and material context, boat repair/joining/caulking, cart street use and paving, horse transport/tack plus horse-sledge equipment and summer cargo use, rjaz bridge construction, boat cargo dispatch and hired boatman together cover the declared `build_navigate_haul_cross` family. Boatman-plus-dispatch is a bounded navigation/transport-use premise; no ungrounded route model is needed. | None at category level. Route topology, present water/road/ice condition, actual bridge, vehicle/animal/crew, ownership/access, load, capacity, fare and travel/crossing outcome remain state/mechanics. |
| `wk:space:river-market` (P0) | **PARTIAL** | Market-space, riverside storage, river/boat work, boat cargo dispatch, hired boatman and bounded commodity/accounting context support a river-adjacent market-work envelope. | The declared `harbours_river_descents_markets` family still lacks a dated historical harbour, river descent/landing, or boat-to-shore loading/unloading premise. This is a family fact, not a demand for a present quay, route, boat, access, stock, permission, market attendance or completed exchange. |
| `wk:npc:occupations` (P0) | **PARTIAL** | Fisher/net, boat work and hired boatman now cover a bounded transport-service context alongside agricultural, smith/carpenter, construction-labour, craft and economic-work contexts. | Qualified practice context remains absent for religious, military/authority, and broader temporary/service roles; trade remains broad economic context rather than role-to-practice evidence. Priest/authority documents do not fill that gap. No NPC's present occupation, expertise, schedule, hire or outcome is required. |

## Decision

Recommend `wk:process:transport` for `covered` at its stated factual-family
boundary. Keep `wk:space:river-market` and `wk:npc:occupations` partial for
the specific historical premises above. This is not a recommendation to add
routes, stock, permissions, NPC assignments or fixed transport recipes, and
does not modify the matrix.
