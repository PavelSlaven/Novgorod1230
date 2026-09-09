# Independent verification — wood moisture

**Scope:** `research/population-wood-moisture.md`, WM-01--WM-06 only. This
review concerns universal material behaviour, not historical availability,
scene wetness, an object's present moisture state, or an actor's knowledge.

## Source independently read

Samuel V. Glass and Samuel L. Zelinka, *Moisture Relations and Physical
Properties of Wood*, chapter 4, *Wood Handbook: Wood as an Engineering
Material*, FPL-GTR-282 (USDA Forest Service, 2021). The full chapter PDF was
opened in the browser via the authors' public full-text copy; the publication
record is the [USFS TreeSearch record 62243](https://research.fs.usda.gov/treesearch/62243)
and the canonical chapter URL is
[USFS chapter PDF](https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr282/chapter_04_fpl_gtr282.pdf).
The relevant pages visibly read were 4-8--4-9: **Liquid Water Absorption** and
**Dimensional Stability**. The USFS endpoints currently returned a service
block in this browser; that access failure does not substitute a secondary
claim for the identified USFS chapter.

| Candidate | Verdict | Production-safe wording | Checked anchor and rationale | Limits / knowledge boundary |
|---|---|---|---|---|
| WM-01 | **APPROVE_WITH_LIMITS** | Контакт древесины с жидкой водой может менять её влажность быстрее, чем сорбция водяного пара. / Contact between wood and liquid water can change its moisture content more rapidly than water-vapour sorption. | p. 4-8, **Liquid Water Absorption**, opening paragraph: liquid-water contact can induce rapid changes in wood moisture content, contrasted with slow vapour-sorption changes. | Requires actual liquid-water contact. It neither creates water nor establishes wetness, duration, amount absorbed, saturation, leakage, or damage. This qualitative effect may be narrated as `general_physical`; the comparative mechanism is not evidence of a medieval actor's theory. |
| WM-02 | **APPROVE_WITH_LIMITS** | Жидкая вода может поднять влажность древесины выше точки насыщения волокон; одна сорбция пара обычно этого не делает. / Liquid-water absorption can raise wood moisture above fibre saturation; water-vapour sorption alone usually cannot. | p. 4-8, opening paragraph: liquid water can bring moisture above fibre saturation, “in most cases” beyond vapour sorption alone. | Keep “может / can” and “обычно / usually”; no percentage, species-specific threshold, or present moisture state. Fibre saturation is a scientific internal condition (`domain_internal_only`), not automatic NPC knowledge. |
| WM-03 | **APPROVE_WITH_LIMITS** | При контакте с жидкой водой её поступление в древесину происходит капиллярным всасыванием в полостях клеток. / With liquid-water contact, water uptake in wood proceeds by capillary action (wicking) in cell lumina. | p. 4-8, paragraph beginning “The mechanism of water absorption”: names capillary action/wicking and explains water entering the lumina. | Applies to the stated contact and structure; not a permeability value or a guaranteed uptake rate. Capillary/cell-lumen explanation is `domain_internal_only`, not a general historical-knowledge fact. |
| WM-04 | **APPROVE_WITH_LIMITS** | При открытом торце жидкая вода поступает в древесину быстрее вдоль волокон; на поступление влияет и выход вытесняемого воздуха. / With exposed end grain, liquid-water uptake is faster along the grain; escape of displaced air also affects uptake. | p. 4-8, paragraph beginning “The rate of liquid water absorption”: fastest longitudinal rate when a transverse section/end grain is exposed; air escape affects absorption. | Conditional on exposed face, species, structure, liquid contact, and other listed factors. Do not infer a rate, quantity, a particular joint's failure, or a leak. This is a technical `domain_internal_only` premise. |
| WM-05 | **APPROVE_WITH_LIMITS** — amend, do not add | Existing `claim:population-material-wood-shrinkage` may be broadened in its localized wording: below fibre saturation, loss of bound water shrinks wood and gain of bound water swells it. / Below fibre saturation, loss of bound water shrinks wood and gain of bound water swells it. | p. 4-8, **Dimensional Stability**, first paragraph: below MCfs wood changes dimension as it gains moisture (swells) or loses moisture (shrinks), because bound water enters or leaves the cell wall. | One replacement/refinement of the existing shrinkage claim, not a new parallel claim. Runtime wording may state the observable dimensional change as `general_physical`; `bound_water` and fibre-saturation explanation remain scientific/internal. No current size, warp, check, split, or wetting event follows. |
| WM-06 | **APPROVE_WITH_LIMITS** — amend, do not add | The same existing claim may specify that wood usually changes dimension most tangentially, less radially, and only slightly along the grain. / The same existing claim may specify that wood usually changes dimension most tangentially, less radially, and only slightly along the grain. | p. 4-8--4-9, **Dimensional Stability**, paragraph beginning “With respect to dimensional stability”: tangential change is greatest, radial is about half as large, longitudinal slight. | Keep qualitative directional ordering in production; do not promote the approximate ratio into exact mechanics. This refines the existing “chiefly across grain” localization only, with no second shrinkage claim, board orientation, magnitude, crack, or joint result. Observable across-/along-grain distinction can remain `general_physical`. |

## Normalization boundary

WM-01--WM-04 are four distinct conditional liquid-water premises. They should
remain universal, conditional, qualitative, and non-historical. WM-05 and
WM-06 support a single edit of the existing
`claim:population-material-wood-shrinkage` and its RU/EN localizations; neither
justifies another claim ref. No candidate establishes a wet scene, supplies a
numeric mechanic, or grants a character scientific terminology.

## Exact production normalization check

**Verdict: APPROVE_WITH_LIMITS.** I read the normalized records and both RU/EN
localizations in `production-v1/material-response.json`. They faithfully apply
the above verdict without adding a historical assertion or a scene fact.

| Production claim ref | Exact-review result |
|---|---|
| `claim:wood-liquid-moisture-change` | Approved: conditional liquid-water-contact comparison; `general_physical` is appropriate for the qualitative observable effect, and the localization expressly excludes present water, duration, amount, and damage. |
| `claim:wood-liquid-fibre-saturation` | Approved: retains “can” / “usually,” has no threshold or present-state inference, and correctly uses `domain_internal_only`. |
| `claim:wood-liquid-capillary-uptake` | Approved: preserves the p. 4-8 capillary/cell-lumina mechanism, conditions it on liquid contact, and correctly uses `domain_internal_only`. |
| `claim:wood-liquid-directional-uptake` | Approved: preserves exposed end grain, faster longitudinal uptake, and displaced-air qualification; it does not invent a rate, leak, or failure and is correctly `domain_internal_only`. |
| `claim:population-material-wood-shrinkage` | Approved as the one amended existing claim: its canonical object and RU/EN text combine gain/loss below fibre saturation with the directional ordering. Because this one atomic record encodes bound water and fibre saturation, `domain_internal_only` is the minimally consistent class. It remains a conditional universal material fact, not a statement that any in-world wood is wet, swollen, dry, or damaged. |
