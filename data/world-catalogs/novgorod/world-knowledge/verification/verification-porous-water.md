# Independent verification: porous-material water candidates

Independently reopened primary/owner sources named in
`research/population-porous-water.md`: OpenStax *College Physics 2e* §11.8
and the USGS *Water Science Glossary* entries `percolation`, `permeability`,
and `porosity`. This verification approves no production record or material
handler.

| Candidate | Verdict | Production-safe scope and limits |
| --- | --- | --- |
| PW-01 | APPROVE_WITH_LIMITS | Relative cohesive liquid and adhesive liquid-surface forces determine contact-angle behaviour: greater relative cohesion favours droplets; adhesion can flatten a drop. This is an interface-pair relation, not porosity, permeability, absorbency, wetted area, friction, or a fact about a particular object. |
| PW-02 | APPROVE_WITH_LIMITS | Capillary action can raise or suppress a liquid in a narrow tube according to liquid-solid combination/contact angle. A porous material is not thereby a capillary tube or connected path; no rate, source, direction, or uptake follows. |
| PW-03 | APPROVE_WITH_LIMITS | For the stated vertical capillary model, equilibrium height depends on surface tension, contact angle, radius, density, and gravity; sign follows contact angle and smaller radius gives greater magnitude of rise where rise occurs. It supplies no number or direction for an unspecified pore network. OpenStax's tree example also shows capillary action alone need not explain large-scale transport. |
| PW-04 | APPROVE_WITH_LIMITS | Percolation is movement of water through openings in rock or soil. It requires both water and actual openings; it does not establish a connected path, local infiltration rate, accessible source, or scene quantity. |
| PW-05 | APPROVE_WITH_LIMITS | Permeability is capacity to pass a liquid. USGS further says water movement depends not merely on porosity magnitude but on void size and interconnection. Do not turn this into an object-specific permeability, throughput, or volume; porosity and permeability remain distinct properties. |
| PW-06 | APPROVE_WITH_LIMITS | For water movement, total porosity alone is insufficient: USGS distinguishes void size and open/interconnected from closed/isolated pores, and gives high-porosity clay as a poor aquifer example. Do not equate roughness, wetting, absorbency, or generic porosity with a connected flow path. |

## Source anchors and counterexamples

- OpenStax, [§11.8](https://openstax.org/books/college-physics-2e/pages/11-8-cohesion-and-adhesion-in-liquids-surface-tension-and-capillary-action), defines cohesion/adhesion and contact angle; its capillary discussion states that the liquid may rise or be suppressed by substance combination and gives equation 11.51. Its redwood example rejects capillary action alone for the asserted 100 m rise.
- USGS, [Water Science Glossary](https://www.usgs.gov/water-science-school/science/water-science-glossary), defines percolation as water movement through openings in rock/soil and permeability as liquid-passage capacity. Its porosity entry makes pore size and interconnection material to water movement and supplies clay as counterexample to equating high porosity with useful through-flow.

All six candidates are eligible only with these limits. None establishes a water
source, wetness, porosity, connected pores, permeability, friction result,
damage, drying time, material inventory, or present scene state.

## Exact normalization approval

Reviewed `production-v1/porous-water.json` against the approved candidate
limits. It has five non-duplicating claims and three concepts; PW-05 and PW-06
correctly share the one permeability/porosity relation. Every claim has one
canonical record, both RU and EN runtime localizations, universal applicability,
and `domain_internal_only` access.

| Candidate coverage | Canonical claim | Verdict | Exact boundary retained |
| --- | --- | --- | --- |
| PW-01 | `claim:water-wetting-forces` | APPROVE | Contact-angle interface relation only; runtime text excludes porosity, permeability, and friction result. |
| PW-02 | `claim:water-capillary-rise-depression` | APPROVE | Narrow-tube/liquid-solid/contact-angle conditions retained; no capillary path, present water, or uptake inferred. |
| PW-03 | `claim:water-capillary-height` | APPROVE | Vertical equilibrium model and all five variables retained; no unspecified-pore-network height, direction, or flow rate. |
| PW-04 | `claim:water-percolation-openings` | APPROVE | Restricted to water through actual openings in rock or soil; no connected path, rate, source, or scene quantity. |
| PW-05 + PW-06 | `claim:water-permeability-connected-pores` | APPROVE | Keeps permeability/porosity distinct and requires void size plus interconnection; isolated/high-porosity pores do not establish through-flow. |

`source:openstax` is an existing source with a new section-specific evidence
anchor. `source:usgs-water-glossary` and its evidence anchor identify the three
checked glossary entries. Existing predicates (`depends_on`, `can_produce`,
`requires_condition`) are appropriate; no new predicate or special runtime
path is introduced.
