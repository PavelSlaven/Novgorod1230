# Independent verification — garden ecology, dye, and emollient candidates

**Candidate commit:** `37e407817f0c8fd30e5d9b7b93ac8923de7ac979`
**Candidate file:** `production-v1/place-garden-birds-dyes-v1.json`
**Author:** `/root/place07_ecology_dye_research`
**Editorial integration:** `/root`
**Reviewer:** `/root/place06_verify_publish`
**Review basis:** separate source/domain reading of frozen candidate claims,
RU/EN localizations, evidence and exclusions. Reviewer did not author or alter
candidate claims.

## Source access actually checked

- [UC Statewide IPM, *Snails and Slugs*](https://ipm.ucanr.edu/home-and-landscape/snails-and-slugs/),
  UC ANR Publication 7427, authors C.A. Wilen and M.L. Flint: official page
  text and publication metadata read. It covers both snails and slugs; says
  they are most active at night and on cloudy/foggy days, seek hiding places
  from heat/light, make irregular smooth-edged leaf holes by scraping, and
  lists cabbage among plants seriously damaged. It is California garden IPM,
  not a local historical observation.
- [Iowa State University Extension, *Nuisance Birds: Damage
  Management*](https://naturalresources.extension.iastate.edu/encyclopedia/nuisance-birds-damage-management):
  official page text read. Its Rock Pigeons section states nesting on sheltered
  flat built structures, single/flock movement for roosting, feeding and
  flight, and greater congregation at abundant food resources. It is modern
  Iowa ecology; local law and nuisance-control recommendations do not transfer.
- [University of Vermont Extension, *Making Dyes from Your
  Garden*](https://www.uvm.edu/extension/news/making-dyes-your-garden), Nadie
  VanZandt, 25 April 2024: official page text read. It says roots, leaves and
  flowers can be dye sources, and gives sorrel and spinach foliage as a
  dark-green dye-bath example. It is modern garden guidance, not evidence of
  medieval/local sorrel or a universal recipe.
- [NHS, *Emollients*](https://www.nhs.uk/tests-and-treatments/emollients/),
  reviewed 24 October 2023: official page text read. It defines emollients as
  moisturising treatments that cover skin with a protective film trapping
  moisture; it distinguishes product types and says ointments suit very dry,
  thickened skin but should not be used on weeping eczema. This is modern
  clinical guidance, not evidence for ordinary fats, historical preparations or
  burn/infection treatment.

Local `browser-harness` was attempted first but Chrome CDP required user
approval for remote debugging. Official-page fallback was used; no paid/cloud
browser was used. `/root/place06_verify_publish/garden_source_navigation`
provided navigation only; no source passage or verdict is attributed to it.

## Verdicts

### `claim:place-garden-snails-and-slugs-can-favor-moist-sheltered-conditions` — APPROVE

**Evidence checked:** `evidence:place-garden-snails-slugs-moisture-activity`.

UC IPM directly covers both named groups and supports night/cloudy/foggy
activity, heat/light sheltering, and moisture reduction making habitat less
favourable. The candidate is conditional and excludes presence, abundance and
current activity; `medium` / `direct` is acceptable.

Limits: California garden-pest guidance only; no Novgorod 1230 attestation,
species identification, local weather, plot state, forecast, or rule for every
terrestrial gastropod.

### `claim:place-garden-snails-and-slugs-can-feed-on-cabbage-leaves-and-leave-irregular-holes` — APPROVE

**Evidence checked:** `evidence:place-garden-snails-slugs-cabbage-feeding`.

UC IPM states that both snails and slugs scrape irregular leaf holes and lists
cabbage among seriously damaged plants. The candidate correctly preserves
`can` and does not infer culprit identity from a single damaged plant.

Limits: no cabbage presence, actual pest, damage severity, local species, or
claim that every irregular hole has this cause.

### `claim:place-rock-pigeons-can-use-sheltered-built-sites-and-congregate-around-food` — APPROVE

**Evidence checked:** `evidence:place-garden-pigeon-built-sites-food`.

Iowa State Extension directly supports sheltered flat built nesting sites,
flocking during roosting/feeding/flight, and greater congregation around
abundant food. The candidate remains ecological and conditional.

Limits: modern Iowa source; no medieval/local pigeons, occupied building,
nest, food safety, offered-food outcome, legal status, control method or
materialized world fact.

### `claim:place-plant-leaves-can-serve-as-a-dye-source-with-sorrel-foliage-as-modern-example` — APPROVE

**Evidence checked:** `evidence:place-garden-leaf-dye-source`.

UVM explicitly identifies leaves as dye-source plant material and sorrel
foliage as a modern dark-green dye-bath example. The candidate accurately
marks the general relation as inferred and confines sorrel to a modern example.

Limits: no local/medieval sorrel, leaf stock, fibre, mordant, proportions,
colourfastness, recipe, or particular-batch outcome. The relation is universal
material chemistry, not historical craft availability.

### `claim:place-established-emollient-or-occlusive-skin-preparation-can-trap-moisture` — APPROVE

**Evidence checked:** `evidence:place-skin-emollient-protective-film`.

NHS directly says actual emollients form a protective film that traps moisture
and describes product-specific use for dry skin. The candidate's gate—an
actual emollient or occlusive preparation must first be established—prevents
transfer to arbitrary fat or oil.

Limits: no treatment prescription, diagnosis, cure, historical medicine,
recipe, composition, dose, burn use, infected-skin use, or weeping-skin use.
The NHS page itself distinguishes products and warns against ointment use on
weeping eczema.

## Decision

All five exact frozen claims and RU/EN texts are **APPROVE** within the stated
limits. Promotion still requires existing machine-readable per-claim
verification records bound to this candidate commit and current claim digests;
this report adds no ledger, descriptor, runtime bundle or activation.
