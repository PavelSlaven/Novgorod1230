# M3 procedural materialization data sufficiency

Status: authoring/readiness input for PR #98. Source files, candidate bundles,
approved records and records activated under the exact runtime pin are distinct.
Only the last class is executable runtime data.

## Owner map

| Requirement | Canonical owner data | Reader/compiler | Persisted/runtime owner | Current state |
|---|---|---|---|---|
| G4/G5/G6 topology | Spatial-v3 v6 closure | existing Spatial-v3 reader | existing spatial materializer/committer | executable |
| landscape/water/land use/place function | `world_base` template and regional-binding tables | procedural profile compiler | compiled profile is not activated yet | source exists; runtime activation unproved |
| work items/containers/finite stock | item-container-120 candidate tables | runtime-catalog reader + compiler | Stage 16/items-property/resource nodes | **NOT ACTIVE**: approval pending, activation `not_requested`; runtime use forbidden |
| ordinary NPC basis | approved enriched occupations/social roles/legal/social-position maps; approved demographic/appearance | actor/role/occupation readers + compiler | Stage 15/16, NPC runtime | schedules, knowledge, behavior/goals and appearance are usable; concrete clothing/tools still blocked by inactive item catalog |
| light/weather/activity/body-time | approved Temporal v4 datasets | existing temporal/environment/body owners | existing temporal persistence | executable; derive current state, never author strings in scene profile |
| presentation | committed entity/group/item/NPC refs | existing perception/opening projection | existing presentation owner | projector currently omits first-entry ordinary objects at state version 0 |

## Compiler boundary

`compileProceduralSceneProfile` consumes only exact approved owner records and a
binding containing refs. Output components retain owner table/id, category,
source field, exact quantity bounds and selection weight. It does not author
physical nouns, prose, probabilities or default quantities.

- required components bypass RNG;
- optional candidate choice may use only source weights;
- source weight is never interpreted as presence probability;
- absent explicit presence policy means `optional_presence_policy: null`;
- every declared applicable required layer must be covered or compilation
  returns `PROCEDURAL_SCENE_PROFILE_DATA_GAP`.

## Current family gaps

| Family | Existing nearest data | Blocking gap |
|---|---|---|
| river bank | low alluvial riverbank, small/medium river and regional bindings exist in source/import workflows | exact v6 activated readback and structured resource/ambient policy not yet compiled |
| fishing worksite | fishing land-use/place candidate plus approved enriched fisher occupation/role data | item/container profile is not active; exact tools/clothing/storage/stock cannot be instantiated |
| other human place | old drying-shed closure plus craft/household candidate profiles | exact place-function binding absent; item profiles not active; tools/storage/stock blocked |

## DATA GAP: executable activation

- required capability: compile three exact current-v6 families from active rows;
- correct owner: runtime-catalog activation and world-base authoring workflow;
- missing proof: one disposable-DB readback joining activation event, exact world
  revision/catalog digest and every source record used by the compiler;
- nearest data: source archive, item candidate bundle and v6 spatial manifest;
- why insufficient: candidates/manifests do not prove active rows;
- minimum delta: authoring bindings, required profile entries where absent,
  activation/import update, generated compiled artifact and reproducibility check;
- acceptance: unknown/draft/missing/ambiguous record hard-blocks before runtime.

## DATA GAP: finite resources

- required capability: source-owned quantities and ambient policy for each
  material category used by baseline/remainder;
- correct owner: item/resource profile plus existing `party_resource_nodes`;
- missing data: required functional stocks do not all declare finite quantity
  basis; natural origin is not an infinite policy;
- minimum delta: exact quantity/profile refs and explicit ambient policies only
  where authoring data says conditional abundance;
- acceptance: depletion, reload, CAS concurrency and rollback with one shared
  remainder across synonyms/positions/request IDs.

Until these gaps close, no compiled artifact is eligible for production loading
and no gameplay/model acceptance run may claim procedural baseline coverage.

### Explicit status decisions

- item-container-120, building/layout/content profiles and their G4/item rules:
  `NOT ACTIVE`; this PR does not consume them as runtime truth;
- enriched occupations/social roles plus approved legal/social-position seeds:
  usable for NPC schedule, property, knowledge, behavior, relationships and goals;
- actor demographic/appearance owner and `materializeActorBaseAppearance`:
  implementation is usable, but exact current-v6 active readback contains no
  applicable entries because the appearance candidate activation is false;
  runtime wiring therefore remains blocked instead of falling back to candidate data;
- Temporal v4 daylight/weather/activity/body-time/remote-catchup/propagation:
  usable through existing owners; initial environment derivation is implemented
  and tested, but production loading remains gated on exact profile pins in the
  compiled scene artifact;
- draft name pools: not usable; ordinary unrecognized label remains player-safe
  until a name has approved/authored basis.
