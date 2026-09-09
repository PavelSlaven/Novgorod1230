# Independent verification — general clay-to-ceramic transformation

**Scope:** PTG-01 through PTG-03 in
`research/pottery-transformation-general.md`.  This is a universal material
science check, not historical authoring.

## Source independently opened

The full [Aalto University OpenLearning *Ceramic Handbook*, “Ceramic
Materials” section](https://openlearning.aalto.fi/course/section.php?id=2034)
was opened and read.  Its `Ceramics` subsection states that moist clay dries
hard and brittle and, when fired, hardens/condenses into durable ceramic.  It
then distinguishes two states explicitly:

- after drying, clay can be returned repeatedly to a plastic form by mixing
  with water;
- after heating above the ceramic change, it is hard, no longer soluble in
  water, and does not return to a plastic form.

The following paragraph calls this a change in the minerals’ chemical crystal
structure under heat into a new durable material.  This directly supports the
submitted qualitative state contrast.  It supplies neither a historical kiln
nor an inferred example of medieval Rus' manufacture.

| ID | Verdict | Production-safe wording (RU / EN) | Anchor and limits |
|---|---|---|---|
| PTG-01 | **APPROVE_WITH_LIMITS** | **Глиняное тело, прошедшее керамическое превращение при обжиге, не возвращается водой в пластичное глиняное состояние. / A clay body that has undergone ceramic transformation in firing does not return to a plastic clay state by water.** | Aalto, `Ceramics`, paragraph beginning “Ceramics are clay fired at high temperatures.”  The source says such clay is no longer soluble in water and does not return to plastic form.  Require the genuine ceramic transformation—not mere air-drying or arbitrary warming.  No temperature, duration, heat source, kiln, fuel, object, history, waterproofness, strength value, or protection from breakage/crushing follows. |
| PTG-02 | **APPROVE_WITH_LIMITS** | **Керамическое превращение при обжиге изменяет химико-кристаллическую структуру минералов глины и образует новый прочный керамический материал. / Ceramic transformation in firing changes the chemical-crystal structure of clay minerals and forms a new durable ceramic material.** | Aalto, `Ceramics`, paragraph beginning “Ceramic change means that clay never ever returns...” directly attributes the change to heat-altered chemical crystal structure and calls ceramics a new durable material.  “Durable” remains qualitative; do not normalize a density, vitrification level, porosity, composition, precise irreversibility beyond re-plasticization, or every-clay/every-heat guarantee. |
| PTG-03 | **APPROVE_WITH_LIMITS** | **Высушенное, но ещё не прошедшее керамическое превращение глиняное тело может при смешении с водой снова стать пластичным. / A dried clay body that has not yet undergone ceramic transformation can become plastic again when mixed with water.** | Same Aalto `Ceramics` paragraph directly says dried clay can be converted back to plastic form by mixing with water.  It is a state contrast only: no water presence, amount, time, survival of a particular dried object, archaeological-clay composition, or present-scene action result is supplied. |

## Decision

All three are eligible only as universal, `domain_internal_only` scientific
relations.  They may compose with separately grounded historical pottery and
actual process inputs, but do not themselves establish a kiln, firing event,
potter, clay stock, fuel, recipe, historical availability, or 1230 Novgorod
practice.

## Exact production-normalization review

**Verdict: APPROVE_WITH_LIMITS (three exact records).**  The normalized
records in `production-v1/material-response.json` preserve the verified
universal/state boundary.

| Claim ref | Exact-record result |
|---|---|
| `claim:clay-fired-no-replasticization` | Correctly says ceramic transformation in firing prevents a return to plastic clay by water.  RU/EN explicitly require transformation rather than mere drying/arbitrary warming, and do not overclaim against breakage, crushing, or water permeability. |
| `claim:clay-firing-structural-transformation` | Correctly limits the result to heat-altered chemical-crystal mineral structure forming a qualitatively durable ceramic.  RU/EN exclude temperature, density, waterproofness and arbitrary-heating conclusions. |
| `claim:clay-dried-replasticization` | Correctly confines re-plasticization to dried clay before ceramic transformation and mixing with water.  RU/EN do not infer water presence, survival of a particular object, or arbitrary-soil suitability. |

All three reuse `wk:material_culture:clay`, `physics_material_science`
`responds_to` literal objects, universal/high/direct/common qualifiers and
`domain_internal_only`, as approved.  Shared
`evidence:clay-ceramic-transformation` anchors the two checked Aalto
`Ceramics` paragraphs and retains the non-historical/no-recipe boundary.
