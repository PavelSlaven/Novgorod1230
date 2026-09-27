# Фауна: дикие звери и птицы (game-base-v1, collector candidate)

Status: **candidate**. The collector did not approve this data. Each domain needs a separate approval pass (Opus high or the owner, WR §21.1).
Domains: `fauna_mammals`, `fauna_birds` (catalog.json, group `fauna-mammals-birds`).

## Files and row counts

The counts below come from `build-report.json` and `validation-report.json`, which the scripts write.

| File | Rows | What |
|---|---:|---|
| `fauna/mammals.csv` | 44 | Wild mammal taxa: names, seasonal states (rut, hibernation, moult, winter coat), activity time, signs for prose (tracks, droppings, feeding signs, dens/lodges/dams, sounds, smell), behaviour toward humans, danger, products, hunting methods with MASTER gear refs, WK refs |
| `fauna/birds.csv` | 149 | Wild bird taxa: names, migration status for each of the 4 seasons, voice, audible seasons, nesting, game value, falconry relevance, regional-list evidence (Пантелеев 2001 / Петров 1885), Мальчевский page |
| `fauna/wild_habitat_presence.csv` | 4231 | taxon × place_family × season: `frequency_class`, weight 8/4/2/1, habitat fit, state (active, dormant, breeding, passage, wintering, resident, irregular), `activity_time`, `audible`, observable sign types, `refresh_class=by_year_season` |
| `fauna/fauna_categories.csv` | 220 | Category nodes in domain `fauna`: `fauna.mammal`, `fauna.bird`, 25 group nodes, 193 taxon nodes. Every taxon row and presence row has a `category_ref` |
| `fauna/taxa_checks.csv` | 27 | Taxa checked for 1230 and the verdict for each: 6 included as rare, 4 included reduced or rural-only, 7 excluded as doubtful, 2 excluded as unattested, 8 excluded as anachronisms |
| `fauna/sources.csv` | 21 | Source register: level, read depth (full, extract, abstract, bibliographic) and URL |

Composition. Mammals: 4 ungulates, 2 large predators, 11 fur-bearing and small mustelids and other predators, 2 fur rodents, 1 hare, 18 small mammals (insectivores and rodents), 5 bats, 1 seal (Ladoga only).
Birds: 15 waterfowl, 17 raptors, 8 owls, 6 gamebirds, 11 waders, 7 woodpeckers, 8 corvids, 57 passerines and others. Falconry: 6 falconry birds, 26 quarry species.
Presence rows by season: winter 768, spring 1175, summer 1132, autumn 1156. By class: ubiquitous 287, common 1125, contextual 1374, rare 1445. By kind: mammals 1388, birds 2843. The rows cover 38 place families.

## Universal layer vs regional layer

- Taxa and their biology are **universal** (`scope=universal_taxon`), and the categories have `universal=true`. The region lives only in presence rows (`region_id=novgorod_land`; the Ladoga seal has `ladoga_lake`) and in `region_scope`. For another region, add presence rows. Do not copy the taxon rows.
- `category_ref` has the form `fauna.<mammal|bird>.<group>.<slug>`. The collector `places-binding/scripts/build-category-registry.mjs` picks these up from `fauna_categories.csv`. No common root `fauna` is defined because a sibling fauna group may define one. The owner of category_registry decides the root.

## Method

1. **Existing knowledge first.**
   - WK production-v1: fauna-mammals, fauna-ecology, static-animal-context-b06, static-weather-traces-b06, agriculture-fauna, environment-p1, foundation. Their approved concept and claim ids are in `wk_refs`, and `validate.cjs` checks that each id exists.
   - Research notes environment-agriculture-fauna.md (FAU-02..04) and population-fauna-mammals-winter.md.
   - MASTER: game ingredients ING0113–0119 and hunting gear hnt0001–0028. The D-rated items hnt0022, hnt0024 and hnt0028 are forbidden and checked by script.
   - pr98 m2c-nature-coverage.json: 42 concepts, none of them species pools.
2. **Real gaps closed with sources** (see `fauna/sources.csv`):
   - Regional bird list: Пантелеев 2001. 149 of 149 birds are matched, 120 of them with Петров 1885 records for Приильменье.
   - Status, abundance, arrival and departure: Мальчевский & Пукинский 1983. Each species page was downloaded, and keyword flags were extracted by script into `scripts/input_snapshots/malchevsky1983_flags.json`. No text was copied.
   - Mammal biology: «Звери Вологодской области», full text, for the adjacent part of the historical Novgorod land.
   - Novgorod archaeozoology and birch-bark letters: Рыбина 2015; Hamilton-Dyer et al. 2017 and Maltby et al. 2020, abstracts only; Зиновьев 2012 (white-tailed eagle, full text); Зиновьев 2025 on synanthropes (abstract); Gorobets & Kovalchuk 2017 (abstract).
3. **Authoring.** The text fields (signs, voices, seasonal states) are qualitative naturalist knowledge, checked against the sources above, and have row confidence B. Nothing is copied from sources at length.
4. **Deterministic derivation.** `scripts/build.cjs` expands each taxon's habitat groups into pf_id × season rows by the rule below. `scripts/validate.cjs` checks the acceptance criteria and integrity.

### Frequency rule
<a id="frequency-rule"></a>

- Each taxon has a **regional base class** (`base_frequency_class`). It comes from the abundance statements in Мальчевский (NW Russia) or the regional mammal sources, and from Novgorod archaeozoology where it exists. It is lowered for taxa whose range or numbers grew only in the XX century. `base_frequency_basis` gives the reason for each taxon.
- Habitat fit `core` keeps the class. `marginal` lowers it by one step: ubiquitous → common → contextual → rare. The floor is rare.
- Season rules:
  - A bird present only on passage loses one step, unless `mass_passage=true`.
  - An `irregular` bird (irruptive visitor or rare winterer) loses one step.
  - An absent season produces no row.
  - A mammal in hibernation gets `state=dormant`, `activity_time=dormant`, `audible=false` and class `rare`. Only its den can be observed.
- Derived overlays:
  - `pf_hunting_ground`: the best fit of the taxon among forest, edge, meadow, lake, bog and stream.
  - `pf_forest_track`: woodland core becomes marginal.
  - `pf_winter_ice_crossing`: winter only, marginal, for taxa that use rivers, lakes or roads.
- Class to weight is 8/4/2/1 and the ppm come from `places-binding/presence/frequency_rule.json`. This is an **editorial game preference**. It is not a measured biological abundance or an encounter probability.
- Presence-row confidence is B, or C when the taxon's presence in 1230 is C. Archaeology does not place an animal in a specific place family, so no presence row gets A.

### Confidence columns

- `presence_1230_confidence`:
  - A: Novgorod bones or birch-bark letters. 19 taxa: elk, bear, fox, marten, otter, beaver, squirrel, hare, crane, mallard, white-tailed eagle, capercaillie, black grouse, rock dove, tree sparrow, jackdaw, rook, hooded crow, raven.
  - B: modern regional list, with no known range change. 147 taxa.
  - C: range change or other doubt. 27 taxa.
- `confidence` of the taxon row is B for the biology text.

## Acceptance (script `scripts/validate.cjs`, result ok=true, 0 errors)

- Every mammal has at least one kind of sign and at least one presence row. In each forest and riparian place family (conifer, mixed and broadleaf woodland, forest edge, riverbank, lake shore, marshy stream, river channel, floodplain meadow, bog) there are **at least 7** mammal taxa with signs in every season. The target is ≥6.
- Hibernators (bear, badger, hedgehog, bats, birch mouse, dormouse) are dormant in every winter row.
- There are 149 bird taxa (target ≥40). Each has `voice_description` and a migration status for all 4 seasons. Every open-air place family has **at least 3** audible bird species in each season (winter only for the winter ice crossing).
- Integrity checks:
  - pf_ids exist in `places-binding/places/place_families.csv`.
  - category_refs exist.
  - SRC ids exist.
  - WK ids exist in WK production-v1.
  - MASTER hnt ids exist.
  - Excluded and anachronistic taxa are absent (raccoon dog, muskrat, American mink, brown rat, rabbit, pheasant, collared dove, sika deer).
  - Magpie and starling have no town rows (Зиновьев 2025).
- Warning: the overlays `pf_reality_*` get no fauna rows on purpose.
- Мальчевский page numbers match the species headings. The only difference is the synonym nigra/niger.

## Rebuild

```
python scripts/extract_regional_bird_sources.py <panteleev_cyberleninka.html> <dir with malchevski_*.html> scripts/input_snapshots
node scripts/build.cjs
node scripts/validate.cjs
```
Download the pages first with curl from the URLs in `scripts/src/sources.cjs`. The snapshots are already committed, so `build.cjs` and `validate.cjs` run offline. `validate.cjs` reads WK from the main checkout; set `NOVGOROD_MAIN` to point elsewhere.

## Known gaps and cautions

- **Novgorod bird bone list not read.** Зиновьев 2011 (NNZ 25: 277–287) and Hamilton-Dyer et al. 2020 (Oxbow, 255–293) are bibliographic only. The PDF of Hamilton-Dyer, Brisbane & Maltby 2017 (Bournemouth eprints) was unreachable. Waders, most passerines and owls therefore rest on modern regional analogy (B) and not on 1230 bones.
- **Falconry.** Goshawk is the most popular raptor among the East Slavs (abstract) and falconry is attested in the Novgorod territory (WK research FAU-04). Species-level Novgorod evidence (gyrfalcon or peregrine as tribute or trade) was **not** found in the sources read. `falconry_relevance` for falcons is general European practice, flagged in `notes`.
- **Range doubts for 1230**, kept rare with confidence C:
  - wild boar, roe deer, wild forest reindeer, wolverine, sable (probably a trade fur);
  - redwing, common rosefinch, black-headed gull, coot, lapwing, great crested grebe, black tern, blackbird, blackcap, nightingale, grey partridge, linnet, house martin, swift in town.
  - The starling date conflicts between sources: the 2025 abstract says later-medieval, the 53news article says XIII c.
- **Excluded for lack of a source:** brown hare, red deer, aurochs/wisent, desman, black rat, white stork, mute swan, great reed warbler, hawfinch (see `taxa_checks.csv`).
- `brown_long_eared_bat` has presence C: no regional list for this species was read.
- **Collector compatibility.** `build-presence-rules.mjs` deduplicates pool rows on (scope, region, category) and ignores season, so the four seasonal rows of one taxon × pf collapse to the highest class. The per-season detail stays here. The places-binding owner has to decide whether presence rules should carry a season key.
- **Bat winter roosts.** Bat winter rows are dormant in forest and outbuilding families. Specific hibernation sites (cellars, caves) are covered only by `pf_cellar_granary`-type families that have no bat rows. Add them if needed.
- The research used only public abstracts and extracts. No long passages were copied. Voice descriptions are standard onomatopoeia.
