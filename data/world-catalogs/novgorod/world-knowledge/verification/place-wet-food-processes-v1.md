# Independent verification: wet food and hide process claims

Initial candidate commit: `71199d0fcff71038a89bc330c3a545e676c85130`.
Rebound-claim candidate commit: `f4a9f01b19ef03df5ebb4ee07a79d75e17027073`.

Verifier: `/root/place_scene_b`. Candidate authors are `/root/place_scene_a` and
the repository editorial source; verifier is not an author. External source text
was read at the cited URLs. Modern process evidence is used only for universal,
conditional relations, never for Novgorod 1230 practice or scene state.

## Verdicts

| Claim | Verdict | Evidence checked | Limits preserved |
| --- | --- | --- | --- |
| `claim:place-wet-hide-preparation-can-combine-washing-and-removal-of-attached-residue` | **APPROVE** | At `f4a9f01b`, the claim is bound to EPA *Leather tanning and finishing development document*. Its process description states soak/wash, then fleshing when not previously performed, and defines fleshing as removal of flesh, fat, and muscle; fleshings are isolated as solid waste. | It remains universal and conditional; no hide, water, tool, medieval recipe, workshop, or outcome follows. |
| `claim:place-wet-hide-work-can-leave-liquid-effluent-and-removable-organic-residue` | **APPROVE** | UNIDO pp. 10–12 distinguishes soaking and fleshing effluents, directs stream segregation, and pp. 63–64 identifies fleshing residues as removable gross solids. | No pollution level, smell, water body, disposal method, volume, or present workshop follows. |
| `claim:place-wet-work-can-separate-work-water-from-water-reserved-for-clean-task` | **APPROVE** | Editorial relation is tautly conditional: established separate vessels, surfaces, or flow paths can avoid direct mixing. | It is editorial, not a layout, water-quality finding, universal rule, or scene fact. |
| `claim:place-fish-smoking-preservation-depends-on-combined-smoke-drying-heat-and-optional-salt` | **APPROVE** | FAO *Fish and fish products*, lines 58–66 and 108–131, states curing combinations, lowered moisture, smoke compounds, heat, hot/cold difference, and conditional salting/drying effect. | No recipe, duration, temperature, stock, safety, or batch outcome follows. |
| `claim:place-fish-smoking-sensory-signs-do-not-establish-safety-or-storage-outcome` | **APPROVE** | FAO *Smoked Fish Recommended Practice for Retailers*, lines 13 and 27–42, says preservation may be slight, colour is unreliable, and smoke smell can mask deterioration. | Sensory description remains allowed; no safety or storage conclusion follows from it alone. |

Result: **APPROVE**. No reviewer finding changes the stated limits.

## Review history

At initial commit `71199d0fcff71038a89bc330c3a545e676c85130`, this verifier
rejected the hide-preparation claim because its sole evidence binding was UNIDO,
which establishes wastewater categories but not the claimed sequence. Commit
`f4a9f01b19ef03df5ebb4ee07a79d75e17027073` adds and binds the EPA primary
source only for that claim. The EPA source was click-read before the rebound
verdict; other eight candidate claims and the changed drying claim were not
re-reviewed because their payloads did not change.

At `d89f2004f5d55e7262f60192c932e260d5a85c1c`, only
`claim:place-wet-work-can-separate-work-water-from-water-reserved-for-clean-task`
changed: its architecture-settlement applicability is now bounded to
Novgorod Land, 1200–1300. The editorial evidence, claim text, directness and
limits are unchanged. **APPROVE**: the narrower contextual applicability
matches the editorial reconstruction scope and does not materialize a layout,
water state or universal household rule. The other nine reviewed payloads were
not re-reviewed.
