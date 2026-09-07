# Environment start-readiness audit — compiled 420 pack

## Scope and method

This is an independent readiness reading of the seven remaining `wk:env:*`
cells in `archive-v1/coverage-matrix.json` against the **compiled**
`production-v1/runtime-bundle.json` (420 claims), not against the uncompiled
terrain-resource-context research shard.  The active
`wk-profile:environment:production-v1` covers 1220–1240 / Novgorod Land for
semantic resolution, materialization support, NPC decision and narration.

I read each cell's family, process and claim references; the referenced
compiled records and neighbouring active material-culture, craft-technology,
physics and NPC profiles where the relation is deliberately cross-domain.  I
also ran the real `@rus/world-knowledge` Core against the compiled bundle at
1230 / `region_novgorod_land`, with Russian production-shaped lexical queries.
The results below are evidence of retrieval behaviour, not a recall metric:

| Probe | Core result | Reading |
| --- | --- | --- |
| `грунт камни глина вода копать пройти` / `environment` | supported: `terrain-parent-material-assemblage`, `secondary-clay-forms-through-water-transport-deposition` | A qualified ground/material envelope is retrievable. |
| `камыш трава стебли собрать связать` / `environment` | unresolved | No historical regional stem/reed gathering-and-use premise is retrieved. |
| `лён конопля сеять выращивать собрать хранить` / `environment` | unresolved | Existing crop evidence does not encode the requested flax/hemp cultivation chain. |
| `рыба птицы насекомые ловить вредитель` / `environment` | supported: urban-bird boundary, fishing context, pollination | Fishing/bird fragments are present; this does not fill insects. |
| `дерево глина камень вода добыть строить` / environment + material/craft/physics profiles | supported, 11 facts including woodwork material, parent-material assemblage, clay plasticity/drying/quartz relations | Cross-profile substrate is usable; it still does not create a scene source. |

`COVERED_WITH_LIMITS` means that the full factual family is sufficient for a
start envelope.  It does **not** turn a category into an existing object,
stock, bank, quarry, field, animal, access right, quantity, safe food or exact
mechanical result.  Those are respectively committed scene/profile state,
authority/ownership, safety assessment, or code-owned mechanics.

## Per-family verdicts

| Cell / criticality | Start-readiness verdict | Compiled factual basis actually usable | Remaining factual premise, if any | Explicit boundary |
| --- | --- | --- | --- | --- |
| `wk:env:terrain` — P1 | **COVERED_WITH_LIMITS** | The regional Volkhov–Ilmen woodland/meadow context; excavated buried and waterlogged soils; universal saturation/infiltration relations; and qualified Quaternary parent-material classes (`terrain-background`, `terrain-parent-material-assemblage`) support a broad terrain/ground envelope. | None required for ordinary semantic grounding.  A later specialist construction/extraction feature may need a narrower technology source, but that is not a prerequisite for generic travel, observation or digging attempts. | A particular slope, ford, marsh, soil bearing capacity, route, exposed clay/sand/gravel, and the outcome of digging are scene topology/state or mechanics.  Modern geology is not evidence of a medieval deposit at a particular spot. |
| `wk:env:shrubs-grasses` — P1 | **PARTIAL** | Troitsky evidence supports qualified woodland/heath gathered plants and bilberry; `common-reed-rhizome-produces-stems-in-wetland-habitat` is a universal ecological relation only. | Add one bounded, historically/regionally compatible premise for non-woody wet-ground or meadow stem material and its ordinary gather/use context (not a claim that reeds stand in every scene).  Prefer Novgorod/Lake Ilmen palaeobotany or excavated plant-fibre/reed-use archaeology with identification and context. | Whether a given bank has reeds/grass, whether stems are reachable, their amount, ownership and condition are state.  Binding strength, tool need and yield are material/process mechanics, not facts to fabricate from the regional claim. |
| `wk:env:crops` — P0 | **PARTIAL — material P0 gap** | Cereal/millet remains, agriculture tools/practice, rye/barley commodity records, orchard evidence, grain-storage conditions and historical hemp/linen *uses* establish cereal agriculture and later material processing context. | The stated family explicitly includes `flax_hemp` and `sow_grow_harvest_store`, but the compiled pack lacks a qualified regional medieval premise linking flax/hemp to cultivation/harvest or handling.  Research route: dated Novgorod/Rus documentary corpus or archaeobotanical crop evidence; formulate category compatibility, not a field or harvest. | A particular field, seed stock, labourer, crop stage, yield, storage building and permission must be authored/state-backed.  Exact agricultural calendar, weather and crop outcome need separate evidence/mechanics. |
| `wk:env:wild-flora` — P2 | **PARTIAL** | Identified Troitsky wild-fruit/hop/berry and non-wood plant evidence permits limited, qualified woodland/heath gathering context.  Universal fungal decomposition is not food evidence. | The whole named family includes fungi and `gather_prepare_consume`; no bounded historically grounded fungus/edible-wild-plant premise or safe identification boundary is present.  Add only identified taxa/material uses from regional palaeobotany or academic archaeobotany, with explicit uncertainty. | No individual plant/fungus, edibility, dose, preparation safety or harvesting permission follows.  Species identification and toxicity are assessment/medical-safety concerns, not ordinary scene materialization. |
| `wk:env:animals` — P1 | **PARTIAL** | Medieval domestic assemblages (cattle, pig, sheep/goat), horse transport/use, limited wild hare/beaver/elk dietary evidence, and the distinction between food remains and fur procurement give a sound availability envelope. | The full process is `husbandry_hunt_process`; the pack has no qualified historical premise for an ordinary husbandry or hunting practice chain beyond presence/use context.  Research one or two bounded regional medieval practice relations (e.g. zooarchaeology plus excavated hunting/husbandry equipment), without assigning skill, animal or hunt to an NPC. | Animal existence, health, ownership, tameness, herd count, game encounter, trap/weapon access and killing outcome are world state/mechanics.  The corpus must not turn faunal remains into nearby prey or livestock. |
| `wk:env:birds-fish-insects` — P1 | **PARTIAL** | Fishing is materially strong across active profiles: regional fishing, net/float/cord/hook relations, river/boat work and fish processing.  Bird remains and qualified seasonal wildfowl context are also present. | The cell is not whole-family ready because `insects_other_practical_fauna` has only universal pollination and an urban-bird caution, not a bounded practical insect premise.  If pest/pollinator/beekeeping play is in scope, research a qualified medieval-Rus/Novgorod relation for that specific class; otherwise split/reduce the cell rather than claiming all insects covered. | No current fish, bird, insect, nest, swarm, catch, migration date, infestation, species or pest severity follows.  Food safety and pest damage outcomes require state/assessment/mechanics. |
| `wk:env:raw-sources` — P1 | **COVERED_WITH_LIMITS** | Cross-profile retrieval composes regional woodland/water landscape, structural/object wood, clay formation and material response, coarse sand/gravel/clay/stone classes, and construction stone/wood relations.  This is sufficient to validate ordinary **source categories** when a scene already provides the source context. | None required for category-level start readiness.  A future feature that models quarrying, mine ownership, clay preparation or long-distance material supply needs its own dated technology/economic evidence. | This does not create a tree, clay bed, stone pile, potable water, quarry, river access, stock, purity, amount or right to extract.  Those are source entities and access/quantity state; water safety is a separate assessment. |

## Decision

Two cells have sufficient whole-family factual substrate now: **terrain** and
**raw-sources**, both only at the explicit category/state boundary above.
Five remain partial.  The actionable research order is:

1. **P0 crops:** flax/hemp cultivation/handling compatibility.
2. **P1 shrubs-grasses:** a bounded regional non-woody stem/reed material-use premise.
3. **P1 animals:** one bounded husbandry/hunt practice premise.
4. **P1 birds-fish-insects:** practical insect subfamily, or consciously narrow the cell; fishing itself is not the gap.
5. **P2 wild flora:** identified edible/material taxa only, paired with an explicit no-automatic-edibility limit.

The earlier matrix text that treats a particular extractable source as a
terrain P1 prerequisite is too broad for start readiness: exact source
location, stock, access and extraction result belong to scene/state and
mechanics owners.  This audit does not recommend asserting any of them as
historical facts.
