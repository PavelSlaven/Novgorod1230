# Wood moisture and liquid-water research

**Status:** research only; no production authoring, approval, or registry
change.

## Existing coverage and duplicate boundary

`production-v1/material-response.json` already has:

- `claim:population-material-wood-moisture`: wood responds to surrounding
  moisture; and
- `claim:population-material-wood-shrinkage`: bound-water loss causes wood
  shrinkage, chiefly across grain.

These candidates do not repeat general vapour exchange or assert an actual wet
object. The two dimensional candidates below would refine the existing broad
shrinkage wording only if independently approved; they should not be added as
near-duplicate claims.

## Source and direct reading

Samuel V. Glass and Samuel L. Zelinka, [*Moisture Relations and Physical
Properties of Wood*, chapter 4, *Wood Handbook: Wood as an Engineering
Material*, FPL-GTR-282 (USDA Forest Service, 2021)](https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr282/chapter_04_fpl_gtr282.pdf),
pp. 4-1--4-22; USFS TreeSearch record
[62243](https://research.fs.usda.gov/treesearch/62243).

The full chapter was read. Browser-harness opened the USFS record, which
returned a service block for the direct page; a browser search exposed the
official chapter-PDF URL and its complete source text was then read through the
available PDF reader. The relevant sections are **Liquid Water Absorption**
(pp. 4-7--4-9) and **Dimensional Stability** (pp. 4-9--4-10).

## Candidate premises

| ID | Atomic premise | Exact source anchor | Conditions and exclusion |
|---|---|---|---|
| WM-01 | Contact with liquid water can change wood moisture content more rapidly than water-vapour sorption. | p. 4-7, “Liquid Water Absorption,” opening paragraph | Applies only to actual liquid-water contact. It does not identify rain, a spill, a wet object, duration, uptake amount, or saturation. |
| WM-02 | Liquid-water absorption can raise wood moisture above fibre saturation, while vapour sorption alone ordinarily cannot. | p. 4-7, “Liquid Water Absorption,” opening paragraph | Conditional comparison of pathways; no fibre-saturation percentage, species, or current moisture state is supplied. |
| WM-03 | Liquid-water uptake in wood proceeds by capillary action (wicking) in cell lumina. | p. 4-7, “Liquid Water Absorption,” paragraph beginning “The mechanism of water absorption” | Requires exposed liquid water and relevant wood structure. It is not a permeability value, a guarantee of uptake, or a source of water. |
| WM-04 | Liquid-water uptake is fastest longitudinally when end grain is exposed; escape of displaced air also affects uptake. | p. 4-8, “Liquid Water Absorption,” paragraph beginning “The rate of liquid water absorption” | Direction, exposed face, species and actual structure matter. No rate, quantity, leak, or failure outcome follows. |
| WM-05 | Below fibre saturation, increasing bound water swells wood and decreasing it shrinks wood. | p. 4-9, “Dimensional Stability,” first paragraph | This would refine, not duplicate, the existing loss/shrinkage claim. It does not establish a current dimension, warping, checking, splitting, or wetting event. |
| WM-06 | Below fibre saturation, dimensional change is greatest tangentially, about half as large radially, and slight longitudinally. | pp. 4-9--4-10, “Dimensional Stability,” paragraph beginning “With respect to dimensional stability” | Candidate replacement/refinement for the existing “chiefly across grain” wording, not an additional parallel claim. No board orientation, magnitude, crack, or joint outcome is implied. |

## Non-candidates

The chapter mentions warping, checking, splitting, and product examples after
large service moisture fluctuations. They are not proposed here: those outcomes
need object geometry, restraint, exposure history, wood species, and world
state. Standard test coefficients and reported softwood absorption ranges are
also omitted because they do not describe an unspecified in-game wood object.
