# Фауна: дикие звери и птицы (game-base-v1, collector candidate)

Status: **candidate**. The collector did not approve this data. Each domain needs a separate approval pass (Opus high or the owner, WR §21.1).
Domains: `fauna_mammals`, `fauna_birds` (catalog.json, group `fauna-mammals-birds`).

## Files and row counts

The counts below come from `build-report.json` and `validation-report.json`, which the scripts write.

| File | Rows | What |
|---|---:|---|
| `fauna/mammals.csv` | 44 | Wild mammal taxa: names, seasonal states (rut, hibernation, moult, winter coat), sixteen editorial pelt calendars, authored `audible_seasons`, signs, products, hunting text and MASTER gear refs, WK refs |
| `fauna/birds.csv` | 149 | Wild bird taxa: names, migration status for each of the 4 seasons, full `voice_description`, short narrator-ready `voice_sound_ru`, audible seasons, nesting, game value, falconry relevance, regional-list evidence (Пантелеев 2001 / Петров 1885), Мальчевский page |
| `fauna/wild_habitat_presence.csv` | 4249 | taxon × place_family × season: `frequency_class`, weight 8/4/2/1, habitat fit, state (active, dormant, breeding, passage, wintering, resident, irregular), `activity_time`, `audible`, observable sign types, `refresh_class=by_year_season` |
| `fauna/fauna_categories.csv` | 220 | Category nodes in domain `fauna`: `fauna.mammal`, `fauna.bird`, 25 group nodes, 193 taxon nodes. Every taxon row and presence row has a `category_ref` |
| `fauna/taxa_checks.csv` | 27 | Taxa checked for 1230 and the verdict for each: 7 included as rare, 4 included reduced or rural-only, 6 excluded as doubtful, 2 excluded as unattested, 8 excluded as anachronisms; `basis` and `derivation` record explicit analogies |
| `fauna/sources.csv` | 21 | Source register: level, read depth (full, extract, abstract, bibliographic) and URL |
| `fauna/hunting_methods.csv` | 25 | Direct and set/check hunting, trapping, falconry, small-fauna capture and F10 egg collection; taxa/categories, sizes, seasons, basis, derivation and anachronism check are explicit |
| `fauna/hunting_tenure_defaults.csv` | 3 | Candidate input for F29/F30 tenure: ловища, бобровые гоны and перевесища map to `pf_hunting_ground` with `rights_holder`; no holder or closed months are invented |

Composition. Mammals: 4 ungulates, 2 large predators, 11 fur-bearing and small mustelids and other predators, 2 fur rodents, 1 hare, 18 small mammals (insectivores and rodents), 5 bats, 1 seal (Ladoga only).
Birds: 15 waterfowl, 17 raptors, 8 owls, 6 gamebirds, 11 waders, 7 woodpeckers, 8 corvids, 57 passerines and others. Falconry: 6 falconry birds, 26 quarry species.
Presence rows by season: winter 765, spring 1182, summer 1139, autumn 1163. By class: ubiquitous 287, common 1107, contextual 1390, rare 1465. By kind: mammals 1416, birds 2833. The rows cover 38 place families.

## Universal layer vs regional layer

- Taxa and their biology are **universal** (`scope=universal_taxon`), and the categories have `universal=true`. The region lives only in presence rows (`region_id=region_novgorod_land`) and in `region_scope`. The Ladoga seal uses the same G0 region and `subregion_scope=lower_volkhov_ladoga`, matching the fish tables; it is not present in the Ilmen/upper Volkhov start territory. For another region, add the G0 node before presence rows. Do not copy the taxon rows.
- `category_ref` has the form `fauna.<mammal|bird>.<group>.<slug>`. The collector `places-binding/scripts/build-category-registry.mjs` picks these up from `fauna_categories.csv`. No common root `fauna` is defined because a sibling fauna group may define one. The owner of category_registry decides the root.

## Method

1. **Existing knowledge first.**
   - WK production-v1: fauna-mammals, fauna-ecology, static-animal-context-b06, static-weather-traces-b06, agriculture-fauna, environment-p1, foundation. Their approved concept and claim ids are in `wk_refs`, and `validate.cjs` checks that each id exists.
   - Research notes environment-agriculture-fauna.md (FAU-02..04) and population-fauna-mammals-winter.md.
   - MASTER: game ingredients ING0113–0119 and hunting gear hnt0001–0028. D confidence, `research_only` and critical-risk labels do not reject existence under D38. HNT0022 is the dated modern spring trap; HNT0024 and HNT0028 remain out of generation pending item-specific source checks, with their proposals and confidence retained.
   - pr98 m2c-nature-coverage.json: 42 concepts, none of them species pools.
2. **Real gaps closed with sources** (see `fauna/sources.csv`):
   - Regional bird list: Пантелеев 2001. 149 of 149 birds are matched, 120 of them with Петров 1885 records for Приильменье.
   - Status, abundance, arrival and departure: Мальчевский & Пукинский 1983. Each species page was downloaded, and keyword flags were extracted by script into `scripts/input_snapshots/malchevsky1983_flags.json`. No text was copied.
   - Mammal biology: «Звери Вологодской области», full text, for the adjacent part of the historical Novgorod land.
   - Novgorod archaeozoology and birch-bark letters: Рыбина 2015; Hamilton-Dyer et al. 2017 and Maltby et al. 2020, abstracts only; Зиновьев 2012 (white-tailed eagle, full text); Зиновьев 2025 on synanthropes (abstract); Gorobets & Kovalchuk 2017 (abstract).
3. **Authoring.** The text fields (signs, voices, seasonal states) are qualitative naturalist knowledge, checked against the sources above, and have row confidence B. Nothing is copied from sources at length.
4. **Deterministic derivation.** `scripts/build.cjs` expands each taxon's habitat groups into pf_id × season rows by the rule below. `scripts/validate.cjs` checks the acceptance criteria and integrity.

### Hunting methods, pelts and tenure

`hunting_methods.csv` is a method catalog, not an encounter or action whitelist. The repo-local MASTER provides all `hnt0001–hnt0028`; `hnt0010` (beaver pelt) and `hnt0021` (fur bundle) were removed from mammal `hunting_method_refs` because they are products, not tools. HNT0022 denotes the modern factory spring trap and remains excluded by its dated period; HNT0024 (iron trap) and HNT0028 (snowshoes) are queued for item-specific source checks, not rejected for D confidence. Every method records `basis`, `derivation` and `anachronism_check`; a sourced row must have a source, while `logical_necessity|editorial` may instead preserve an explicit source gap. `set_and_check` creates no catch when set; a later activity must check it.

Sixteen species have `pelt_prime_months` and twelve `month=quality` values (`winter|transitional|summer`). This calendar subset is independent from the 44 F30 relations now derived from mammalian hair-bearing skin: F30 does not assert commercial fur value or invent prime months. Exact month boundaries are `pelt_calendar_basis=editorial`, confidence C and deliberately have no numeric source ref. Weasel and the remaining mammals keep an explicit calendar gap; `pelt_qualitative_source_refs` preserve only available coat/moult evidence. Sable keeps its confidence-C range caveat.

The tenure input preserves the target columns `place_family_ref,family_id,tenure,closed_months` and adds evidence fields plus `ground_kind`. Sources support protected hunting assets/grounds only with stated geographic and chronological limits; they do not identify a current site, holder or closed month.

### Frequency rule
<a id="frequency-rule"></a>

- Each taxon has a **regional base class** (`base_frequency_class`). It comes from the abundance statements in Мальчевский (NW Russia) or the regional mammal sources, and from Novgorod archaeozoology where it exists. It is lowered for taxa whose range or numbers grew only in the XX century. `base_frequency_basis` gives the reason for each taxon.
- Habitat fit `core` keeps the class. `marginal` lowers it by one step: ubiquitous → common → contextual → rare. The floor is rare.
- Season rules:
  - A bird present only on passage loses one step, unless `mass_passage=true`.
  - An `irregular` bird (irruptive visitor or rare winterer) loses one step.
  - An absent season produces no row.
  - A mammal in hibernation gets `state=dormant`, `activity_time=dormant`, `audible=false` and class `rare`. Only its den can be observed.
  - A taxon-level seasonal condition that cannot be proved by a place family suppresses that season's presence rows. The mallard keeps its irregular winter status, but `winter=open_water_only` produces no winter row: none of the current place families proves unfrozen water.
- Derived overlays:
  - `pf_hunting_ground`: the best fit of the taxon among forest, edge, meadow, lake, bog and stream.
  - `pf_forest_track`: woodland core becomes marginal.
  - `pf_winter_ice_crossing`: winter only, marginal, for taxa that use rivers, lakes or roads.
- Class to weight is 8/4/2/1 and the ppm come from `places-binding/presence/frequency_rule.json`. This is an **editorial game preference**. It is not a measured biological abundance or an encounter probability.
- Presence-row confidence is B, or C when the taxon's presence in 1230 is C. Archaeology does not place an animal in a specific place family, so no presence row gets A.
- The mole is a sourced exception to the ordinary frequency derivation: its spring floodplain-meadow row is `rare`, because it is ordinarily subterranean and floods destroy burrows. Its cathemeral activity does not establish a visible animal on the surface; phase visibility is therefore an explicit source-limited gap, while authored signs remain available.

### Confidence columns

- `presence_1230_confidence`:
  - A: Novgorod bones or birch-bark letters. 19 taxa: elk, bear, fox, marten, otter, beaver, squirrel, hare, crane, mallard, white-tailed eagle, capercaillie, black grouse, rock dove, tree sparrow, jackdaw, rook, hooded crow, raven.
  - B: modern regional list, with no known range change. 147 taxa.
  - C: range change or other doubt. 27 taxa.
- `confidence` of the taxon row is B for the biology text.

## Acceptance (script `scripts/validate.cjs`, result ok=true, 0 errors)

- Every mammal has at least one kind of sign and at least one presence row. In each forest and riparian place family (conifer, mixed and broadleaf woodland, forest edge, riverbank, lake shore, marshy stream, river channel, floodplain meadow, bog) there are **at least 7** mammal taxa with signs in every season. The target is ≥6.
- Hibernators (bear, badger, hedgehog, bats, birch mouse, dormouse) are dormant in every winter row.
- There are 149 bird taxa (target ≥40). Each has `voice_description` and a migration status for all 4 seasons. `voice_sound_ru` is short sound-only text when a species voice is authored; it may be empty when `audible_seasons` is empty or `voice_description` explicitly says the bird is silent. Every open-air place family has **at least 3** audible bird species in each season (winter only for the winter ice crossing), except the explicit `pf_ferry_landing` winter gap: 2 species remain after the mallard's unsupported frozen-water row is removed.
- Integrity checks:
  - pf_ids exist in `places-binding/places/place_families.csv`.
  - category_refs exist.
  - SRC ids exist.
  - WK ids exist in WK production-v1.
  - MASTER hnt ids exist.
  - Excluded and anachronistic wild taxa are absent (raccoon dog, muskrat, American mink, brown rat, wild rabbit outside its regional range, pheasant, collared dove, sika deer). Domestic rabbit husbandry remains a separate source-check question in the livestock group.
  - Twenty-five hunting methods use only repo-local non-D gear when a tool exists; every taxon/category, size, season, basis, derivation, F10 link and anachronism check is closed and validated. The three F10 methods partition 137 locally nesting taxa into 53 tree/trunk/hollow/reused-tree-nest, 83 other accessible, and 1 explicitly winter-nesting species. Three rights rows resolve to `pf_hunting_ground`.
  - Sixteen pelt calendars contain all 12 months, only the three quality classes, and explicitly editorial exact boundaries.
  - Magpie and starling have no town rows (Зиновьев 2025).
- Warning: the overlays `pf_reality_*` get no fauna rows on purpose.
- Мальчевский page numbers match the species headings. The only difference is the synonym nigra/niger.

## Rebuild

`fauna/phase_activity.csv` covers every `fa_id × season` appearing in `wild_habitat_presence.csv` on the 16 PF read from `places-binding/places/node_binding.csv` (`pf_id` of bound G4/G5 nodes), with four civil-light phases per pair. `fauna/activity_phase_rules.json` is the single editorial C mapping from coarse `activity_time` to phases; derived rows cite its stable rule id. A `no_source` phase is not a claim of absence and has confidence C. Direct phase claims cite their owner field or book evidence. `voice_text_ref` points to the owner voice/sign field without repeating its text. The builder and validator recompute the PF set from the binding. The searched evidence locations were `fauna/birds.csv` (`activity_time`, `audible_seasons`, `voice_description`), `fauna/mammals.csv` (`activity_time`, `signs_sounds`), `wild_habitat_presence.csv`, `sources/books-evidence-v1/fauna-mammals-birds.csv`, WK `production-v1/fauna-ecology.json`, MASTER archive, adjacent fish/invertebrate/livestock group, and recorded C rules.

`voice_sound_ru` is authored in `scripts/src/birds.cjs` and generated into `fauna/birds.csv`. It gives the narrator the sound itself, without season, place, behaviour, or phase context. `voice_description` retains the full context and remains the input to voice phase derivation; adding the short field does not change phase rules. The validator rejects missing sound text for an ordinary voice and common context words. Empty sound is accepted only when `audible_seasons` is empty or the authored description explicitly says the bird is silent; `node scripts/validate.cjs --self-test` probes both allowed and rejected cases.

Exactly one of `source_refs`, `rule_ref`, and `no_source` is set per row. An unknown individual facet is marked by its `*_state=no_source`; a fully unknown row uses `no_source`. A source pointer for one facet never changes the other facet's gap state. A call limited to dawn, night, a nest, migration, or a stated season is not promoted to an unconditional daily voice. The crane's dawn call is kept at dawn; the black stork's nest-only calls remain voice gaps.

The mole's surface visibility uses `activity_phase_rules.json#subterranean-surface-sighting-gap`, based on `book:498801 §406` and `book:756203 §289`; this rule deliberately does not turn coarse daily activity into a sighting. The mallard's `season_presence_conditions` records `winter=open_water_only`; until scene state can prove open water, the builder emits no winter place-family rows.

```
python scripts/extract_regional_bird_sources.py <panteleev_cyberleninka.html> <dir with malchevski_*.html> scripts/input_snapshots
node scripts/build.cjs
node scripts/validate.cjs
node scripts/validate-phase.cjs fauna-mammals-birds --self-test
```
Download the pages first with curl from the URLs in `scripts/src/sources.cjs`. The snapshots are already committed, so `build.cjs` and `validate.cjs` run offline. `validate.cjs` reads WK from the main checkout; set `NOVGOROD_MAIN` to point elsewhere.

## D40 exclusions reviewed in C016

- `fchk_023` is not a blanket exclusion: magpie remains in rural place families; only town rows are forbidden by the cited late urban-colonisation evidence.
- `fchk_026` remains `included_reduced`. All seven listed birds now have `base_frequency_class=rare|contextual` and `presence_1230_confidence=C`; redwing and common rosefinch were corrected from `common` to `contextual`.

## Known gaps and cautions

- **Novgorod bird bone list not read.** Зиновьев 2011 (NNZ 25: 277–287) and Hamilton-Dyer et al. 2020 (Oxbow, 255–293) are bibliographic only. The PDF of Hamilton-Dyer, Brisbane & Maltby 2017 (Bournemouth eprints) was unreachable. Waders, most passerines and owls therefore rest on modern regional analogy (B) and not on 1230 bones.
- **Falconry.** Goshawk is the most popular raptor among the East Slavs (abstract) and falconry is attested in the Novgorod territory (WK research FAU-04). Species-level Novgorod evidence (gyrfalcon or peregrine as tribute or trade) was **not** found in the sources read. `falconry_relevance` for falcons is general European practice, flagged in `notes`.
- **Range doubts for 1230**, kept rare with confidence C:
  - wild boar, roe deer, wild forest reindeer, wolverine, sable (probably a trade fur), black rat (rare imported synanthrope by analogy with Northern European ports: Viking-Age Hedeby, ninth to eleventh centuries, and medieval York; no Novgorod find in the sources read);
  - redwing, common rosefinch, black-headed gull, coot, lapwing, great crested grebe, black tern, blackbird, blackcap, nightingale, grey partridge, linnet, house martin, swift in town.
  - The starling date conflicts between sources: the 2025 abstract says later-medieval, the 53news article says XIII c.
- **Excluded for lack of a source:** brown hare, red deer, aurochs/wisent, desman, white stork, mute swan, great reed warbler, hawfinch (see `taxa_checks.csv`).
- `brown_long_eared_bat` has presence C: no regional list for this species was read.
- **Collector compatibility.** `build-presence-rules.mjs` deduplicates pool rows on (scope, region, category) and ignores season, so the four seasonal rows of one taxon × pf collapse to the highest class. The per-season detail stays here. The places-binding owner has to decide whether presence rules should carry a season key.
- **Bat winter roosts.** Bat winter rows are dormant in forest and outbuilding families. Specific hibernation sites (cellars, caves) are covered only by `pf_cellar_granary`-type families that have no bat rows. Add them if needed.
- The research used only public abstracts and extracts. No long passages were copied. Voice descriptions are standard onomatopoeia.

## C006b3: согласование слышимости

Для млекопитающих `wild_habitat_presence.audible` определяется авторским полем `mammals.audible_seasons` и отсутствием сезона в `dormant_seasons`. Поле содержит список сезонов через `;` или пустое значение для каждого из 44 видов. Каждая строка млекопитающего ссылается на собственное `signs_sounds`. Фазы голоса выводит только сборщик по тексту; валидатор проверяет схему, ссылки и согласованность с сезонной слышимостью, но не повторяет разбор прозы. Фазы проверены выборочно.

«Крик тревоги» косули не считается обычным голосом. Если за звуком при тревоге идёт самостоятельный звук после запятой, он оценивается отдельно: всплеск ныряния бобра остаётся слышимым признаком.

## C006b4: сезонный звук владельца

Для рыси в `audible_seasons` указаны зима и весна по гону февраля–марта. Для бобра и водяной полёвки зима исключена: водный всплеск подо льдом и в норах не слышен. Валидатор детерминированно сверяет `audible` с авторским полем и спячкой; содержательная оценка текста остаётся авторским решением.
