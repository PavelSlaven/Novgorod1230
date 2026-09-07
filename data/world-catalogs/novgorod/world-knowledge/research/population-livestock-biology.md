# Livestock biology — evidence candidates, not production

**Scope.** Universal biological substrate for already-materialized cattle,
sheep, goats and pigs.  These are not historical claims about Novgorod,
husbandry routines, availability, pasture rights, stock, handling competence,
specific feed, ration, season, treatment or an animal's current condition.

## Sources independently opened

1. Donna M. Amaral-Phillips, University of Kentucky Department of Animal &
   Food Sciences, [*Why Cattle, Sheep, and Goats Can Eat
   Forages*](https://afs.mgcafe.uky.edu/content/why-cattle-sheep-and-goats-can-eat-forages).
   The complete page was read.  It identifies sheep, goats and beef/dairy
   cattle as ruminants; describes the rumen as a fermentation site; and explains
   bacterial digestion of grass/hay and forage fibre, fermentation products, and
   cud chewing.
2. University of New Hampshire Extension, [*Swine
   Nutrition*](https://extension.unh.edu/resource/swine-nutrition).  The
   complete “Nutrients” passage was read.  It classifies swine as monogastric
   omnivores and, relative to ruminants, describes their diets as generally
   higher in energy and lower in fibre; it says roughage has lesser importance,
   while naming limited contexts in which roughage/pasture can be used.

## Existing-corpus boundary

Existing `claim:fodder-healthy-horse-forage` already covers the separate
horse-forage relation.  The historical environment shard already records
archaeological cattle, sheep/goat and pig occurrence.  Neither is duplicated
below: these candidates supply the missing **biology**, not historical presence.

## Atomic candidates

| ID | Relation (RU / EN) | Evidence and directness | Qualifiers, use and hard limits |
|---|---|---|---|
| LB-01 | **Крупный рогатый скот, овцы и козы → относятся к → жвачным. / Cattle, sheep and goats → belong to → ruminants.** | UKY, opening paragraph: sheep, goats, beef and dairy cattle are considered ruminants; the source describes three forestomachs plus the true stomach. **Universal, direct/high.** | A biological membership relation only. It does not create an animal, determine age/health, prescribe keeping, or make every animal able to consume every plant. |
| LB-02 | **Рубец жвачного → является местом → ферментации кормов. / A ruminant rumen → is a site of → feed fermentation.** | UKY, opening paragraph calls the rumen “a large fermentation vat where the digestion of forages and other feeds takes place.” **Universal, direct/high** for a mature ruminant physiology relation. | Supports qualitative distinction from simple-stomached digestion when a real ruminant and feed are already in context. Not a ration, veterinary diagnosis, food-safety test, digestive outcome or historical practice. Young animals and individual health remain separate state. |
| LB-03 | **Рубцовые бактерии жвачного → способствуют перевариванию → травы, сена и иных фуражей. / Rumen bacteria in ruminants → help digest → grass, hay and other forages.** | UKY, second paragraph: bacteria help cow, sheep or goat digest feed such as grass or hay; later paragraphs state that some bacteria digest fibre in grasses and forages. **Universal, direct/high.** | A qualitative forage-digestion premise, not evidence that a particular forage is safe, available, sufficient, accepted, or correctly handled. It supplies no amount, season, pasture, stored feed or actor knowledge. |
| LB-04 | **Ферментационные продукты рубцовых бактерий → могут служить → источником энергии/нутриентов жвачного. / Rumen-bacterial fermentation products → can serve as → energy/nutrient sources for a ruminant.** | UKY, second and final paragraphs: bacterial products are used by the animals for energy/fuel and nutrient needs. **Universal, direct/high**, stated as a qualitative causal relation. | Do not turn this into a calorie model, conversion rate, productivity claim, disease conclusion or feeding result. Exact energy/body mechanics remain their owner’s responsibility. |
| LB-05 | **Свиньи → являются → однокамерными всеядными; по сравнению со жвачными их рацион обычно более энергетичен и менее волокнист. / Swine → are → monogastric omnivores; compared with ruminants their diets generally have higher energy and lower fibre.** | UNH Extension, **Nutrients**: “Swine are monogastric, omnivores and compared to ruminants, generally require diets higher in energy and lower in fiber.” **Universal, direct/high.** | This is a comparative biological constraint, not a grain whitelist or a ban on roughage/pasture. It gives no exact composition, amount, feed schedule, health/production inference or medieval practice. |
| LB-06 | **Грубые корма/пастбище → могут быть лишь контекстно используемы → в питании свиней. / Roughage/pasture → can be used only contextually → in swine feeding.** | UNH, **Nutrients** and **Gestation**: roughage is of lesser importance to swine, although named roughages and pasture can be used in particular contexts. **Universal, direct/high** for the qualified possibility. | Optional candidate, subordinate to LB-05. It must not imply that pasture alone is adequate, that any forage is safe, or that a pig has access to pasture; modern gestation management and quantities are excluded. |

## Suggested production boundary

All candidates are universal biology, should use `supported_fact` and
`domain_internal_only`, and must remain separate from regional historical
attestation.  Keep LB-01--LB-05 if independently verified; omit LB-06 if a
reviewer considers its qualified possibility too close to a feeding
recommendation.  No candidate is a per-species action handler or a recipe.
