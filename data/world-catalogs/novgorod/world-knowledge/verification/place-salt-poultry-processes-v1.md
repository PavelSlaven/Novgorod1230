# Independent verification — salt and poultry process candidates

**Candidate commit:** `e7a6d401f14d11e980401a916bb9bef94540be79`
**Candidate file:** `production-v1/place-salt-poultry-processes-v1.json`
**Author:** `/root/place06_salt_poultry`
**Reviewer:** `/root/place06_verify_publish`
**Review basis:** separate source/domain review of exact candidate claims, their
RU/EN localizations, cited evidence, and stated exclusions. Reviewer did not
author or alter candidate claims.

## Source access actually checked

- [Langlet et al., *Chemical Engineering Science* 86 (2013), 78–86, DOI
  10.1016/j.ces.2012.05.014](https://doi.org/10.1016/j.ces.2012.05.014):
  publisher-indexed title, abstract, DOI, journal, date and pages read. The
  publisher full text was blocked (403). Its indexed abstract describes
  capillary condensation at particle contacts, dissolution, evaporation and
  recrystallization in controlled sodium chloride; bibliographic index checked
  the six stated authors. This is controlled modern NaCl research, not a
  storage observation for a particular salt stock.
- [Mauer & Taylor, *Water-Solids Interactions: Deliquescence*, DOI
  10.1146/annurev.food.080708.100915](https://pubmed.ncbi.nlm.nih.gov/22129329/):
  PubMed metadata and abstract read. They confirm the two authors, 2010,
  volume 1, pp. 41–63 and DOI; the abstract states ingredient-specific
  deliquescence and that RH fluctuation can cycle deliquescence/efflorescence
  and contribute to agglomeration/caking. Full review was not read.
- [Jacquie Jacob, *Raising Geese in Small or Backyard
  Flocks*](https://poultry.extension.org/articles/poultry-management/raising-geese-in-small-or-backyard-flocks/):
  page text read. It states that geese have a strong flocking instinct and can
  be herded from one area to another. This is modern extension guidance.
- [Jacobs & Clauer, *Transporting Poultry in a Humane
  Manner*](https://www.pubs.ext.vt.edu/content/pubs_ext_vt_edu/en/2902/2902-1088/2902-1088.html):
  Virginia Cooperative Extension page text, author names and publication date
  read. It states noisy/aggressive catching can cause panic and injury and
  advises quiet, calm approach; its poultry transport guidance expressly lists
  ducks and geese among the birds covered by its space guidance.
- [NSW Department of Education, *Ducks and Geese —
  handling*](https://education.nsw.gov.au/teaching-and-learning/animals-in-schools/animals-in-schools-species/poultry-ducks-geese/ducks-and-geese-handling):
  corroborative government guidance read. It directly covers ducks and geese,
  says loud noise/sudden movement prompts flight response, advises slow quiet
  entry, and says calm/gentle handling and slow movement behind free-range
  birds can direct them into a smaller enclosure. It is a modern school-animal
  guide, not cited candidate evidence and not a historical source.

Local `browser-harness` could not connect: Chrome required user approval for
remote debugging. The official/public-page fallback above was used; no paid or
cloud browser was used. `/root/place06_verify_publish/source_research` supplied
search navigation only; no verdict or source passage is attributed to it.

## Verdicts

### `claim:place-salt-moisture-at-particle-contacts-can-cake-through-dissolution-and-recrystallization` — APPROVE

**Evidence checked:** `evidence:place-salt-poultry-nacl-caking`,
`evidence:place-salt-poultry-mixture-deliquescence`.

The claim accurately states a conditional, qualitative NaCl/common-salt
mechanism: moisture at contacts can allow dissolution and later
recrystallized bridges, so caking can follow changing conditions. The cited
study supports the NaCl contact/dissolution/recrystallization mechanism; the
review supports composition sensitivity and RH-cycle caking. `medium` /
`inferred` is appropriate.

Limits: no claim about one container, humidity threshold, purity, duration,
temperature, amount, current stock state, historical storage practice, or
guaranteed caking. “Common salt based on sodium chloride” is a bounded modern
chemical analogue, not a claim that every historical salt sample was pure NaCl.

### `claim:place-domestic-geese-can-move-as-a-flock-when-herded` — APPROVE

**Evidence checked:** `evidence:place-salt-poultry-geese-flocking`.

The extension page directly states strong flocking instinct and that geese can
be herded from one area to another. The submitted `can` wording and exclusions
preserve that limited relation. `medium` confidence is conservative for a
modern husbandry analogue.

Limits: no Novgorod-1230/local attestation, present flock, number, owner,
route, destination, command response, or successful gathering follows. It is
not an action/animal-presence permission.

### `claim:place-poultry-approach-and-movement-can-affect-response-without-guaranteed-control` — APPROVE

**Evidence checked:** `evidence:place-salt-poultry-calm-approach`.

Virginia Cooperative Extension directly advises quiet, calm approach because
noisy/aggressive catching can panic and injure poultry; its scope includes
ducks and geese. The candidate correctly keeps the broader behavioural
conclusion conditional and labels it `inferred`. NSW guidance independently
corroborates the duck/goose-specific quiet, slow approach relation.

Limits: this is modern handling guidance, not a universal training rule or
guarantee. It establishes neither command/whistle obedience, control of a
particular bird, species-wide temperament, sheep-behaviour transfer, local
historical custom, nor current world state.

## Decision

All three exact candidate claims and RU/EN texts are **APPROVE** within the
listed limits. Production promotion still requires the existing machine-readable
per-claim verification records bound to this exact candidate commit and current
claim digests; this review adds no ledger entry or activation.
