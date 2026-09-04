# Foundations coverage audit — corpus 665

**Status:** research/coverage audit; no source approval and no production
change.
**Scope:** baseline non-historical factual knowledge needed to reason about a
world and characters. This is not a demand for a universal simulator, an atlas,
or evidence that a thing exists in a Novgorod scene.

## Active boundary observed

The active World Knowledge contract §15 permits factual/scientific domains only
with a real corpus, consumer, predicate semantics and applicability semantics.
§16 measures coverage by question/consumer need rather than claim count. §§68–70
reserve NPC reactions and exact legal/physical mechanics to their owners, while
WK may supply qualified factual premises and causal conditions.

At corpus 665, runtime has nine declared domains: `biology_physiology` (204
claims), `physics_material_science` (89), `chemistry_process` (16),
`environment` (37), `material_culture` (154), `craft_technology` (53),
`architecture_settlement` (55), `npc_daily_life` (13), and
`social_law_economy` (44). Only the first three are universal production
profiles. No psychology or general-social-science domain/profile exists.

## Current useful base

- Physics/materials already covers contact geometry, friction, buoyancy,
  water/wood/clay responses, thermal/fire relations, corrosion, selected
  textile/leather processing and microbial preservation conditions.
- Biology/health already covers exertion/fatigue, fluid balance/sweating,
  sleep-loss performance, thermoregulation, basic wound-pressure/waterproof
  cover conditions, healing time dependence, pain/nociception distinction,
  plant/fungal relations and broad fauna ecology.
- Environment includes broad regional terrain, water, wetland, flora/fauna and
  historical climate compatibility; it does not claim scene weather or local
  geology.
- Historical social/law records cover documentary, economic, authority and
  conditional legal context. They are not universal psychology or sociology.

The existing matrix still honestly marks bone/horn and lime/glass material
families, plus bone/horn process, as partial. Those remain concrete materials
gaps rather than a reason to relabel an existing cell covered.

## Missing factual axes

| Area | Needed factual envelope | Current gap | Keep out of WK / code-owned |
|---|---|---|---|
| Psychology | attention, perception limits, memory/recall and learning, stress/arousal effects, sleep/circadian effects, motivation, emotion regulation, risk/uncertainty judgment, interpersonal communication | There is sleep loss and pain distinction, but no human cognition/affect/decision premises. Animal learning does not transfer to people. | Current mental state, intention, consent, belief, diagnosis, skill, truthfulness, player/NPC choice and social outcome. |
| Sociology/social behavior | cooperation/coordination, reciprocity, trust and repair, conflict escalation/de-escalation, group norms/conformity, status/reputation signals, family/peer support, crowd/bystander effects | `social_law_economy` is historical/contextual law and documentary material, not general social behavior. | Current relationship graph, reputation value, duty, authority, enforcement, group membership and NPC reaction. |
| Human physiology/health | respiration/oxygen and ventilation, digestion/energy use beyond one meal, infection/transmission and contamination routes, immune/inflammatory response, heat/cold exposure, sleep/circadian recovery, sensory function, reproduction/development, dose/time/individual variability | Existing facts are good first aid and fatigue/preservation fragments, not a health envelope. | Vitals, injury severity, disease diagnosis/progression/transmission in a party, treatment outcome, mortality, numerical body mechanics. |
| Ecology/biology | food-web/competition/decomposition, pollination/seed dispersal, habitat constraints, population dynamics, seasonal phenology, carrying/resource limits, disease ecology | Flora/fauna facts are broad but selected taxa; ecosystem relations are sparse and do not form a general ecological envelope. | Present species/population, stock, encounter/catch, local carrying capacity, season state and ecosystem event. |
| Geology/hydrology/weather | rock/mineral formation and weathering, soil formation/stability, erosion/sediment/slope failure, groundwater/aquifer and water quality, precipitation/evaporation/cloud/wind, freeze-thaw and flood/ice conditions | Regional terrain and isolated infiltration/porosity/flow facts exist; no complete general geology, hydrology or weather-causation layer. | Current forecast/weather, water depth/flow/quality, ground bearing capacity, route safety, avalanche/flood/landslide event and exact quantities. |
| Physics/mechanics/materials | statics/load/bending/torsion, leverage/rope/knots, impact/abrasion/wear, sound/light/optics, phase change/heat transfer, gas/smoke/ventilation, electrical effects where gameplay-relevant | Existing set is substantial but selective; bone/horn, lime/glass partial cells confirm material gaps. | Force calculation, collision/damage, movement, precise temperature/pressure/strength, fire spread and consumption. |
| Chemistry | acid/base and solution behavior, oxidation/reduction beyond iron, dissolution/precipitation, combustion products/smoke hazards, fermentation/decay boundaries, toxicology, cleaning/dyeing/tanning compatibility | Existing chemistry is chiefly fermentation, preservation, lime, corrosion and tanning. No general interaction/hazard envelope. | Exact reaction yield/rate, concentration, exposure dose, poison diagnosis, explosion/fire simulation and inventory consumption. |

## Minimal placement for psychology and social facts

Do **not** put modern universal facts in `social_law_economy`: its predicate
semantics and production profile are contextual 1220–1240 Novgorod social/legal
knowledge. Do **not** classify cognition or group behavior as
`biology_physiology` merely because humans have bodies.

Smallest non-misc path after a real starter corpus is two explicit universal
domains, owned by existing World Knowledge rather than new gameplay engines:

1. `psychology_behavior` — individual cognitive, affective, perceptual and
   behavioral tendencies, with qualified `supported_fact`, `depends_on`,
   `can_cause`, `affects` predicates; and
2. `social_behavior` — interpersonal/group tendencies, cooperation/conflict,
   norm/reputation signals and collective behavior, with the same bounded
   factual predicates.

Each needs a `context_scope: universal`, `domain_internal_only` starter profile
for semantic resolution/NPC decision as appropriate, actual concepts and a
coverage cell. It remains factual input only: `npc_autonomous_decision` owns
the individual decision and state; social/legal owners own obligations and
consequences. If initial research supports only one of these areas, introduce
only that domain; no empty registry slot or generic `misc` domain.

## Research sequence

1. Turn each missing row into 2–5 concrete player/NPC question classes and
   select a minimal high-trust corpus; do not research an encyclopaedia.
2. Separate universal science from historical availability and from scene state.
3. Atomize conditional facts, preserve taxon/stage/dose/context qualifiers, and
   independently verify source and domain fit under §35.
4. Add a domain only with claims, a consumer and profile; then test retrieval
   and grounded answers for an unseen equivalent question.

**Verdict:** corpus 665 is a strong targeted historical/material/fauna pack,
not yet a complete non-historical foundations layer. Psychology and general
social behavior are first-order missing domains; human health, ecology/geology/
weather, mechanics/materials and chemistry each need bounded factual expansion
without taking code-owned simulation or state authority.
