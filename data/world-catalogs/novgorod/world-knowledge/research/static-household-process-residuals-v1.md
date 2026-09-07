# Household process residuals v1 — research only

**Status:** static research input, not an authoring fragment, approval, production
claim, recipe, inventory assertion, or scene-state rule. Potential open-RPG consumers
are sufficient for this map; none requires an active profile. A separate verifier must
re-read every source before any controlled authoring.

**Draft artifact status:** `research/static-household-process-candidates-v1.json`
contains compiler-shaped records solely for later independent verification. It is a
draft, is not approved for production, is absent from every descriptor and has no
verification, ledger, runtime bundle or promotion. Per-record `review_status` remains
the compiler-required structural value only; it is not an approval decision.

## Method and duplicate check

Read the current production pack before source work. The three need families are not
empty buckets:

| Need family | Existing compositional coverage | Boundary that remains outside World Knowledge |
| --- | --- | --- |
| `household-textile-transformation-lifecycle` | `claim:textile-fibres-twist-yarn`; `claim:population-processes-weaving-thread`; `claim:population-processes-weaving-textile`; `claim:population-weaving-practice`; `claim:clothing-tunic-shirt-folded-panel`; `claim:clothing-shirt-gussets`; `claim:fibre-flax-breaker-shive`; `claim:fibre-hackle-removes-shive` | Actual fibre/cloth/garment, tool, skill, dimensions, seam state, time, wear and result are material, item and process state. The residual factual relation is only qualified textile repair by stitching; the pack has net repair, not a textile-stitch relation. |
| `leather-object-making-and-repair` | `claim:population-hide-leather-distinction`; `claim:vegetable-tanning-prepared-hide`; `claim:vegetable-tanning-collagen-stabilization`; `claim:population-shoe-input`; `claim:population-shoe-form`; `claim:population-shoe-output`; `claim:material-water-vegetable-leather-water` | Historical Novgorod shoemaking **and repair** are already covered. No generic tanning recipe, leather stock, object form, repair success, ownership, durability or mechanical strength is missing. One narrow component-joining/failure relation remains potentially useful and is proposed below. |
| `ordinary-cooking-handling-and-cross-contact` | `claim:heating-reduces-microbial-viability`; `claim:food-preservation-qualitative`; `claim:foundations-life-44-pathogen-transport`; `claim:foundations-haz-02-exposure-not-illness`; `claim:foundations-haz-03-exposure-routes` | The pack does not expressly relate raw food, hands/utensils, and already cooked or ready-to-eat food as a cross-contact path. Food presence, contamination, pathogen, cleaning action, thermal exposure, dose, illness and safety outcome are code/state or unresolved facts. |

Browser Harness was attempted first and was unavailable in this shell (`browser-harness:
command not found`). The exact official source pages below were then read with the
available web reader. They are modern universal technical/conservation sources, not
evidence of medieval Novgorod practice or present objects.

## Residual research-only candidates

### HHP-01 — stitched textile support/repair

- **Candidate relation:** stitching can secure a torn, frayed, or weak textile area to
  a support textile.
- **RU:** «Стежки могут закреплять порванный, осыпающийся или ослабленный участок
  текстиля на поддерживающей ткани.»
- **EN:** “Stitching can secure a torn, frayed, or weak textile area to a support
  textile.”
- **Exact source / anchor:** Canadian Conservation Institute, *Stitches Used in Textile
  Conservation*, section **“Attaching Fragile Textiles to Support Fabrics —
  Self-couching stitch”**: the stitch secures torn, frayed, or weak areas to a support
  fabric. [Official CCI page](https://www.canada.ca/en/conservation-institute/services/conservation-preservation-publications/canadian-conservation-institute-notes/stitches-textile-conservation.html).
- **Evidence type:** direct government conservation-technical guidance; this is a
  modern conditional material-handling relation, not historical presence/practice.
- **Why not duplicate:** `claim:fishing-net-mending-or-worn-part-replacement-can-prolong-serviceability`
  concerns nets; it does not state a textile stitching relation. Existing textile
  claims cover fibre-to-yarn, weaving and historical garment form, not repair support.
- **Limits:** Requires a textile, damage/weakness, thread/support and an actual
  operation; it does not assert a needle, fibre type, historical sewing practice,
  successful restoration, original strength, appearance, time, actor skill, stock or
  item identity. It is not a repair recipe.

### HHP-02 — stitched leather assembly can separate when stitches fail

- **Candidate relation:** in a leather assembly whose components are joined by
  stitching, failure of the joining stitches can separate the components.
- **RU:** «В кожаном изделии, части которого соединены стежками, разрушение
  соединяющих стежков может привести к разделению частей.»
- **EN:** “In a leather assembly whose components are joined by stitching, failure of
  the joining stitches can separate the components.”
- **Exact source / anchor:** U.S. National Park Service, *Conserve O Gram 9/1: Fatty
  Acid Spew on Leather Objects*, paragraph beginning **“The stitching attaching the
  sides to the sole…”**: weakened/broken stitches separated the shoe parts.
  [Official NPS record](https://www.nps.gov/articles/conserve-o-gram-9-1-leather-dressings.htm).
- **Evidence type:** direct documented conservation observation of a stitched leather
  shoe; candidate wording is deliberately conditional on the joining mechanism. It is
  not evidence that every leather object is stitched.
- **Why not duplicate:** `claim:population-shoe-output` gives historical
  shoemaking/repair as crafts, while `claim:population-shoe-form` records components
  and lasts. Neither states the conditional mechanical relation between a stitched
  join and component separation.
- **Limits:** No leather object, stitch type, seam condition, load, cause of failure,
  repair method, durability, historical local practice, stock, owner or outcome is
  inferred. Exact damage and item persistence remain their owners' responsibility.

### HHP-03 — raw-food cross-contact through hands or utensils

- **Candidate relation:** harmful bacteria can be transferred from raw food to other
  food through hands or utensils; this includes contact with cooked or ready-to-eat
  food.
- **RU:** «Вредные бактерии могут переноситься с сырой пищи на другую пищу через
  руки или кухонную утварь, в том числе на приготовленную или готовую к употреблению
  пищу.»
- **EN:** “Harmful bacteria can be transferred from raw food to other food through
  hands or utensils, including cooked or ready-to-eat food.”
- **Exact source / anchor:** USDA Food Safety and Inspection Service, **“What is
  Cross-Contamination?”**, opening definition and following sentence on raw meat,
  poultry, eggs and seafood versus already cooked/ready-to-eat food.
  [Official FSIS page](https://ask.fsis.usda.gov/article/What-is-Cross-Contamination).
- **Evidence type:** direct official food-safety mechanism, modern and universal in
  scope; it neither establishes that a particular raw food carries bacteria nor that
  transfer occurs in a scene.
- **Why not duplicate:** `claim:foundations-life-44-pathogen-transport` lists
  contaminated equipment and food as possible routes but does not state this
  raw-to-ready/cooked transfer relation. `claim:heating-reduces-microbial-viability`
  covers heating, not post- or cross-contact.
- **Limits:** No specific food, pathogen, hands, utensil, cleanliness, contamination,
  dose, illness, safety, cooking result, historical kitchen practice or player advice.
  The claim must not make all raw food contaminated or all ready-to-eat food unsafe.

## Excluded false gaps

- Do not author a duplicate “fibre → yarn,” “thread → woven textile,” “prepared hide
  → vegetable tanning,” “shoemaking/repair existed,” or generic “heating reduces
  microbes” fact: each is already in the pack above.
- Do not convert HHP-01 or HHP-02 into a recipe, a claim that repair restores original
  strength, or evidence for a medieval tool/material stock.
- Do not convert HHP-03 into contamination, illness, a hygiene mandate, a cooking
  temperature, or a current kitchen state.

**Candidate count: 3.** All are proposed research inputs pending independent source
verification; no production artifact, descriptor, ledger, vector or runtime surface
was changed.
