# Independent verification — livestock-biology candidates

**Scope:** independent verification of LB-01–LB-06 in
`research/population-livestock-biology.md`. This verifies universal animal
biology only. It does not attest medieval Novgorod practice, a herd, pasture,
feed stock, ration, season, actor knowledge, handling competence, health or a
present animal.

## Independently opened sources

1. Donna M. Amaral-Phillips, University of Kentucky Department of Animal &
   Food Sciences, [*Why Cattle, Sheep, and Goats Can Eat
   Forages*](https://afs.mgcafe.uky.edu/content/why-cattle-sheep-and-goats-can-eat-forages).
   The complete public HTML was independently read. Its first four paragraphs
   state the ruminant membership; call the rumen a fermentation site; describe
   bacterial digestion of grass, hay and forage fibre; and state that bacterial
   products are used as nutrient and energy/fuel sources.
2. University of New Hampshire Extension, [*Swine
   Nutrition*](https://extension.unh.edu/resource/swine-nutrition), complete
   public HTML, especially **Nutrients**. It calls swine monogastric omnivores
   and says that, compared with ruminants, they generally require higher-energy,
   lower-fibre diets. The same passage says roughage is of lesser importance,
   while describing particular modern management use of roughages/pasture.

## Candidate verdicts

| ID | Verdict | Independently checked basis | Approved wording (RU / EN) and limits |
| --- | --- | --- | --- |
| LB-01 | **APPROVE_WITH_LIMITS** | UKY: «Sheep, goats, beef and dairy cattle … are all considered ruminants.» | **Крупный рогатый скот, овцы и козы относятся к жвачным.** / **Cattle, sheep, and goats are ruminants.** Universal biological classification only. It does not materialize an animal, determine its age or health, prescribe husbandry, or make every plant edible or safe. |
| LB-02 | **APPROVE_WITH_LIMITS** | UKY calls the rumen «a large fermentation vat where the digestion of forages and other feeds takes place.» | **Рубец жвачного является местом ферментации кормов.** / **A ruminant rumen is a site of feed fermentation.** This is qualitative physiology when an actual ruminant and feed are already in context. It supplies no diagnosis, ration, safety test, digestive outcome, historical practice or individual condition. |
| LB-03 | **APPROVE_WITH_LIMITS** | UKY: rumen bacteria help cow, sheep or goat digest grass or hay; some bacteria digest fibre in grasses and other forages. | **Рубцовые бактерии жвачного способствуют перевариванию травы, сена и иных фуражей.** / **Rumen bacteria in ruminants help digest grass, hay, and other forages.** It is a qualitative digestive relation, not proof that a specified forage is safe, present, sufficient, accepted, properly handled, or available in a season. No amount, pasture, stored feed, actor knowledge or husbandry routine follows. |
| LB-04 | **APPROVE_WITH_LIMITS** | UKY says bacterial products are used by the animals and identifies volatile fatty acids as energy/fuel sources; it also describes microbial protein as supplying protein needs. | **Продукты ферментации рубцовых бактерий могут служить жвачному источником энергии и питательных веществ.** / **Rumen-bacterial fermentation products can serve as energy and nutrient sources for a ruminant.** Preserve «могут / can»: no calorie calculation, feed conversion, productivity, growth, milk, meat, health or feeding-result inference is approved. |
| LB-05 | **APPROVE_WITH_LIMITS** | UNH **Nutrients**: «Swine are monogastric, omnivores and compared to ruminants, generally require diets higher in energy and lower in fiber.» | **Свиньи — однокамерные всеядные; по сравнению со жвачными их рацион обычно требует больше энергии и меньше волокна.** / **Swine are monogastric omnivores; compared with ruminants, their diets generally require higher energy and lower fibre.** This is a general comparative nutritional constraint, not a grain whitelist, dose, ration, feeding schedule, health/production inference, historical fact or prohibition on all roughage. |
| LB-06 | **REJECT_AS_OUT_OF_SCOPE** | UNH does say that roughages/pasture can be economically used, particularly with gestating sows. But that statement is a modern husbandry-management application, not a species-wide biological mechanism. The adjacent universal comparative fibre relation is already retained in LB-05. | Do not author this candidate in the universal-biology shard. It cannot support pasture availability, a gestating sow, access, historical feeding, an actor instruction, or adequacy of pasture/roughage. A separately scoped, historically dated husbandry source would be needed for any local practice relation. |

## Boundary

LB-01–LB-05 are production-eligible only with their exact universal and
qualitative limits. They must remain separate from the existing archaeological
occurrence claims and from horse-forage material. LB-06 is not eligible in this
scope: retaining it would silently turn a modern management example into a
historical or universal-practice premise.

## Exact normalization check — `production-v1/biology-physiology.json`

**Verdict: APPROVE_WITH_LIMITS passed.** The six normalized claims faithfully
split the approved premises: ruminant membership, rumen fermentation,
rumen-bacterial forage digestion, fermentation-product energy/nutrients,
swine membership, and swine comparative diet. LB-06 has not been authored.

`source:uky-ruminant-forage` / `evidence:uky-ruminant-forage` and
`source:unh-swine-nutrition` / `evidence:unh-swine-nutrition` have the exact
opened URLs and respectively constrain the source material to the approved
qualitative relations. The six structured literal objects preserve the same
causal direction and limits. All claims use `supported_fact`, universal scope,
`common` / high / direct qualifiers and `domain_internal_only`; no registry,
schema or mapping was changed.

The normalized RU/EN runtime texts retain the exclusions: no present animal,
historical practice, ration, dosage, stock, pasture access, feed safety,
health, productivity or feeding outcome. In particular,
`claim:livestock-rumen-fermentation` explicitly limits its object and both
localizations to **mature ruminant physiology**; individual age and condition
remain separate conditions. The two added concepts are scoped biological
categories, not animal materialization or actor knowledge.
