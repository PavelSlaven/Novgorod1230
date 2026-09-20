# M3 procedural materialization: data sufficiency

Status: implementation input for PR #98. This report describes executable data
at the branch head, not every record present in source archives.

## Owner map

| Requirement | Approved source | Runtime reader | Materializer / commit owner | Persisted state | Player-safe projector | Status |
|---|---|---|---|---|---|---|
| Canonical G4/G5 and G6 topology | Spatial-v3 production manifest and exact scene closures | Spatial-v3 world-base reader; authored-start exact closure resolver | `@rus/materialization/spatial-v3`; combined PostgreSQL committer | G5/G6, scene positions, movement and visibility rows | current scene / opening projection | executable |
| Landscape, water and land use | `world_base.landscape_templates`, `water_body_templates`, `land_use_templates` plus region bindings | no active location-bound runtime projection | none in current first-entry path | none | scene-presentation prose only | **DATA GAP** |
| First-entry ordinary presence | approved scene-presentation descriptor and ordinary profile | scene-presentation loader | ordinary first-entry provisioner | ordinary aggregate and supporting basis catalog | ordinary turn projection | executable but one undifferentiated group |
| Finite ordinary stock | O2a context-bound capability | ordinary profile loader | ordinary first-entry provisioner; ordinary Phase 6 commit | `party_resource_nodes` with CAS state version | ordinary discovery/action projection | executable but one prepared-clay stock |
| Authored items and exact mechanics | verified item catalog v2 | runtime catalog loader | authored-start materializer / Stage 24 | party items and placements | opening/turn inventory projection | executable for pinned authored records |
| Actor roles and occupations | approved regional role/occupation catalog | authored-start catalog loader | authored-start materializer | player/NPC snapshots | opening/turn actor projection | executable |
| Actor demographics and appearance | approved actor profile catalog | `loadApprovedActorProfileCatalog` | actor appearance materializer | supported by actor snapshot contracts | actor-safe projection | executable data exists; not wired into authored start |
| NPC clothes/equipment/tools | approved item/equipment catalog | item/runtime catalog readers | Stage 16 equipment materializer | party items/equipment | inventory and NPC-safe projection | executable data exists; not wired into authored start |
| NPC behavior, relationship, activity and schedule | authored relationship and one background routine in live-world start | authored-start loader | authored-start materializer / NPC runtime | NPC machine state, relations and schedule | opening/conversation projection | partial; non-background actors lack full basis |

## Supported scene-family audit

| Scope | Required layers | Existing executable data | Gap | Resolution |
|---|---|---|---|---|
| natural river bank | surface, relief, water/shore, vegetation, natural material, season, light, weather, sound | canonical spatial closure; approved landscape/water/land-use source rows; player-safe scene facts | source rows are not resolved into persisted first-entry layer entities/resources | activate an exact location-bound natural-layer profile through the existing materialization and first-entry commit owners |
| fishing worksite | natural bank plus work zones, tools, storage, finite supplies, workers and activities | authored fishing-camp closure, NPCs, rope/shirt, local topology, one ordinary group and one finite stock | worksite cannot perform all stated activity from current persisted tools/stocks; NPC basis incomplete | add approved worksite profile data and materialize its items/stocks/NPC equipment through existing item/NPC owners |
| other human place | household/craft function, property/access, items, container/stock, occupants and schedule | canonical old drying shed exists; general item/container catalogs exist | no approved executable household/craft first-entry binding | add one approved human-place profile/binding; no per-place runtime handler |
| ordinary NPC | demographic, appearance, body, skills, clothes/tools, behavior, relations, activity, schedule, placement | role/occupation and actor-appearance catalogs; item/equipment catalogs; NPC persistence/runtime owners | authored-start handoff currently stores only identity/role/occupation plus optional background routine | compose exact approved profiles before commit; open decisions/speech remain LLM-owned |

## Hard gaps

### DATA GAP: natural layer execution

- required capability: code-only, location-applicable natural baseline before narration;
- correct owner: world/runtime catalog applicability plus `@rus/materialization` first-entry;
- missing authoring data: structured versioned layer components, required/optional rules,
  compatibility, quantities and finite/infinite-source policy bound to supported scene families;
- nearest data: approved landscape/water/land-use tables and scene-presentation text;
- why insufficient: descriptive strings are not persisted interactive entities or resource bases;
- minimum delta: one versioned scene-baseline profile set for three families, strict loader,
  deterministic existing RNG selection and existing atomic first-entry persistence;
- acceptance: fixed seeds, reload/revisit, immediate interaction, finite depletion and CAS.

### DATA GAP: complete NPC basis

- required capability: code-complete ordinary NPC before first narration;
- correct owner: approved actor/item catalogs, `@rus/materialization`, Stage 16 and `@rus/npc-runtime`;
- missing wiring: demographic/appearance/body/skills/clothes/tools/behavior and schedule are
  not composed into current authored-start NPC snapshots;
- nearest data: verified actor appearance and item/equipment catalogs plus background routine;
- why insufficient: named fishermen can exist without persisted visible clothes or activity tools;
- minimum delta: exact approved profile composition and existing NPC/item write path;
- acceptance: visible equipment equals item state, supports activity, and survives reload.

### DATA GAP: third executable family

- required capability: same first-entry mechanism for natural, worksite and another human place;
- correct owner: live-world catalog bindings and generic first-entry materializer;
- missing authoring data: active non-worksite human-place profile/binding;
- nearest data: approved old drying-shed canonical closure and broad item/container catalog;
- why insufficient: canonical geometry alone does not define functional material culture;
- minimum delta: approved profile data, not a new runtime module;
- acceptance: all three families pass one parameterized materialization/PG test.

No gameplay materialization LLM is an allowed resolution for these gaps. Narration,
ordinary semantic remainder and open NPC decisions remain separate LLM roles.
