# Harvest/food readiness audit — compiled 451

## Scope and method

Independent read-only readiness audit of the current 451-claim
`production-v1/runtime-bundle.json`, the active coverage matrix, and the
previous 420/442 readiness findings. HH-04 and FPR-01/02/03/06 are treated as
independently approved compiled inputs; this review does not verify their
sources or self-approve them. No matrix, authoring, production or pipeline
artifact was changed.

The audit tests whole declared factual families, not a closed list of scene
objects or recipes. A missing field, stock, access right, tool in hand,
source capacity, current season, NPC assignment, outcome, or food-safety
result is runtime state/mechanics and is not a historical-coverage gap.

## Actual Core probes

At year 1230 / `region_novgorod_land`, `materialization_support` Core queries
returned supported slices for these unseen request shapes:

- crop harvest, threshing and storage: flax/hemp cultivation, sickle use and
  handle, threshing/chaff, household storage/vessels and stored-grain
  temperature/moisture conditions;
- barley/rye/millet processing and dried fish: named cereal uses, threshing,
  millet-cleaning trace, drying workspace and dried-fish form;
- fibre work: hemp cordage/net/tow relations, wool forms and sheep-shearing
  scissors;
- subsistence: hunting economic context and bow, rural borts/honey/wax and
  shearing scissors;
- occupation-shaped agricultural/fishing work: rural agriculture context,
  net work, harvest tools and regional economic activities.

These probes show inputs are retrievable. They do not by themselves promote a
family; verdicts below test its full declared scope.

## Findings

| Cell | Verdict | Available factual envelope after 451 | Real residual historical premise, if any |
|---|---|---|---|
| `wk:env:crops` (P0) | **COVERED recommendation** | Regional agriculture, tillage/garden/orchard context, cereal/millet and rye/barley commodity evidence, flax/hemp cultivation, sickle harvest of crops/grasses, threshing/chaff, probable millet-cleaning trace, household storage and grain-condition facts jointly cover `sow_grow_harvest_store`. | None at declared category level. A particular crop calendar, field, seed, yield, harvest team, store or loss remains time/world state and mechanics. |
| `wk:material:consumables` (P0) | **PARTIAL** | Wood/charcoal input-output, oven/heating, water-in-washing, cereal and fish food context, and new barley/rye uses support bounded fuel and food handling. | Historical household provisioning relation spanning ordinary cooking fuel and water remains absent. Existing charcoal is metallurgical/production context; a bath-water relation and generic wood do not establish domestic supply practice. Broader dated food-preservation inputs are also absent. |
| `wk:process:food` (P0) | **PARTIAL** | Dough/oven/open-fire premises, urban oven cooking, barley porridge/soup, rye flour/bread suitability, grain threshing, cautious millet-cleaning trace, dried fish and malt accounting compose ordinary cereal preparation/baking and bounded drying. | Dated local brewing/malt-production process and a broader historical preservation chain (beyond dried fish and universal microbial conditions) remain absent. Do not substitute current ingredients, a recipe, vessel, safety or finished food. |
| `wk:process:subsistence` (P0) | **PARTIAL** | Agriculture/tillage/harvest, fishing/net work, hunting economic context plus bow, and rural borts form real cultivation/fishing/hunting/bort premises; HH-04 adds a shearing-tool category. | Historical husbandry/care/fodder-cycle and trapping-process premises remain absent. Shearing scissors are not animal keeping, and hunting context/bow are not trapping. Animal, forage, trap, skill and outcome remain state/mechanics. |
| `wk:material:fibre-textile` (P1) | **PARTIAL** | Linen/hemp/wool textile forms, weaving, cordage/netting, hemp-stem-to-fibre/tow and a sheep-shearing tool give a real bounded plant-fibre and textile envelope. | Historical flax and wool preparation/spinning chain, plus dyeing process/source conditions, remains absent. Coloured Nerev wool shows colour, not a dye operation; shears do not establish fleece production, preparation or a spinner. |
| `wk:npc:occupations` (P0) | **PARTIAL** | Fishing/net work, smith/carpenter/boat and storage work, agricultural context and harvest tools, hired work, auxiliary construction labour and regional economic activities ground several craft, fishing and agricultural work contexts. | Qualified role-to-practice context remains absent for trade/service/transport, religious, military/authority and broader temporary roles. Documentary priest/authority mentions do not establish occupational practice. No current NPC role, skill, schedule or hire outcome is required or inferred. |

## Decision

Recommend only `wk:env:crops` for `covered`, with its stated factual boundary.
The other five cells remain `partial`: each retains a concrete historical
practice premise absent from the 451 bundle, rather than a request for scene
inventory, access, capacity, fixed recipe, or assigned NPC. This audit makes
no matrix change.
