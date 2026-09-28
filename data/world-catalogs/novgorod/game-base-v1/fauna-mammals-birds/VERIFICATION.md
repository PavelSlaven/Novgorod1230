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

### fauna/phase_activity.csv — rework

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-5, коммит d8c4a2e8).

- **Счёт скриптом.** 2632 строки, 191 вид, 658 пар вид×сезон, у каждой ровно 4 фазы. Полный no_source — 1168 строк, source — 1464, rule_ref — 0. XOR нарушен в 0 строк, все строки candidate.
- **Охват.** Я сам вывел 16 PF из `node_binding.pf_id` и соединил их с presence: получилось 658 пар. Нет ни одной пропущенной пары и ни одной лишней. Список не закреплён вручную. PF из `pf_secondary` в охват не входят: с ними добавились бы перепел и полёвка.
- **Критерий CR (по всей таблице).** Голоса yes днём у ночных видов нет ни в одной строке. Голос yes ночью у дневных видов есть только у четырёх, и у всех это прямо написано в тексте владельца: белолобый гусь («слышно и ночью»), свиязь и белобровик (ночью на пролёте), лесной жаворонок («и днём, и ночью»). Голосов вне audible_seasons нет. Мигранты зимой не появляются. Голос свиязи и белобровика «на пролёте» в сезон гнездования ночью не звучит.
- **Выборка (больше 25 строк).** Сверены волк зимой (вой ночью и на заре — yes, днём no_source), рысь, лось, неясыть, филин, козодой, коростель (ночь yes, осень молчит), вальдшнеп (весенние сумерки), соловей, журавль, выпь, кукушка, зяблик, дрозды, летучие мыши, ёж, барсук. Для ночных голосов ошибок нет.
- **Уверенность (главная причина rework).** 1014 строк с полным `no_source` стоят на B, например `fpa_fa_m_elk_winter_daylight`. Строки, выведенные по общему правилу activity→phase, тоже на B и ссылаются на `#activity_time`, а `rule_ref` нигде не заполнен. Правило выдаётся за источник. Нужно: no_source и правило → C, `rule_ref` на правило.
- **Ошибки разбора текста.** У чёрного дрозда и серой куропатки в тексте «на зорях», но «зор» не распознаётся. Поэтому голос днём yes, а на рассвете no_source, то есть наоборот. У турухтана «почти безмолвен», а голос днём yes, в том числе осенью.
- **Видимость ночных днём = no.** Это жёсткий запрет из грубого «nocturnal», источника у него нет. WK пишет «mainly nocturnal». У выдры собственная ссылка WK говорит «crepuscular». Днём заяц, кабан, волк и горностай станут невидимы. Лучше no_source или явная метка C.
- **Пропущенные источники** (books-evidence fauna-mammals-birds): выпь днём и ночью, весна–июль (L178); журавль осенью кричит в полёте днём и ночью (L160); кабан летом встаёт до заката (L68); глухари вечером на токовищах (L147); стрижи с визгом на рассвете (L299).
- **Одна строка на факт.** PF и presence в строки не скопированы. `voice_text_ref` указывает на поле владельца, текст не повторяется. Удалённых строк нет, это новый файл.

### fauna/activity_phase_rules.json — rework

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-5, коммит d8c4a2e8).

- Правило одно на обе группы, вторая группа только ссылается на него. Это соответствует плану.
- В файле нет ни id, ни основания, ни уверенности. Нигде не написано, что это редакционное правило C. В строках на правило не ссылаются (`rule_ref` пуст везде), вместо этого стоит ссылка на поле `activity_time`, и значения держат уверенность B.
- `diurnal→daylight=yes`, `nocturnal→night=yes`, `crepuscular→dawn/dusk=yes` и `cathemeral→всё yes` следуют из самого смысла класса. Честно стоят и no_source у сумеречных в нерабочих фазах.
- `nocturnal→daylight=no` и `diurnal→night=no` уже не определение, а редакционный вывод. Для голоса это нужно по критерию CR. Для видимости это запрет без источника: WK сам пишет «mainly nocturnal».
- Нужно: id, `basis: editorial`, `confidence: C`, ссылки из строк через `rule_ref`. Для видимости nocturnal днём — no_source или «no» по решению владельца.

### scripts/voice-phase.cjs, validate-phase.cjs, build.cjs, README — rework

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-5, коммит d8c4a2e8).

- **Охват из данных.** Сборщик и валидатор оба берут 16 PF из `node_binding.pf_id` и соединяют их с presence. Закреплённого списка нет. Валидатор падает на недостающей тройке вид×сезон×фаза (строка 105), на строке вне охвата, на дубле и на нарушении XOR.
- **Прогон.** `validate-phase.cjs fauna-mammals-birds --self-test`: 0 ошибок, 2632 строки, рабочее дерево не изменилось.
- **Критерий CR отдельно не проверяется.** Валидатор зовёт тот же `voicePhase`, что и сборщик, и сравнивает строки с его выводом. Проба «филин днём с голосом» падает только из-за этого совпадения. Ошибка в самой функции проходит обе стороны: так прошли «на зорях» у чёрного дрозда и куропатки и «почти безмолвен» у турухтана. REVIEW-C006a4 требовал отдельную проверку с отрицательной пробой. Нужно: независимое правило по `activity_time` и тексту владельца плюс проба, которая обходит повтор.
- **Уверенность.** Валидатор проверяет только, что уверенность не выше, чем у вида. Строки с no_source и строки по правилу на B он пропускает. Нужно требовать C.
- **Разбор текста.** Нужно добавить «зор» (обе зари) и «безмолв» (молчание).
- **Ссылки.** Голос «no» вне сезона и спячка ссылаются на `activity_time`, а нужно на `audible_seasons` и `dormant_seasons`.
- **README** честно описывает охват и XOR, а также то, что no_source не значит «нет». Не хватает пометки, что правило редакционное C.

### C006b3 — доработка фаз, 2026-09-27

- Разбор `voice_description` сохраняет общий голос до оговорок «у гнезда» и «особенно…», отделяет добавочное «и ночью», не считает «на лету» летним сезоном и не переносит «примета весны» на голос грача. Проверены реальные строки неясыти, крохаля, цапли, белолобого гуся, гагары и грача, а также отрицательные сезонные и пролётные пробы.
- Слышимость млекопитающих берётся из `signs_sounds` владельца и его сезонных оговорок. Несогласованных `voice=yes` / `wild_habitat_presence.audible=false`: **18 → 0**. Валидатор независимо сверяет обе таблицы; мутация `audible` волка весной отклоняется. У 2632 фазовых строк уверенность C, включая спячку.
- Сборка дважды дала одинаковые SHA-256 для генерируемых CSV и отчётов. `scripts/validate.cjs`: ok, 0 ошибок; `validate-phase.cjs fauna-mammals-birds --self-test`: 2632 строки, 0 ошибок. Проверка ссылок, XOR, CR и отрицательные пробы пройдены.

### C006b3 — исправление аудита контрактов

- Обычный звук без явного сезона или времени суток больше не превращается в фазовый голос млекопитающего. «Почти неслышен», «редко; …» и крик пойманного зайца не дают `voice=yes` или `presence.audible=true`; это закреплено пробами. Число слышимых строк присутствия млекопитающих: **169 → 233**, голосовых фаз `yes`: **46 → 27**, противоречий между таблицами: **18 → 0**. Предыдущий промежуточный вывод 1156/268 был избыточным и заменён этими числами.
- Валидатор проверяет точный ID JSON-правила, точный ID и поле CSV без лишнего суффикса, а книжную ссылку — только на строку данных (не заголовок). Пробы с выдуманным правилом, лишним суффиксом CSV и ссылкой на `L1` отклонены.

### C006b3 — сохранение безусловных звуков

- После аудита восстановлена общая ветвь `signs_sounds`: безусловный звук относится к фазам `activity_time`, а последующая оговорка «при тревоге» не скрывает предшествующее хрюканье. Белка летом днём и кабан летом ночью имеют `voice=yes` и `presence.audible=true`. Отрицательные пробы для почти неслышного ушана, пойманного зайца и редкого звука росомахи по-прежнему проходят.
- Итоговые строки млекопитающих: `audible=true` **169 → 981**, фазовый `voice=yes` **46 → 229**, конфликтов **18 → 0**. Числа блока «исправление аудита контрактов» выше относятся к промежуточной слишком строгой версии; эти итоговые числа заменяют их.

### C006b3 — уточнение тревожных звуков

- «Крик тревоги» косули остаётся условным: летом в сумерках `voice=no_source`, строки присутствия `audible=false`. У бобра фраза «при тревоге» ограничивает шлепок хвостом, но не следующий самостоятельный всплеск ныряния: летом ночью `voice=yes` и `audible=true`. Реальные пробы закреплены в self-test.
- Итог после этого уточнения: слышимых строк млекопитающих **169 → 978**, фазовых `voice=yes` **46 → 225**, конфликтов **18 → 0**. Эти числа заменяют промежуточные 981/229 выше.
### fauna/phase_activity.csv — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-5, второй круг, коммит 400fd636).

- **Счёт скриптом.** 2632 строки, 191 вид, 658 пар вид×сезон, те же id, что в d8c4a2e8, ничего не удалено. Полный no_source — 1137, rule_ref — 1318, source — 177. XOR нарушен в 0 строк. Уверенность C у всех 2632 строк.
- **Охват.** Заново вывел 16 PF из `node_binding.pf_id` и соединил с presence: 658 пар, пропусков и лишних нет.
- **Прежние замечания.** Уверенность — исправлено. Правило больше не выдаётся за источник: ссылок на `#activity_time` нет, все 1318 строк по правилу совпадают с `activity-phase-v1` по видимости и голосу. «На зорях» у чёрного дрозда и куропатки теперь даёт голос на заре и вечером, а днём no_source. Турухтан («почти безмолвен») нигде не слышен. Видимость ночных днём стала no_source в 102 строках; 8 оставшихся «no» — спячка. Голос вне сезона и спячка ссылаются на `audible_seasons` и `dormant_seasons`.
- **Новые источники сверены с книгами.** Выпь L178 («и днём и ночью, чаще вечерами, с ранней весны и по июль») — голос днём, вечером и ночью весной и летом. Журавль L160 — голос ночью осенью. Кабан L68 («поднимаясь с лёжек ещё до захода солнца») — виден в сумерках летом. Глухарь L147 («с наступлением вечера … на токовища») — виден вечером весной. Стриж L299 — голос на рассвете летом. Цитаты переданы верно. У журавля и стрижа это вывод, для C он приемлем.
- **Критерий CR по всей таблице.** Голоса yes днём у ночных видов нет ни в одной строке (110 строк: все «no»). Голос yes ночью у дневных видов есть в 8 строках: журавль осенью (книга), белолобый гусь, свиязь, белобровик и лесной жаворонок. У всех четырёх птиц ночь прямо написана в тексте владельца. Голосов птиц вне `audible_seasons` нет.
- **Выборка (больше 20 строк).** Сверены лось, барсук в спячке, журавль, кабан, глухарь, стриж, филин, выпь (все фазы), неясыть длиннохвостая, крохаль, цапля, чёрный дрозд, куропатка, коростель осенью, белолобый гусь, выдра, беляк, зяблик, свиязь, белобровик, волк, ёж, мышь, летучие мыши.
- **Уверенность C у строк с источником.** Для 133 из 177 строк это правильно: одна грань взята из правила или неизвестна, а столбец уверенности один. Для 44 строк спячки обе грани из поля владельца — там C излишне осторожен, но правил не нарушает. Основание всё равно видно по `source_refs` и `rule_ref`.
- **Новые пропуски из-за разбора текста (major, не блокирует).** Голоса, которые есть у владельца, стали no_source. Неясыть длиннохвостая и большой крохаль теперь не слышны ни в одной фазе: оговорка «у гнезда» выбрасывает всю фразу вместе с основным криком. «На лету» у цапли прочитано как «лето», поэтому весной и осенью голоса нет. «Слышно и ночью» у белолобого гуся и «особенно в светлые вечера» у гагары сняли дневной голос. «Примета весны» у грача сузила гомон колонии до весны. Ложных yes нет, это только пропуски.
- **Расхождение с presence (major, не блокирует).** В 18 строках голос yes, а `wild_habitat_presence.audible=false` для этого сезона. Это волк весной, ёж, домовая мышь, садовая соня и три летучие мыши. Голос взят из текста владельца, но слышимость в presence задаёт список `MAMMAL_AUDIBLE` в build.cjs без источника. Две таблицы одной группы теперь спорят. Нужно решение, кто владелец слышимости.
- **Мелкое.** В 71 строке видимость взята из правила, а строка ссылается только на источник голоса. У журавля осенью ночью видимость «no» по правилу стоит рядом со ссылкой на L160, где сказано, что стаи летят и ночью.

### fauna/activity_phase_rules.json — approve

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-5, второй круг, коммит 400fd636).

- Есть `id: activity-phase-v1`, `basis: editorial`, `confidence: C` и короткое основание. Строки ссылаются на пункт правила через `rule_ref`. Все 1318 таких строк совпадают с правилом.
- Видимость ночных днём теперь `no_source`, а не жёсткий запрет. Запрет голоса ночных днём вынесен отдельно в `voice_rules`: он нужен для критерия CR и помечен как C.
- `diurnal→night=no` для видимости остался. Это редакционный вывод C, ночью дневная птица почти не видна, приемлемо.
- В том же файле лежат `derived_rules` второй группы: лягушка, кузнечики, стрекозы, комары, петух. У каждого есть id, основание, C и ссылка. Это согласуется с решением «одно правило на обе группы». Здесь их по существу не проверял.

### scripts/voice-phase.cjs, validate-phase.cjs, build.cjs, README — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-5, второй круг, коммит 400fd636).

- **Прогон.** `validate-phase.cjs fauna-mammals-birds --self-test`: 0 ошибок, 2632 строки, рабочее дерево не изменилось. Сборку не запускал.
- **Отдельная проверка CR теперь настоящая.** `criterionCR` (строки 38–45) не вызывает `voicePhase`. Функция смотрит только на `activity_time`, маркеры «днём/ночь» в тексте владельца и ссылку на книгу. Проба на филине вызывает её напрямую (строка 223), а через `validate` ловит именно ошибку «criterion CR». Я проверил своей пробой: подменил `voicePhase` так, чтобы он отвечал «yes». Голос неясыти и ежа днём и голос зяблика ночью всё равно отклоняются с ошибкой «criterion CR».
- **Предел этой проверки.** Маркер ищется во всём тексте вида, без учёта сезона. Ссылка на любую строку books-evidence пропускается, строка не читается. При той же подмене ночной голос свиязи летом проходит без ошибок, хотя ночь у неё есть только на пролёте.
- **Уверенность.** Для no_source и строк по правилу validator требует C (строка 91). Для смешанных граней тоже требует C (строки 122–123). Пробы на лосе и выпи ловят B.
- **Разбор текста.** «Зор*» и «безмолв*» добавлены, сезоны разбираются по русским формам. Новое разбиение по фразам дало пропуски (major). Оговорка «у гнезда» выбрасывает всю фразу вместе с основным криком. «На лету» считается летом. «И ночью» и «особенно …» понимаются как ограничение, а не как добавление. Для слышимости млекопитающих проверку «не слышно в сезон» перенесли после разбора, поэтому совпадение по слову «ночью» её обходит. Validator расхождение с presence не проверяет.
- **Книжные исключения** (выпь, журавль, кабан, глухарь, стриж) записаны условиями в build.cjs и повторены в validator. Лучше вынести их в маленький файл данных.
- **README.** Теперь написано, что правило редакционное C, что no_source имеет C и что прямые утверждения ссылаются на поле владельца или книгу.

### fauna/wild_habitat_presence.csv — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-5, третий круг, коммит 1172ead1).

- **Что изменилось, скриптом.** 4231 строка, те же id и порядок, тот же заголовок. Изменились только два столбца: `audible` в 853 строках и `source_refs` в 978. В `source_refs` ровно дописано `mammals.csv#<id>.signs_sounds`, и только там, где `audible=true`. Птицы не тронуты: 2796 слышимых строк было и осталось. Слышимых строк млекопитающих 169 → 978, как в сдаче. В спячке слышимых строк 0 (из 88). По одному виду и сезону значение одинаково во всех PF.
- **Прежнее замечание закрыто.** Список `MAMMAL_AUDIBLE` без источника удалён. Слышимость теперь берётся из текста владельца (`mammals.signs_sounds`). Противоречий «голос yes, `audible=false`» было 18, стало 0. Обратных случаев (слышим в сезон, но ни одной фазы с голосом) тоже 0.
- **Выборка: все 34 вида млекопитающих, 853 изменённые строки.** Сверил текст владельца по каждому виду и сезону. Оправданы текстом: лось (треск сучьев, фырканье — круглый год), кабан (хрюканье), северный олень, медведь (кроме зимней спячки), волк (вой без сезона), лисица («тявканье, особенно зимой» — общий голос), барсук, ёж, выдра, белка, летяга, горностай, ласка, хорь, мыши, полёвки, бурозубки, соня, летучие мыши. У двухцветного кожана голос только осенью, как в тексте («осенью … щебет»). Без выдуманных звуков: беляк (только крик пойманного зайца), ушан («почти неслышен»), росомаха и куница («редко»), соболь, норка, крот, мышовка, лесной лемминг, нерпа (текста нет) — все `false`. Косуля («крик тревоги») — теперь `false`, причина записана в README.
- **Потеря (major, не блокирует).** Рысь зимой была `true` и стала `false`. У владельца: «в гон — хриплое мяуканье, вопли», а `rut_period` — «февраль–март», то есть зима. Разбор просто выбрасывает всё с «в гон», хотя README обещает относить ограниченный звук к указанному сезону. В README и VERIFICATION эта потеря не названа. Ложного `true` здесь нет, это пропуск.
- **Спорно (minor).** Бобр и водяная полёвка зимой стали слышны по «всплеску ныряния» и «всплеску прыжка в воду». При этом в `season_winter` владельца написано «живёт подо льдом» и «живёт … в норах». Сезонное поле того же владельца не учтено.
- **Предел столбца.** «Писк» и «стрекот» мелких зверей без оговорок, поэтому слышны во все активные сезоны, и зимой под снегом тоже. Текст это формально разрешает. Но громкости в столбце нет: тихий писк весит столько же, сколько вой волка. Само `audible` — редакционный вывод C, а уверенность строки осталась B (она про присутствие).
- **Запись изменения.** README, раздел «C006b3: согласование слышимости», и четыре блока C006b3 в VERIFICATION объясняют причину и дают итоговые числа (978/225/0). Промежуточные числа 233/27 и 981/229 прямо помечены как заменённые. Удалённых строк нет.

### fauna/phase_activity.csv — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-5, третий круг, коммит 1172ead1).

- **Счёт скриптом.** 2632 строки, те же id и порядок. Изменились только `voice_state` (222 строки) и `voice_text_ref` (211). Видимость не менялась. Основания те же: правило 1318, пробел 1137, источник 177, XOR нарушен в 0 строк. Уверенность C у всех строк. Голос yes: млекопитающие 46 → 225, птицы 472 → 488. Всего 203 новых yes и 8 снятых.
- **Прежние замечания закрыты.** Вернулись голоса неясыти длиннохвостой (ночью во все сезоны), большого крохаля (днём, и зимой, так как в `audible_seasons` есть зима), цапли (днём весной и осенью), белолобого гуся (днём весной и осенью, ночь была и раньше), гагары (днём) и грача (днём зимой, летом и осенью). Противоречий с `wild_habitat_presence.audible` 0 (было 18). Голосов птиц вне `audible_seasons` 0.
- **Критерий CR своим скриптом по всем строкам.** У ночных видов голоса днём нет, кроме выпи (книга L178, как во втором круге). У дневных видов голос ночью есть в 8 строках: журавль осенью (книга L160), белолобый гусь («слышно и ночью»), свиязь весной и осенью («в пик пролёта … ночной воздух»), лесной жаворонок («и днём, и ночью»), белобровик осенью («ночью с неба … пролётных»). Ночь везде прямо написана у владельца. Летнего ночного голоса у свиязи нет. Ночного голоса днём нет.
- **Выборка: все 203 новых yes, по видам.** Каждое новое yes сходится с текстом владельца и правилом `activity-phase-v1`: кабан ночью зимой и весной (хрюканье), лось на заре и в сумерках (треск, фырканье), медведь и лисица на заре и в сумерках, барсук, горностай, хорь, летяга, мыши ночью, полёвки, бурозубки, ласка и олень во всех фазах (активны круглые сутки), выдра и ночница Добантона ночью. Снятые yes: косуля (только «крик тревоги») и кречет («редко слышен») — по правилу README. Рысь зимой тоже снята (см. ниже).
- **Пропуски (minor).** Рысь зимой на заре и в сумерках: голос в гон, а гон у владельца «февраль–март», то есть зима. Разбор это выбрасывает. Бобр ночью зимой и водяная полёвка зимой слышны по всплеску, хотя владелец пишет «подо льдом» и «в норах». Замена голоса кречета в VERIFICATION не названа.
- **Прогон.** `validate-phase.cjs fauna-mammals-birds --self-test`: 2632 строки, 0 ошибок, рабочее дерево не изменилось. Сборку не запускал.

### scripts/voice-phase.cjs, validate-phase.cjs, build.cjs — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-5, третий круг, коммит 1172ead1).

- **Прогон.** `validate-phase.cjs fauna-mammals-birds --self-test`: 0 ошибок, 2632 строки, `git status` чистый. Сборку не запускал.
- **build.cjs.** Список `MAMMAL_AUDIBLE` без источника удалён. `mammalAudible` даёт `false` в спячке, а иначе спрашивает `voicePhase` по тексту владельца. У положительной строки есть ссылка на `signs_sounds`. Мой скрипт показал, что так и есть во всех 978 строках.
- **voice-phase.cjs.** Исправлено: «у гнезда», «особенно», «и ночью», «слышно и ночью» отделяются как добавки, общий голос до них сохраняется. «На лету» больше не читается как «лето». «Почти неслышен», «редко; …», «пойманный», «при тревоге», «крик тревоги» не дают обычного голоса. Самостоятельный звук после «при тревоге» оценивается отдельно (всплеск бобра). На реальных строках результат совпал с моим разбором.
- **Предел разбора (minor).** Фраза с «в гон» выбрасывается целиком, её нельзя отнести к `rut_period`. Отсюда потеря рыси зимой. Сезонные поля владельца («подо льдом», «в норах») не учитываются.
- **Проверка presence не независимая (major, не блокирует).** Validator считает ожидаемый `audible` той же функцией `voicePhase` и тем же выражением, что и сборщик. Он ловит ручную правку и расхождение таблиц (своя проба: `audible=true` у беляка летом отклонена). Но ошибку самого разбора он не поймает. Своя проба: подменил `voicePhase`, чтобы он отвечал «yes» для беляка. Тогда `audible=true` летом и голос ночью проходят без ошибок про presence. README называет эту проверку независимой; на деле это проверка согласованности с пересборкой. Независимой остаётся только `criterionCR`, как во втором круге.
- **Новые самотесты.** Ожидания для неясыти, крохаля, цапли, гуся, гагары, грача, белки, кабана, бобра, отказы для ушана, беляка, росомахи, косули, мутация `audible` волка весной — все на реальных строках и проходят. Строгая проверка ссылок (`resolves`) работает и в этой группе.

## C006b4: дополнение к прежней проверке

Предыдущие записи выше сохранены как история проверки C006b3. «Редко слышен» у кречета остаётся причиной отсутствия обычного голоса. Текущая сборка даёт 975 слышимых строк млекопитающих и 226 фаз с `voice=yes` при прежних 4231 строках присутствия и 2632 фазах. Все 44 значения `mammals.audible_seasons` заданы автором по тексту вида, включая пустые; рысь — зима и весна, бобр и водяная полёвка — без зимы. Валидатор проверяет присутствие по `audible_seasons` и `dormant_seasons`, а фазы — по схеме, ссылкам и согласованности. Ограничение: фазы голоса выведены правилом сборщика по прозе и проверены только выборочно; независимого второго парсера нет.

### fauna/mammals.csv — audible_seasons — approve

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-5, C006b4, коммит d2ebf484).

- **Метод.** Скрипт сверил выгрузку `mammals-audible.md` с `mammals.csv` @ d2ebf484: 44 строки, 0 расхождений; остальные колонки просканированы на звуковые слова, звуков вне `signs_sounds` нет. Затем для каждого из 44 видов поле заново выведено по правилу ревьюера из `signs_sounds`, `season_*`, `rut_period`, `dormant_seasons` и сравнено с авторским значением.
- **Итог.** 44 из 44 ok; too_broad: нет; too_narrow: нет. Сезоны из `dormant_seasons` ни в одно поле не попали (медведь, барсук, ёж, мышовка, соня, 5 рукокрылых). Звуки только «при тревоге», «пойманного», «редко», «почти неслышен» и пустые `signs_sounds` верно дают «—» (косуля, росомаха, куница, заяц-беляк, ушан и др.).
- **Рысь, бобр, водяная полёвка.** Рысь: единственный звук «в гон — хриплое мяуканье, вопли», гон февраль–март → winter;spring, верно. Бобр: шлепок хвостом «при тревоге» не учитывается, «всплеск ныряния» — водный звук, «живёт подо льдом» снимает зиму → spring;summer;autumn, верно. Водяная полёвка: «всплеск прыжка в воду» — водный звук, зимой «живёт на запасах корма в норах» → spring;summer;autumn, верно.
- **Спорные строки.** нет.
- **Ограничения.** Пограничные случаи решены в пользу автора и не считаются спорными. Писк под снегом зимой у бурозубок, куторы и полёвок остаётся в поле: правило снимает сезон только для водных звуков. «Тихое чириканье» летяги в список исключений не входит. У лисицы тявканье «особенно зимой в гон» гоном не ограничено. «Всплеск ныряния» бобра в `signs_sounds` с тревогой не связан, хотя в `behaviour_to_humans` сказано «при тревоге ныряет»; если считать его звуком тревоги, поле бобра станет «—». Замечание по биологии (к тексту, не к полю): косуля лает не только при тревоге, но и территориально и в гон; текст владельца это сужает, а поле честно следует тексту. Производные `phase_activity.csv`, `wild_habitat_presence.csv` и скрипты сборки и валидации не проверялись — вне задачи.

### fauna/wild_habitat_presence.csv — approve

Проверено: Claude Opus 5.5, скриптом `check-c006b4.mjs` и повторной сборкой (независимая проверка CR #158 D-5, C006b4, коммит d2ebf484 против fa339ee7).

- **Повторная сборка.** `build.cjs` в отдельном worktree даёт побайтно те же файлы, `git status` пуст. `validate.cjs` и `validate-phase.cjs fauna-mammals-birds --self-test` — 0 ошибок, 2632 фазы.
- **Формула.** Во всех 4231 строке `audible` млекопитающих равно `season ∈ audible_seasons и season ∉ dormant_seasons`: расхождений 0. Число строк, id и заголовок не изменились.
- **Что изменилось.** Только три вида:
  - рысь: зима и весна по 6 строк, `audible` false → true;
  - бобр: зима, 8 строк, true → false;
  - водяная полёвка: зима, 7 строк, true → false.
  
  В тех же строках поправлены `source_refs`. Итог: 978 − 15 + 12 = 975 слышимых строк млекопитающих, как в сдаче.
- **Validator.** В `validate-phase.cjs` нет разбора месяцев, сезонов и оборотов прозы (поиск по «январ… / весн… / в гон / подо льдом» — 0 строк). Слышимость млекопитающих и птиц сверяется с полями `audible_seasons` и `dormant_seasons`.

### fauna/phase_activity.csv — rework

Проверено: Claude Opus 5.5, скриптом `check-c006b4.mjs` и прямым вызовом `voice-phase.cjs` обеих версий (C006b4, коммит d2ebf484 против fa339ee7).

- **Заявленные изменения верны.**
  - Рысь: `voice=yes` на зорях зимой и весной (4 строки), по гону февраль–март при `activity_time=crepuscular`.
  - Бобр, зима, ночь, и водяная полёвка, зима, обе зори: `yes` → `no_source` (3 строки).
- **Незаявленное изменение — ошибка.** Певчий дрозд, `civil_dawn` весной, летом и осенью: `no_source` → `yes` (3 строки). В DONE этого нет.
  - Текст владельца: песня «на вечерней заре» — утренней зари там нет.
  - Причина — новое деление в `voice-phase.cjs` по `[.!?]`: «!» внутри цитаты «(«Филипп, Филипп, чай пить!»)» отрезает песню от указания времени. Песня становится «общей» и получает утреннюю зарю по классу активности.
  - Проверено вызовом: старая версия даёт `civil_dawn` = `no_source`, новая — `null` → `yes`. Без «!» новая версия тоже даёт `no_source`.
- **Что нужно.**
  1. Сборщик не делит фразу внутри «…» и скобок.
  2. Три строки дрозда возвращаются к `no_source`.
  3. К каждой сдаче данных — список изменённых строк по сравнению с прошлым коммитом, сделанный скриптом: id и столбец «было → стало». Всё, что не названо в DONE, — ошибка сдачи.
- **Ограничение.** Для млекопитающих вне `audible_seasons` сборщик ставит `no_source`, для птиц — `no`. Для рассказчика оба значения значат «не озвучивать». Выравнивать сейчас не требуется.

### fauna/phase_activity.csv — approve_with_limits (C006b5, закрывает rework C006b4)

Проверено: Claude Opus 5.5, повторной сборкой и построчным diff (C006b5, коммит 367a88c0 против d2ebf484).

- **Повторная сборка.** `build.cjs` в отдельном worktree даёт те же байты. `validate.cjs` и оба `validate-phase --self-test` — 0 ошибок (2632 и 996 фаз).
- **Что изменилось.** Ровно 3 строки: `fpa_fa_b_song_thrush_{spring,summer,autumn}_civil_dawn`, `voice_state` `yes` → `no_source`, `voice_text_ref` очищен. Это совпадает со списком в DONE. Вечерние строки дрозда и остальные голоса не тронуты.
- **Причина устранена.** Сборщик делит фразу по `.?!` только вне кавычек и скобок; добавлена регрессионная проба на цитату дрозда.
- **Разделы C006b4** дописаны дословно, по одному разу; строк из VERIFICATION не удалено.
- **Ограничения.** Прежние: фазы голоса выводит только сборщик по тексту, validator прозу не разбирает; содержание проверяется выборочно ревьюером.

### fauna/birds.csv (voice_sound_ru) — rework
Проверено: Claude Opus 5.5 (независимая проверка CR #158, C007c, коммит 11bf6ca7 против 1f1ed858).
- Скриптом: 149 строк, 149 непустых `voice_sound_ru`; прежние 38 колонок побайтно равны 1f1ed858 (0 расхождений); `fauna/phase_activity.csv` птиц — нулевой diff. Все звукоподражания в кавычках из `voice_sound_ru` дословно есть в `voice_description`. Все 149 пар прочитаны вручную.
- Придуман звук у птиц, которые по описанию молчат: `fa_b_smew` («почти молчалив», `audible_seasons` пуст) → «тихий крик»; `fa_b_gyrfalcon` («редко слышен») → «отрывистый крик»; `fa_b_ruff` («почти безмолвен; на токах — драки…») → «тихое пощёлкивание». Это прямо нарушает критерий. Причина — validator требует непустой `voice_sound_ru` при любом `voice_description` и так вынуждает выдумывать.
- `fa_b_black_stork`: выпало «обычно молчалив», голоса птенцов («верещание и гогот») приписаны птице вообще. Рассказчик получит шумного аиста.
- Мелкие вольности, не блокируют: `fa_b_thrush_nightingale` «с переливами» вместо «с коленами»; `fa_b_raven` «звонкие переливы» вместо «колокольчиков»; `fa_b_greylag_goose` «громкий» добавлен; `fa_b_golden_eagle` потеряно «редко»; `fa_b_chaffinch` «и «рюмит»» — глагол вместо существительного, по-русски коряво; `fa_b_long_eared_owl` «скрипучий писк» — это голос птенцов.
- Ограничение: у голосов, которые звучат только у гнезда (`fa_b_goshawk`, `fa_b_sparrowhawk`, `fa_b_hen_harrier`, `fa_b_marsh_harrier`, `fa_b_hobby`, `fa_b_goosander`, `fa_b_black_stork`), условие «у гнезда» из короткого поля убрано верно, но ни в одном поле фаз или сезонов его нет. Рассказчик может пустить крик ястреба где угодно.
- Остальные примерно 135 строк — хороший короткий русский текст: только сам звук, ничего не добавлено.

### fauna/birds.csv (voice_sound_ru) — approve (C007c2, закрывает rework C007c)

Проверено: Claude Opus 5.5, построчным diff (C007c2, коммит 8f0c1d91 против 79c43d06).

- Изменены ровно 10 ячеек `voice_sound_ru`, как в DONE.
  - У трёх молчащих птиц (луток, кречет, турухтан) звук снят.
  - Голос птенцов чёрного аиста и ушастой совы убран.
  - Формулировки соловья, зяблика, ворона, серого гуся и беркута приведены к описанию.
- `phase_activity.csv` птиц не изменился.
- Validator разрешает пустой звук только для молчащей строки или пустого `audible_seasons`, проба есть.

### Крот и кряква — видимость и зимнее присутствие (C014) — approve_with_limits

Проверено: Claude Opus 5.5, ревьюер. Цитаты сверены с полнотекстовым индексом книг: `book:498801 §406` и `book:756203 §289` найдены по указанным абзацам. Построчный diff против `056cc927`.

- **Крот.**
  - Весной на `pf_floodplain_meadow` частота снижена с common/4 до rare/1. Основания: «Крот — подземный житель… только в редких случаях выходит на поверхность» (§406); в половодье норы затапливаются, кроты гибнут (§289).
  - Во всех 16 строках фаз стартовой территории видимый зверь заменён на `visibility_state=no_source` с отдельным правилом.
  - Кротовины как следы сохранены.
- **Кряква.** Статус вида зимой `irregular` сохранён, добавлено `winter=open_water_only`. Сняты 10 зимних строк мест и 4 строки фаз: ни один тип места сам по себе не означает полынью. Основания: `SRC_MALPUK1983`, заметка вида, `claim:fauna-mallard-residency`.
- **Производное.** `presence_rules.csv`: 5717 → 5707 — ровно эти 10 правил; у правила крота изменились только частота, вероятность и ссылки.
- **Ограничения.**
  - Зимой на переправе остаются 2 слышимых вида вместо порога 3 — предупреждение валидатора, других видов не придумано.
  - Зимняя кряква вернётся, когда состояние мира будет давать открытую воду (модификатор зимы, #171).
  - `presence_rules.csv` входит в данные волны R-1: при следующем пине данные волны пересобираются и переутверждаются.
