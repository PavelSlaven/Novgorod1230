# Game-need cartography v3 — independent completeness review

> Historical pre-promotion review of the 871-claim snapshot. Its gap labels
> describe that snapshot, not the current backlog. The active need map is
> `production-v1/category-cartography.json`; current static reconciliation and
> phase limits are recorded in `audits/pr92-static-phase.md`.

## Scope and method

Pre-promotion design review of
`research/game-need-cartography-v3.json`, against PR92 §§7–18 and §37, the
loaded production pack (871 claims, 259 sources, 664 concepts, 543 evidence
records), and `production-v1/category-cartography.json`. It tests whether the
map identifies factual families needed by open unseen actions; it does **not**
certify saturation, approve staged candidates, prescribe a scene inventory, or
turn an action into a whitelist.

The category map grounds four location profiles (wreck shore, fishing camp,
old drying shed, Zhdanko storehouse), six materialization/presentation
consumers (O2a, O2b, A1, F1, S1, scene presentation), and domain profiles.
Those links show where a premise can be consumed; they do not prove a family is
complete. Universal fact, historical applicability, present scene state,
actor perception, and exact mechanics remain separate.

## Correct non-gaps

These must not inflate the backlog.

- **Knot slip / basic drag / floating shape:** current claims already compose
  the needed qualitative premises: `claim:population-physics-static-friction`,
  `claim:population-physics-sliding-friction`,
  `claim:foundations-phys-01-air-drag-fall`,
  `claim:foundations-phys-04-fluid-viscous-resistance`, and
  `claim:population-physics-floating-shape`. A named knot’s safe load or a
  particular object’s drag remains a state/mechanics question, not a missing
  general fact.
- **Numbers, timers, current inventories, exact fire spread, body state,
  route safety, ownership and placement:** code/state owners own these. A
  corpus claim cannot establish them.
- **Historic wet-hull routine:** not required to resolve modern universal
  material compatibility. It becomes a separate historical research need only
  if gameplay claims a Novgorod-1230 maintenance practice.
- **Every room’s contents, cleanliness, illumination or occupation:** these
  are materialization/presentation outputs. Facts may constrain an envelope;
  they must not populate a room.

## Families still needed for open gameplay

### P1 — bounded research before unrestricted reliance

1. **Non-fungal edible-versus-toxic plant identification.**
   `flora-toxic-and-food-plants` correctly records that
   `claim:wild-mushroom-resemblance-not-edibility`,
   `claim:bearberry-lingonberry-resemblance-not-identification`, and
   `claim:mezereon-poisonous-sap-all-parts` are named cautions, not a general
   identification rule. The unseen probe is: player proposes eating an
   arbitrary visually similar berry, leaf, or root. No generic appearance →
   edibility inference is grounded. Research a bounded identification/safety
   premise and scenario-relevant taxon/class evidence; do not build a complete
   species list. Consumer: semantic resolution plus ordinary materialization.

2. **Interior function plus storage ventilation/condensation/spoilage.**
   `shelter-interior-space` and `storage-ventilation-and-drying` are explicitly
   partial. Existing `claim:population-household-storage`,
   `claim:settlement-underfloor-storage`, food-storage and wood-moisture
   families do not establish a joined relation between room function, air/moisture
   conditions and preservation risk. Unseen probe: move a perishable or damp
   fibre item from a drying space to an enclosed store. Research qualitative
   conditions only; F1/time decide duration, scene state decides actual
   ventilation, and materialization decides contents. Consumers: S1, drying
   shed, storehouse, scene presentation.

3. **Rope/line condition under load.** Static friction closes simple hold/slip,
   but it does not answer the distinct unseen probe: actor hauls with a frayed,
   repeatedly bent or knotted fibre line. The map’s
   `rope-knot-and-flexible-line-systems` remains missing. A bounded condition
   relation (abrasion/bending/prior load can reduce available strength) is
   useful for A1; safe load, break probability, named-knot outcome and current
   line condition stay code/state-owned. `research/gameplay-physical-environment-v3.md#PE-03`
   is a candidate direction, not approval.

4. **Aquatic/herb functional form.** Reed/willow and selected taxa do not
   compose an answer to whether an ordinary plant is rooted emergent,
   rooted-floating-leaf, submerged, or free-floating. This matters for unseen
   attempts to move through, pull, anchor to, or harvest plant matter at shore.
   It must remain a form/attachment premise, not a plant identity, density,
   passability or local-presence assertion. Consumers: wreck shore, S1 and
   ordinary materialization. `research/gameplay-physical-environment-v3.md#PE-02`
   is limited candidate research.

### P2 — important realism/retrieval backlog, not broad closure

5. **Smoke optical obscuration.** Current fog and light facts do not supply a
   smoke-specific visibility bridge. A player looking through smoke needs a
   qualitative contrast/attenuation premise; toxicity, exposure, exact range,
   escape and fire outcome remain elsewhere. This supports F1 and scene
   presentation. Candidate direction: `gameplay-physical-environment-v3.md#PE-01`.

6. **Tree, shrub/herb and riparian functional ecology.** The cartography still
   names `flora-trees`, `flora-shrubs-herbs-aquatic`, `flora-fibre-taxonomy`,
   and `riparian-substrate-and-debris` as partial. Current examples (willow,
   reed, flax/hemp, sediment transport) do not entail arbitrary tree season,
   wild fibre usability, or organic-debris retention. Research only compact
   functional relations demanded by shore/camp probes: seasonal tree form,
   wild-fibre applicability, and conditional woody-debris transport/retention.
   Do not infer local stock, access or safe collection. The approved/reviewable
   flora candidate stream can reduce these dimensions only after its own
   verification; it does not create scene driftwood.

7. **Wet-use net condition and mending.** Net components, fishing work, boat
   context and `claim:household-boat-repair-clamp` support context, not repeated
   wet wear/drying/mending. A qualitative net/cord condition premise helps the
   fishing-camp/A1 probe of a wet damaged net. It does not require historical
   hull-care research or establish a repair method, skill, interval or result.

8. **Ordinary cleaning, lighting and heating as spatial envelopes.** Lighting
   is not wholly absent (`wax-lighting-and-wicks` exists); heating/fire facts
   also exist. Missing is a source-backed, consumer-specific relation between a
   room/workspace function and possible ordinary process categories. This is
   P2 because no current consumer may materialize content from it without a
   causal basis. Research only if S1/scene-presentation genuinely needs it;
   never turn it into “this room contains a lamp/broom/fire.”

9. **Scenario-relevant animal restraint/injury response.** General animal
   senses/risk and selected taxa are present, but selected records cannot
   generalize to every animal. Add a class/taxon premise only when an active
   NPC/fauna consumer and an unseen restraint/injury probe identify it. No
   deterministic animal action follows.

### P3 / deferred until a real consumer

10. **Plant dispersal, litter and deadwood ecology.** Correctly absent from
the map’s active closure because no current materialization or NPC ecology
consumer needs it. Do not research it merely to make an ecology catalogue look
complete.

11. **Historical ordinary maintenance detail.** Specific medieval hull care,
room-cleaning custom, or trade practice requires its own historical premise,
date/place scope and consumer. It is not a prerequisite for universal physical
or material relations.

## Already adequate under stated limits

The §37 physiology requirement has a dedicated expanded research/candidate
stream (`research/gameplay-physiology-v3.md`), covering its named premise
families without assigning current actor state. Existing body/combat/time
owners still decide consciousness, blood volume, injury severity, duration,
forced action and commit. This review finds no basis to recast those exact
mechanics as cartography gaps.

Likewise, broad psychology/social families map to existing attention, memory,
stress, individual-variation, trust/cooperation and historical legal-context
claims. The remaining boundary is retrieval/grounding for a particular trace,
not a mandate to model a person’s motive, diagnosis or inevitable behaviour.

## Ready-for-limited use versus BLOCK

**Ready for limited gameplay now:** O2a’s ordinary sand/prepared-clay context,
O2b’s road-kit envelope, A1 qualitative ordinary transformations that do not
need dynamic rope condition, F1 combustion/heat relations without a guaranteed
suppression outcome, and S1 basic interior semantics without inferred contents.
All require existing state, access, materialization and exact-mechanics gates.

**BLOCK / return an honest unknown or defer factual conclusion:** generic wild
plant “safe to eat” identification; a particular aquatic plant’s identity,
density or passability; rope safe load/secure repair; room-specific preservation
or ventilation conclusion; local driftwood presence/access; a historical wet
hull-care assertion; and any exact numeric or current-state result. These are
either uncovered factual premises or code-owned state, not LLM-memory fill-ins.

## Verdict

**No saturation PASS.** Cartography is a useful pre-promotion map and correctly
separates many code-owned non-gaps, but it leaves concrete P1 factual families
for open actions. It is **ready for limited profile use** only within the
stated envelopes and **not ready to claim practical factual completeness**.
Next loop: independently research P1 families, verify candidates separately,
then run real trace/retrieval probes before changing this verdict.
