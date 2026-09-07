# Молочный сгусток, отцеживание и красильная ванна v1

## Scope

Candidate-only authoring for place-batch-02 core 024 and 055. It adds general causal premises, not present world state, a recipe, a safety limit, a promised result, a medieval availability assertion, or a local craft record. Milk has two universal process claims and one explicitly marked Novgorod-1200–1300 editorial straining relation. Dye has two general conditional process claims and one marked editorial Novgorod-1200–1300 work relation.

## Existing corpus checked

Full `production-v1/runtime-bundle.json` was searched for `milk`, `curd`, `whey`, `coagulat`, `casein`, `strain`, `drain`, `dyeing`, `dye uptake`, `fixation`, `mordant`, `evenness`, and `cooling`.

Existing `claim:practical-food-milk` only permits an editorial statement that available milk may become curds; it has no causal formation, separation, or straining premise. Existing `claim:textile-dye-application` and `claim:textile-dye-mordant-fixation` cover immersion and possible mordants, but explicitly do not establish bath conditions, uptake, or outcome. No duplicate claim was found for curd–whey partition, permeable straining, cooling’s evidentiary limit, preparation-related blotchiness, or textile movement for distributed bath contact.

## Sources actually read

- Food and Agriculture Organization of the United Nations, [*The technology of the main cheese varieties*](https://www.fao.org/4/t0755e/t0755e01.htm), FAO Animal Production and Health Paper 113, sections “Coagulation” and “Draining”. It describes enzymic and lactic-acid clotting, resulting curd, progressive curd–whey separation, and traditional draining bags or hoops. Used only for universal food-process relations; no historic Novgorod method is inferred.
- Utah State University Extension, [*A Home Dyer’s Garden, Part III: Dyeing With Japanese Indigo*](https://extension.usu.edu/yardandgarden/research/dyeing-with-japanese-indigo), “Preparing the Fabric” and dye-vat instructions. It says inadequate scouring can yield blotchy uptake and uses periodic movement to seek even dyeing. Its indigo-specific modern instructions support only narrow conditional process observations.
- University of Vermont Extension, [*Making Dyes from Your Garden*](https://www.uvm.edu/extension/news/making-dyes-your-garden), dye-bath step. It presents stirring to seek even colour. Used only as support for an editorial, non-guaranteeing contact-distribution relation.
- Hossain, Ismail; Moniruzzaman, Md.; Maniruzzaman, Md.; Jalil, Mohammad Abdul, [*Investigation of the effect of different process variables on color and physical properties of viscose and cotton knitted fabrics*](https://doi.org/10.1016/j.heliyon.2021.e07735), *Heliyon* 7 (2021), e07735, [full text](https://www.cell.com/heliyon/fulltext/S2405-8440(21)01838-7), §3.1.2–3.1.3 read. For its reactive dyes on cotton/viscose, it describes transfer from bath to fibre, diffusion inside fabric, and time/temperature effects around equilibrium. This supports a bounded transfer premise, not a universal monotonic temperature effect, natural-dye process, or medieval practice.

## Authoring limits and validation notes

- `place-milk-acid-or-enzymic-coagulation-can-form-curd` and `place-milk-fresh-curd-can-progressively-separate-from-whey` are scientific universal relations. They establish neither a particular milk batch, acid, enzyme, time, quantity, safety, yield, nor edible result.
- Permeable straining and textile movement are explicitly `editorial` reconstructions scoped to Novgorod Land 1200–1300. They require the relevant already-established objects and establish no cloth, sieve, vessel, bath, worker, technique, or successful outcome.
- Dye transfer into fibre is conditional on dye, fibre, contact time, and temperature. The wording deliberately rejects a universal “hotter is more” or “cooler is less” rule: cooling is one changing process condition, not evidence by itself of uptake, fixation, or evenness.
- No claim asserts modern technology, local availability, a named dye, mordant, recipe, temperature, duration, safety, current scene state, or historical attestation for Novgorod 1230.
- JSON parses successfully; candidate remains pending independent per-claim approval under WK §35.1. The candidate author is distinct from required verifier.
