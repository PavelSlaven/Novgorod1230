# VERIFICATION — fauna-mammals-birds (game-base-v1)

- **Who:** an independent verifier agent (senior pass). It is not the collector and approved nothing on the collector's behalf.
- **When:** 2026-09-26
- **What:** `data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/`. Files checked: `fauna/mammals.csv`, `fauna/birds.csv`, `fauna/wild_habitat_presence.csv`, `fauna/fauna_categories.csv`, `fauna/taxa_checks.csv`, `fauna/sources.csv`, `README.md`, `scripts/build.cjs`, `scripts/validate.cjs`, `scripts/input_snapshots/*.json`.
- **Overall verdict: REWORK (targeted).**
  - No fabrication was found, and no anachronistic taxon was found.
  - The frequency derivation is mechanically correct.
  - Two files need build-script fixes before approval: the presence states and the category source attribution. Both fixes are mechanical and need no new research.
  - The other files are `approve_with_limits`.

## Method

The verifier used only deterministic scripts, run from its own scratch folder, plus source checks. The data files were not edited.

1. **Counts.** An independent Python script counted the rows and matched them against `README.md` and `build-report.json`. Results:

   | File | Rows |
   |---|---:|
   | mammals | 44 |
   | birds | 149 |
   | presence | 4231 |
   | categories | 220 |
   | taxa_checks | 27 |
   | sources | 21 |

   All match. The README splits by season, class, kind and group, and the taxa_checks verdict counts, all match too. One exception is noted under README below.
2. **Integrity, checked by script over every row:**
   - empty `source_refs` or `confidence`;
   - unknown SRC ids;
   - duplicate ids and duplicate (fa_id, pf_id, season) keys;
   - category parents and refs;
   - pf_ids against `places-binding/places/place_families.csv`;
   - weight 8/4/2/1 against class;
   - presence confidence rule (C if taxon presence is C, otherwise B);
   - an anachronism denylist on Latin names;
   - D-rated hnt ids;
   - hibernators dormant in winter;
   - magpie and starling kept out of town families;
   - Пантелеев and Петров flags against the snapshot;
   - Мальчевский page URL against the heading on that page.
3. **Independent recompute of `frequency_class`** for all 4231 presence rows from base class, fit and season state, following the README rule. Result: **0 mismatches**.
4. **Determinism.** `node scripts/build.cjs` was run twice, and the hashes of all six CSVs were identical. Note: the verifier ran `build.cjs`, which rewrote the CSVs in place. The run is deterministic, so the output is byte-identical to the build inputs, and counts and hashes are unchanged. `node scripts/validate.cjs` gives ok, 0 errors.
5. **Source checks on a stratified sample of 65 rows** (all confidence levels A, B and C, every file), against the cited source:
   - WK claim ids were checked in main `production-v1`, and the approved claims were read.
   - MASTER `material_items.csv` hnt0001–0028 and `ingredients.csv` ING0113–0119 were checked.
   - Web sources:
     - Пантелеев 2001, via cyberleninka; 6 entries were compared with the snapshot and all match.
     - Мальчевский pages 12, 14, 127, 137, 138, 171, 172, 181, 190, 235, 241.
     - «Звери Вологодской области», pages 1–6 of booksite.
     - Рыбина 2015, full text.
     - Зиновьев 2012 PDF, full text.
     - 53news.
     - Search abstracts: Zinoviev 2025, Hamilton-Dyer et al. 2017, Maltby et al. 2020, Elk 2025, Gorobets & Kovalchuk 2017.

## Verified as correct (sample)

- **Рыбина 2015.** These match the full text:
  - fur counts: белка most frequent, бобр 5, куница 7, and one letter each for песец, заяц, лисица, выдра, соболь, нерпа, росомаха;
  - hides: лосиная, оленьи, медвежьи;
  - about 120 томары, more than 350 arrows in the X–XII c. layers, an ash bow of the XIII c.
- **Зиновьев 2012.** The white-tailed eagle bone is confirmed: the distal left tarsometatarsus from the Десятинный раскоп, late XI – early XII c. So is the statement that hunting with eagles was extremely rare.
- **Hamilton-Dyer et al. 2017 (abstract via search):**
  - fur-bearer remains are bear claws plus squirrel, marten, otter, fox and beaver;
  - capercaillie is among the game birds;
  - falconry equipment is known from Городище and Novgorod.
  - This supports presence A for bear, fox, marten, otter, squirrel, beaver and capercaillie.
- **Elk 2025 abstract.** About 0.2% of identified bones, one third butchered, antler pedicles removed. Confirmed.
- **Maltby 2020 abstract.** "106 beaver" from the Troitsky sites, foot bones under-represented, 35% with butchery marks. Confirmed. See the wording issue under mammals.
- **Zinoviev 2025 and 53news.** Pigeon and tree sparrow by the XIII c.; magpie and starling are later colonisers, and no magpie bones were found. The 53news article says the starling arrived in the XIII c.; this conflict is recorded honestly.
- **Мальчевский:**
  - white stork breeds regularly only from the 1970s;
  - collared dove was first seen in the NW in 1975;
  - great reed warbler spread in the XX c.;
  - hawfinch was extremely rare before the 1960s;
  - mute swan is only a possible vagrant;
  - redwing "became common only recently".
- **Вологда book:**
  - desman: one pelt from 1939, upper Унжа;
  - raccoon dog from the Амуро-Уссурийский край;
  - «акклиматизированная у нас ондатра»;
  - reindeer reached the southern uyezds in the XIX c.;
  - wolverine and garden dormouse accounts exist;
  - only 3 bat species are listed, with the long-eared bat and Daubenton's bat only as possible vagrants.
- **WK.** All cited WK claims exist, are `approved`, and match the topic of the row: moose, beaver, bear, lynx, wolf, mallard, tawny owl, great tit and the bat claims. All 11 approved wild-mammal WK concepts and 3 wild-bird WK concepts are used.
- **Anachronisms.** None of the following is among the taxa: raccoon dog, muskrat, American mink, brown rat, rabbit, pheasant, collared dove, sika deer, turkey, red deer, brown hare. Doubtful taxa (boar, roe deer, reindeer, wolverine, sable, the bird range expanders) are kept rare with confidence C.
- **Biology texts.** Rut periods, moult, denning, voices and signs in the sampled rows (elk, bear, beaver, lynx, sable, reindeer, seal, capercaillie, black grouse, crane, rook) are consistent with standard naturalist knowledge. No long copied passages were found.

## Per-file verdicts

### `fauna/mammals.csv` — approve_with_limits (44 rows, 10 checked in full against sources, all 44 by script)

Problems found:

1. **`fa_m_brown_long_eared_bat` has a wrong source attribution.**
   - `source_refs` is only `SRC_WK_FAUNA`, but `wk_refs` is empty, so no WK concept backs it.
   - `notes` says "presence B" while the column says C.
   - The Вологда book does name the long-eared bat (ушан), as a possible vagrant. The row should cite `SRC_VOLOGDA_MAMM`, keep C, and fix the note.
2. **`fa_m_beaver` historical_evidence says «106 особей».** The Maltby 2020 abstract says "106 beaver were recorded", which does not say individuals (NISP or MNI is unknown). Neutral wording is needed, such as «106 находок бобра».
3. **Inconsistent treatment of steppe taxa.** The Вологда book puts заяц-русак, обыкновенная полёвка, полевая мышь and мышь-малютка in one group: steppe species that entered the taiga after land clearing. The collector treats them differently:
   - brown hare: excluded;
   - `common_vole`: B, common;
   - `harvest_mouse`: B;
   - `striped_field_mouse`: C.
   Either justify each case, or harmonise (for example common vole C, and brown hare included as rare C for arable land, or all excluded).
4. **The sable gap is overstated.** The Вологда book cites Пушкарев 1846 and the 1861 памятная книжка for sable in the Vologda gubernia, the historical north-east of the Novgorod land. This supports keeping the sable as rare C in remote conifer. Add the reference.
5. **`hunting_method_refs` of the beaver includes `hnt0010`**, which is «Бобровая шкура», a product and not a hunting method.
6. **Completeness gaps. These are not errors.**
   - Missing: root vole (*Microtus oeconomus*, «экономка», which the Вологда book names), Laxmann's, even-toothed and least shrews, and bats (Nathusius' pipistrelle, noctule, pond bat).
   - The owner's vision asks for as full a base as possible.
7. **Cross-group duplicates and a conflict.** The sibling group `fauna-fish-invertebrates-livestock` defines `fa_mamm_house_mouse`, `fa_mamm_striped_field_mouse` and `fa_mamm_voles` (as `fauna.rodent_pest`). These duplicate `fa_m_house_mouse`, `fa_m_striped_field_mouse` and the vole rows here, which means two owners for the same taxon. The sibling also includes `fa_mamm_black_rat` (C), while this group excludes the black rat (fchk_010). The coordinator must choose one owner and one verdict.

### `fauna/birds.csv` — approve_with_limits (149 rows, 16 checked in full against sources, all 149 by script)

Problems found:

1. **Two Мальчевский page URLs point to the wrong species.** The authored `mpage` values in `scripts/src/birds.cjs` are wrong.
   - `fa_b_robin` → `malchevski_171.html`, which is ЛЕСНАЯ ЗАВИРУШКА (dunnock). The correct page is `malchevski_172.html`.
   - `fa_b_short_eared_owl` → `malchevski_137.html`, which is УШАСТАЯ СОВА (long-eared owl). The correct page is `malchevski_138.html` (БОЛОТНАЯ СОВА). The short-eared owl also has no Мальчевский flags, because the extractor missed the OCR heading «COBA».
   - `validate.cjs` compares the heading taken from `mp`, not the page actually cited, so it missed both. The README statement that the only difference is nigra/niger is therefore wrong. The validator should check `malchevsky_page` against the heading of that page.
2. **The base frequency class is authored judgment with a weak basis.**
   - 69 of 149 birds have `base_frequency_basis` "flags: n/a". The class then rests on a free-text note paraphrasing Мальчевский, which is acceptable only as B.
   - 4 birds have class `rare` although the flag is `common`. They are presumably lowered for 1230, but the reason is not stated for each.
   - The README rule ("from abundance statements") is only partly traceable.
3. **`fa_b_redwing` keeps base `common`.** Мальчевский (#181) says it was rare in the Петербургская губерния as late as the end of the XIX c. and grew in numbers in the XX c. A class of common for 1230 contradicts the cited source; contextual or rare is defensible. `taxa_checks` fchk_026 claims the base was lowered, and for the redwing this is not visible.
4. **`fa_b_common_crane` has presence A.** It rests on Gorobets 2017, an abstract about East Slavs in general. It is not Novgorod-specific, and the Hamilton-Dyer 2017 abstract does not name the crane. The rating should be B unless Novgorod crane bones are cited, for example from Зиновьев 2011 once it is read.
5. **Capercaillie and black grouse "77 / 10 bones in the Novgorod region" (SRC_GOROBETS2017)** could not be verified from any accessible abstract. Presence A for capercaillie is supported independently by Hamilton-Dyer 2017. For the black grouse, A rests only on this unverified number. Mark it as unverified, or use B.
6. **`fa_b_gyrfalcon` note is wrongly attributed.** The note says "rare winter/passage records in the Novgorod list (SRC_PANT2001)", but Пантелеев 2001 gives literature references only, with no status (checked). The status is general knowledge and should be attributed as such.
7. **Completeness.** 104 of Пантелеев's 253 taxa are absent. Some of them are regular breeders or common passage birds of the region:
   - passerines: pied flycatcher (Петров), wheatear (Петров), meadow pipit (Петров), dunnock, greenfinch, marsh tit, icterine, marsh and reed warblers, lesser whitethroat, rustic bunting, crested lark (Петров), dipper, twite;
   - waders, rails and gulls: green sandpiper, greenshank, water rail (Петров), moorhen (Петров), dunlin, whimbrel (Петров), golden and grey plover, little gull (Петров), herring gull;
   - others: hawk owl (Петров), gadwall (Петров), pochard, red-breasted merganser (Петров), red-throated diver (Петров), turtle dove, hoopoe.
   Adding these is a completeness task, not a correctness fix.
8. **The `B` code in autumn becomes `migration_autumn=breeding`**, including for species that leave in August or early September (nightjar, cuckoo, crane). See the presence file.

### `fauna/wild_habitat_presence.csv` — rework (targeted, build script only) (4231 rows, 10 checked in full, all 4231 recomputed)

What is right: the class and weight derivation is correct (0 mismatches over 4231 rows), there are no duplicate keys, all pf_ids exist, and the confidence rule is applied correctly. Weights are an editorial rule stated in the README, and no numbers are invented.

Problems found:

1. **450 autumn bird rows have `state=breeding` and `observable_signs=voice;nest`.** This covers every B-coded bird in autumn. Examples: `fhp_b_chaffinch__mixed_woodland__autumn` (ubiquitous, breeding, nest) and `fhp_b_common_crane__bog__autumn`.
   - A prose consumer would narrate active nesting in September to November, which is wrong for about 10.6% of rows.
   - Fix in `build.cjs`: in autumn, map B to a post-breeding or departing state, for example `present_departing`, or `passage` where `massP`. Emit the `nest` sign only in spring and summer. Consider an optional departure month so that early leavers get a lower autumn class.
2. **House sparrow** has rows in town_street, market_square and other town families (rare or marginal). `taxa_checks` fchk_025 labels it `included_rural_contextual`. Align the label or the rows.
3. **Known limitation, already disclosed by the collector:** `build-presence-rules.mjs` collapses the four seasons. The places-binding owner must decide on a season key.

### `fauna/fauna_categories.csv` — rework (mechanical) (220 rows, 4 checked in full, all 220 by script)

What is right: ids are unique, every parent exists, and every taxon and presence `category_ref` resolves.

Problems found:

1. **134 of 193 taxon category rows cite `source_refs=SRC_WK_FAUNA` although the taxon has no WK concept.** Examples: nightjar, pine grosbeak, grey heron, brown long-eared bat. This is a false attribution. It comes from the `build.cjs` fallback `(t.src||'').split(';')[0] || 'SRC_WK_FAUNA'`, and bird `src` is usually empty. Fix: use the taxon's real first source, for example `SRC_PANT2001` for birds.
2. **Limits, not errors:**
   - There is no `confidence` column. Structural rows may be fine without it, but the registry owner should confirm.
   - `stable_code` embeds the group (for example `fauna.bird.other.nightjar`), so a later regrouping changes ids.
   - There is no shared `fauna` root; the category registry owner decides it together with the sibling group, whose roots are `fauna.domestic`, `fauna.rodent_pest` and others.

### `fauna/taxa_checks.csv` — approve_with_limits (27 rows, 13 checked against sources)

Checked against sources: fchk_001, 002, 003, 009, 012, 013, 017, 018, 019, 020, 021, 022, 026. The verdicts themselves are supported.

Problems found:

1. **3 rows have empty `source_refs`:** fchk_010 (black rat), fchk_014 (American mink) and fchk_016 (rabbit). This violates the rule that every row carries a source. At minimum cite the catalog denylist or conventions file, or a reference.
2. **Confidence A is given to exclusions based on modern or popular sources:**
   - fchk_012, 013 and 015 rest on `SRC_NBCRS` (level C) and `SRC_VOLOGDA_MAMM` (B);
   - fchk_018 and 019 rest on `SRC_MALPUK1983` (B).
   A is defined as primary or archaeological. Use B.
3. **fchk_026 claims the base class was lowered** for all 7 range expanders; for the redwing it stays `common` (see birds item 3).
4. **fchk_010 (black rat) conflicts** with the sibling group's `fa_mamm_black_rat` (see mammals item 7).

### `fauna/sources.csv` — approve_with_limits (21 rows, 12 checked against the URL or file)

Problems found:

1. **`SRC_MALPUK1983.use`** names `scripts/extract-malchevsky.py`, which does not exist. The real file is `scripts/extract_regional_bird_sources.py`.
2. **`SRC_ZIN2011` URL** points to the Зиновьев 2012 PDF, which only cites it. The row is labelled bibliographic, but the URL is misleading.
3. **`SRC_GOROBETS2017.use`** states "77 capercaillie and 10 black grouse bones". This is not in the accessible abstract and is unverified.
4. **`SRC_MALTBY2020.use`**: see the «106» wording (mammals item 2).
5. **`SRC_RYBINA2015`** has `read_depth=abstract`, but the numbers match the full text. It could be set to `full`. This is minor.

### `README.md` — approve_with_limits

- The bird composition "57 passerines and others" leaves out 20 non-passerine birds: gull 4, other 4, heron 3, rail 3, pigeon 3, waterbird 2, crane 1. The correct statement is 57 songbirds + 20 others.
- The statement that the Мальчевский heading check shows only nigra/niger is wrong (see birds item 1).
- All other counts match the scripts.

### Scripts — ok with a fix list

- `build.cjs` is deterministic (verified), and `validate.cjs` passes.
- Fixes needed:
  - the autumn B state and nest sign;
  - the category `source_refs` fallback;
  - 2 `mpage` values in `src/birds.cjs`;
  - the page-versus-heading check in `validate.cjs`.
- The extractor misses OCR headings with Latin letters, such as «COBA», for example page 138.

## Required before approval (minimal)

1. `build.cjs`: in autumn, B must stop producing `state=breeding` and the `nest` sign. Rebuild the presence file.
2. `build.cjs`: the category `source_refs` fallback must be the taxon's real source, not `SRC_WK_FAUNA`.
3. `src/birds.cjs`: robin `mpage` 172, short-eared owl `mp`/`mpage` 138. In `validate.cjs`, check the cited page's heading.
4. Fill the source_refs of fchk_010, 014 and 016. Set confidence B for fchk_012, 013, 015, 018 and 019.
5. Fix the source and note of the brown long-eared bat.

Recommended (limits): the redwing class; crane presence B; black grouse unverified; the beaver «106» wording; harmonising the steppe taxa; the house sparrow label; the README composition line; the completeness additions (birds and mammals listed above); a single owner for the rodents and the black rat across the two fauna groups.

## Not done / limits of this verification

- Not read, and inaccessible: Hamilton-Dyer et al. 2017 full text (Bournemouth eprints timed out; Elsevier and ResearchGate returned 403), Gorobets 2017 full text, Зиновьев 2011, and the Elk 2025 and Zinoviev 2025 full texts. Abstracts were used.
- The biology and voice texts were checked for plausibility on a sample. They were not checked line by line for all 193 taxa. Final content approval of the prose texts remains with the owner or the Opus-high approval pass.
- `codebase-memory-mcp` was not used: this is a data verification with no code owner. Files were read directly and checked by scripts.

## Исправления 2026-09-26

Fixer pass, scope limited to the two files marked `rework` above. No other file was touched. Both fixes are in `scripts/build.cjs`; the CSVs below are its regenerated output, not hand edits.

- **`fauna/wild_habitat_presence.csv` (required fix 1).** In `presRowsFor`, a bird whose migration code is `B` (breeding) in the `autumn` season now gets `state=present_departing` (or `state=passage` when `mass_passage=true`), instead of `state=breeding`. `sigSummary` already keys the `nest` sign off `state==='breeding'`, so it now emits `voice` only for these rows, with no code change needed there. Effect: the 450 autumn rows that had `state=breeding` and `observable_signs` including `nest` now have 0 such rows (423 became `present_departing`, 83 `passage` overall counted across autumn — the `massP` split matches each taxon's own `mass_passage` flag). Row count, `frequency_class`/`weight` derivation and all other columns are unchanged; the frequency step-down for departing autumn birds (the verifier's "optional departure month" suggestion) was left alone as recommended, not required.
- **`fauna/fauna_categories.csv` (required fix 2).** In the category-build loop, the `source_refs` fallback for a taxon category row no longer defaults to `SRC_WK_FAUNA` when the taxon has no `src`. For a bird with no authored `src` (135 of 149; every bird is matched in Пантелеев 2001 per the README), the fallback is now `SRC_PANT2001`, its real first source. For a mammal (all 44 have an authored `src`) and for the 14 birds with an authored `src`, the row keeps citing that taxon's own first source, unchanged. Effect: rows falsely citing `SRC_WK_FAUNA` dropped from 137 to 2. The 2 remaining (`fauna.mammal.fur_predator.lynx`, `fauna.mammal.bat.brown_long_eared_bat`) are correct passthroughs of `SRC_WK_FAUNA` as those taxa's own authored first source in `mammals.cjs`, i.e. `mammals.csv` itself, which is `approve_with_limits`, not `rework`, and was left untouched; the brown long-eared bat's own wrong source/note (mammals item 1 above) is unchanged and out of this fix's scope.
- **Rebuild.** `node scripts/build.cjs` then `node scripts/validate.cjs` were re-run. `validate.cjs` reports `ok: true, errors: 0` (1 pre-existing warning, unrelated: the `pf_reality_*` overlays with no fauna rows, and the malchevsky nigra/niger heading note, both already known limits, untouched). Row counts are unchanged (mammals 44, birds 149, presence 4231, categories 220, taxa_checks 27, sources 21), and the class/season breakdowns in `README.md` still match `validate.cjs`'s output exactly, so `README.md` needed no edit. Diffing every output CSV against the pre-fix versions confirms only `wild_habitat_presence.csv` and `fauna_categories.csv` changed; `mammals.csv`, `birds.csv`, `taxa_checks.csv`, `sources.csv` and `build-report.json` are byte-identical to before the fix.
- **Not done (out of scope for this pass):** everything in "Required before approval" items 3–5 (Мальчевский `mpage` values, `taxa_checks.csv` source/confidence fixes, the brown long-eared bat's source/note) and all "Recommended (limits)" items live in `mammals.csv`, `birds.csv`, `taxa_checks.csv` or `sources.csv`, none of which were marked `rework`, so none were touched.

## Повторная проверка 2026-09-26

Independent re-checker (senior pass, not the fixer). Scope: the two files marked `rework`. No data file was edited; all checks were run by scripts from the scratch folder `gb-fix-fauna-mammals-birds/recheck/`.

**Method (scripts):**
- Rebuilt a copy of the group folder in scratch (`node scripts/build.cjs`, then `node scripts/validate.cjs`): all six CSV hashes are identical to the live files, `validation-report.json` is identical, `ok: true`, 0 errors, 1 known warning.
- Row counts: mammals 44, birds 149, presence 4231, categories 220, sources 21. Unchanged.
- Column-level diff against the fixer's pre-fix snapshot (`gb-fix-fauna-mammals-birds/before/`): same keys and row order in both files. Presence: exactly 450 rows changed, only `state` and `observable_signs` (`breeding`→`present_departing` 423, `breeding`→`passage` 27; `voice;nest`→`voice` 450). Categories: exactly 135 rows changed, only `source_refs` (`SRC_WK_FAUNA`→`SRC_PANT2001`). `mammals.csv`, `birds.csv`, `taxa_checks.csv`, `sources.csv`, `build-report.json` are byte-identical to the snapshot.

### `fauna/wild_habitat_presence.csv` — approve_with_limits (was rework)

Problem 1 (autumn `breeding` + `nest`) is **resolved**:
- `state=breeding` outside spring/summer: 0 rows. The token `nest` occurs only in spring (489) and summer (504), always with `state=breeding`.
- All 450 autumn rows of the 84 B-coded birds follow the rule: `passage` if `mass_passage=true` (6 taxa: crane, teal, pintail, tufted duck, goosander, siskin), otherwise `present_departing`. Mismatches: 0.
- `frequency_class`/`weight` recomputed for these 450 rows from base class and fit: 0 mismatches. The confidence rule (C if taxon presence is C, else B): 0 violations. Empty `source_refs`/`confidence`: 0.
- Sample of 15 rows checked against the taxon rows and the sources: the chaffinch and crane autumn examples, 4 `present_departing`, 3 autumn `passage`, 2 `breeding`, 2 mammal rows, 2 winter bird rows. All are consistent. Book evidence (the modern handbook, analogy only) agrees with autumn departure. Examples: chaffinch leaves at the end of September to October (book:756195 ¶149), cranes gather in flocks before autumn departure (book:234771), rook leaves in October, song thrush from September to November.

Limits that remain (none blocks candidate use):
1. `present_departing` is a new state value. The state list in `README.md` (files table, presence row) does not include it. The fixer's statement that README "needed no edit" is right only for the counts. The README owner should add the value.
2. `birds.csv.migration_autumn` still shows `breeding` for these 84 taxa (birds item 8). So the taxon file and the presence file now disagree on the autumn state label. This is in scope for `birds.csv`.
3. There is no departure-month step-down. Early leavers keep their full base class all autumn. Examples: redstart and wryneck (they leave from late August), cuckoo, nightjar, black kite, honey buzzard. This was recommended, not required.
4. Presence problem 2 is still open: house sparrow rows in `pf_town_street`, `pf_market_square`, `pf_town_courtyard` and `pf_town_wall_edge`, against the fchk_025 label `included_rural_contextual`. This was recommended.
5. Problem 3 is a known limit: the season collapse in places-binding `build-presence-rules.mjs`.

### `fauna/fauna_categories.csv` — approve_with_limits (was rework)

Problem 1 (false `SRC_WK_FAUNA` fallback) is **resolved**:
- Taxon category rows: 193. Bird rows: 135 cite `SRC_PANT2001`, and all 149 birds have `panteleev_2001_listed=true`. The other 14 bird rows cite their own first authored source: `SRC_GOROBETS2017` 6, `SRC_ZIN2025` 6, `SRC_WK_BIRDRES` 1, `SRC_ZIN2012` 1.
- Every taxon category's `source_refs` occurs in that taxon's own `source_refs`. The one exception is below.
- Parents and all `category_ref` values resolve.
- Sample: all 14 non-Пантелеев bird rows, plus lynx, checked against the `sources.csv` descriptions and abstracts. Examples: Gorobets 2017 names crane, swans, geese, goshawk, capercaillie and black grouse; Zinoviev 2025 names the corvids, pigeon and tree sparrow; Zinoviev 2012 covers the white-tailed eagle; WK_BIRDRES covers the mallard. All are supported. Lynx keeps `SRC_WK_FAUNA` legitimately, because it has WK concept and claim refs.

Limits that remain:
1. `fauna.mammal.bat.brown_long_eared_bat` still cites `SRC_WK_FAUNA`, and that taxon has no `wk_refs`. It is inherited from `mammals.cjs` (mammals item 1, required item 5, still open). After that fix a rebuild corrects this row automatically.
2. The earlier structural limits are unchanged: there is no `confidence` column, `stable_code` embeds the group, and there is no shared `fauna` root. These are registry-owner decisions.

**Outside this re-check:** required items 3–5 are still open. They live in `birds.cjs`/`validate.cjs` (the `mpage` values), in `taxa_checks.csv` (source_refs and confidence) and in `mammals.csv` (the bat). The files they sit in keep their earlier `approve_with_limits` verdicts.
