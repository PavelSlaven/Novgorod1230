# VERIFICATION: clothing-appearance (game-base-v1)

- **Who:** independent verifier agent (`verify-clothing-appearance`), which is a senior pass and not the author. The author was `collect-clothing-appearance`.
- **When:** 2026-09-26
- **What:** `data/world-catalogs/novgorod/game-base-v1/clothing-appearance/`. This covers all 17 CSV files, `outfits_by_role/runtime_clothing_profiles.json`, `sources.csv`, `scripts/build.py`, `scripts/check.py` and the READMEs.
- **Data files edited:** none. This file is the only thing written.
- **Status after verification:** the data stays `candidate`. This verification does not approve anything for production import. Files marked `rework` must be fixed and then checked again.

## Method

1. **Deterministic, run as scripts.**
   - Ran `python scripts/check.py`. Result: PASS.
   - Counted rows in every file with the Python `csv` module and compared them with the README. All counts match.
   - Checked for duplicate ids, empty `source_refs`, and the distribution of `confidence` values.
   - Compared all 99 costume-derived rows in `garments.csv` and `garment_components.csv` with `sources/costume-dataset-v1/data/catalog_items.csv` on `name_ru`, confidence letter and SRC ids. There were 0 mismatches.
   - Resolved all 47 `claim:`/`wk:` references against the WK production-v1 JSON files. 46 resolved.
   - Checked the 81 rows of `region_clothing_profiles.csv` against the garments. Category, slot, confidence, sex, season and status all match.
   - Checked category instance counts: 0 mismatches.
   - Checked every `gm_id` in every outfit slot against the garment's sex, season, status band and runtime eligibility.
   - Checked that the 71 roles in the role map are the same set as the 71 roles in `novgorod_social_roles_v1_enriched.tsv`.
   - Checked that the slot registrations exist in the v17 `universal_categories.json`.
   - Checked that the 4 reused v17 templates exist in m2c-npc.
   - Checked the runtime `approvedClothing` in `Novgorod-runtime/packages/materialization/src/approved-procedural-npc.js` to confirm the JSON shape.
2. **Manual sample, more than 30 rows, stratified.**
   - garments: 18 rows, 6 each at A, B and C, drawn with a fixed seed. Each was compared with its costume source row: scope, season, social status, materials and colours.
   - The 3 new garment rows (`gm_new_*`) were checked against WK, sqlite and the web source.
   - All 7 components, all 36 adornment/appearance rows, all 24 palette rows, all 24 denylist rows, all 10 foreign profiles, all 3 liturgical kits and all 6 vocabulary requests.
   - 9 outfits in full, plus 12 female wealthy/elite rows for one specific issue.
   - 63 rejected disposition rows.
   - The sources were opened directly:
     - sqlite `material_culture`: rows for the cloak and footwear.
     - sqlite `sources`: S16.
     - risovalka §2 and §1.
     - costume combinations CMB012/013/021/023/024–027/034/044.
     - WK `clothing.json` claims.
     - Web: WEB01 (nkj.ru), WEB02 (istina), WEB03 (esoserver), WEB04 (booksite, decoded as cp1251), WEB06 (hist.msu.ru, Prostrannaya Pravda, frame `prp_t.htm`).
     - Pravoslavnaya Entsiklopediya, article «Митра»: https://www.pravenc.ru/text/2563386.html

## Findings that affect several files

- **F1. Anachronism: the archbishop's mitre (`gm_hw014`, and `lit_archbishop.headwear`).** Pravoslavnaya Entsiklopediya says the bishop's mitre is «впервые упоминается в XV в.», and that in Rus mitres in the form of a cap appear in the 16th century. Before that, Rus prelates had no liturgical headwear other than the klobuk. The costume source itself (HW014, C) only allows the mitre with a caveat, and CMB044 lists it as *optional*. The build turned it into a slot of the liturgical kit. For 1230 it must be removed, or moved to `reject` with the reason "anachronism".
- **F2. Dye evidence attached to materials it does not cover.** `dye_evidence_refs` is built from `color_ids` without looking at the material. 26 rows whose `material_class` is leather, fur or metal carry the textile WK claims (`claim:textile-ellagic-acid-analysis` and others: Nahlik, fabrics) or `undyed(natural wool)`. Examples: `gm_fw018`, an iron ice cleat, cites ellagic acid; `gm_ac003`, an iron buckle, cites the same; `gm_fw021`, shoe laces, and `gm_fw011`, a leather boot, cite "natural wool". These refs must be cleared for non-textile rows, or given a separate leather-dyeing basis.
- **F3. The status parser is wrong in some rows.**
  - `gm_hw002`: the source says «небогатый и средний слой». The output has `low|middle|high` because the keyword «богат» matches inside «небогат».
  - `gm_hw014` and `gm_cl009`: the source says «высшее духовенство». The output has `low|middle|high|elite`.
  - `check.py` does not check whether an outfit's status band is compatible with the status bands of its garments. See F4.
- **F4. Outfit status bands contradict garment status bands.** There are 38 slot-band cases across 13 garment/band pairs. The most important:
  - The merchant (`middle`) wears `gm_gm016`, `gm_gm009` and `gm_hw004`, which are `high|elite`.
  - Traveller (`low`) and elite outfits wear boot `gm_fw007`, which is `middle|high`.
  - Child outfits (`low|middle`) wear the child boot `gm_fw011`, which is `high|elite` («обеспеченные/элита»).
  - The elite outfit wears the shirt `gm_gm001`, which is `low|middle|high` and has no `elite`.
  Either the garment's band or the outfit's choice has to be corrected, and `check.py` needs a check for this.
- **F5. Female outfits use the male belt set.** In 12 female rows of the wealthy and elite classes (6 runtime-selectable), `slot_waist=gm_ac005` («Поясной набор с накладками»). The source item AC005 lists the roles дружинник, купец and зажиточный горожанин, and it appears only in the male combos CMB012, CMB013 and CMB041. The female combos CMB026 and CMB027 do not use it: CMB026 has the AC004 buckle, and CMB027 has no belt. Rule R5 picked the wrong belt for women.
- **F6. Rule S2 widened a season, and the provenance claims an exception log that does not exist.** Provenance of `of_traveler_*` reads: «GM003 listed although its season_scope excludes summer — combo followed, exception logged». In fact rule S2 added `summer` to `gm_gm003` itself, for every outfit that uses it, and `outfit_compatibility_exceptions.csv` is empty. The source GM003 says «весна | осень | зима как средний слой».

## Verdicts by file

| File | Rows (script) | README | Checked | Verdict |
|---|---|---|---|---|
| garments/garments.csv | 95 | 95 | 95 by script, 21 by hand | approve_with_limits |
| garments/costume_disposition.csv | 180 | 180 | 180 by script, 63 rejects by hand | approve |
| garments/garment_components.csv | 7 | 7 | 7 | approve_with_limits |
| garments/garment_categories.csv | 59 | 59 | 59 by script | approve |
| garments/region_clothing_profiles.csv | 81 | 81 | 81 by script | approve_with_limits |
| garments/equipment_slots.csv | 32 | 32 | 32 | approve |
| garments/wear_states.csv | 9 | 9 | 9 | approve_with_limits |
| garments/denylist.csv | 24 | 24 | 24 | approve_with_limits |
| garments/materials_colors.csv | 24 | 24 | 24 | approve_with_limits |
| outfits_by_role/outfits.csv | 111 | 111 | 111 by script, 21 by hand | approve_with_limits |
| outfits_by_role/runtime_clothing_profiles.json | 14/75 | 14/75 | 75 by check.py, 1 by hand | approve_with_limits |
| outfits_by_role/role_clothing_map.csv | 71 | 71 | 71 | approve_with_limits |
| outfits_by_role/foreign_origin_profiles.csv | 10 | 10 | 10 | approve |
| outfits_by_role/liturgical_outfits.csv | 3 | 3 | 3 | **rework** |
| outfits_by_role/outfit_compatibility_exceptions.csv | 0 | 0 | — | approve_with_limits |
| adornment_appearance/adornment.csv | 36 | 36 | 36 | **rework** (targeted rows) |
| adornment_appearance/vocabulary_extension_requests.csv | 6 | 6 | 6 | approve_with_limits |
| sources.csv | 66 | 66 | 12 by hand | approve_with_limits |

### garments/garments.csv: approve_with_limits

- **Faithful transfer.** All 92 costume rows match the source on name, confidence letter and SRC ids. There are no duplicate ids and every row has `source_refs`.
- **F1.** `gm_hw014` (mitre) is an anachronism and must be rejected.
- **F2.** Dye evidence refs on leather, fur and metal rows are wrong.
- **F3.** The status bands of `gm_hw002`, `gm_hw014` and `gm_cl009` are parsed wrongly.
- **F6.** The season of `gm_gm003` was widened to summer by rule S2, against the source.
- **`gm_new_lapti` is miscoded.**
  - `material_ids=birch_bark_bast` is wrong. WEB01 says the best lapti are made of linden bast, and birch bark (береста) is a different material.
  - `material_class=textile` is wrong.
  - `color_ids=COL003` and `dye_evidence_refs=undyed(natural wool)` are wrong: this is not wool.
  - The row is correctly excluded from outfits and from runtime. The Kurbatov/Osipov position was confirmed on nkj.ru.
- **`gm_new_votola`.** The row is B, but the status basis is marked C ("infer from material") and `sex=male|female` is not in the WK claim. Mark the status/sex inference as C in `notes`.
- **`gm_new_korzno`.** Confirmed by sqlite `material_culture` («плащ | корзно/накидка | … | элита, путники, дружина | B | S16»). The status restriction `high|elite` is a narrower reading of «элита, путники, дружина». Acceptable at B.

### garments/costume_disposition.csv: approve

180 of 180 items are dispositioned. The rejections are sound: weapons and armour go to weapons_armor, carried items to personal_items, and the dowry-list items GF011/GF012/HW009 are kept only as evidence.
Handoff note: this group does not check that the receiving domains (weapons_armor 40, personal_items 17, craft_materials 1) actually pick up these rows. That must be checked in those groups.

### garments/garment_components.csv: approve_with_limits

The rows are faithful to the source (4 B, 3 A). **F2**: the iron and bronze buckles (`gm_ac003`, `gm_ac004`) cite a textile dye claim, and the straps and laces (`gm_fw021`, `gm_ac006`, `gm_ac007`) cite `undyed(natural wool)`. These should be cleared.

### garments/garment_categories.csv: approve

59 universal categories. `region_id` is empty in every row. Instance counts match the garments and components; no category is used but undefined. There is no `confidence` column; this is acceptable for a structural layer.

### garments/region_clothing_profiles.csv: approve_with_limits

The shape matches the DDL of `world_base.region_clothing_profiles` (09.sql:244; `status=draft` is a valid value). All 81 rows agree with the garments. The 14 non-runtime rows (liturgical, burial, lapti, poneva, ice cleat and so on) are correctly left out.
- The rows inherit the errors from F2 and F3.
- `valid_from=1200-01-01`, while the README gives a working range of 1180–1260. Make these agree.
- The extra columns `gm_id`, `source_refs` and `confidence` are not in the DDL. They must be dropped or moved to provenance at import.

### garments/equipment_slots.csv: approve

The `in_runtime_code` and `category_registered_v17` flags were checked:
- `garment.equipment_slot.base_garment` and `outer_garment` exist in the v17 `universal_categories.json`.
- `lower_garment`, `headwear` and `footwear` are used in m2c data but are not registered.
This matches the table.

### garments/wear_states.csv: approve_with_limits

`rusted` and `broken` have only "C" or "физическое свойство железа; C" as their source and no reference. Either state the rule as `rule:physical_property`, or cite WK physics or materials. `new` is `in_runtime_code=false`: confirm with the runtime owner.

### garments/denylist.csv: approve_with_limits

The 20 costume anti-patterns are faithful. The `лапт` exception for `gm_new_lapti` is documented.
- `ANACH_ANILINE` has `source_refs=C`, which is a confidence letter and not a source.
- `ANACH_POTATO` cites `wk:technology-boundaries`, which is not a WK id: it is a file or cartography label. Use the approved potato anachronism claim in WK instead. A potato rule also does not belong in a clothing denylist.
- `ANACH_KNITTING_MACHINE` cites ANTI017 (cotton) "by analogy", which is a weak source.

### garments/materials_colors.csv: approve_with_limits

The rows are faithful to `materials_palette`.
- **Confidence values are not A/B/C.** Seven rows use `A–B`, and MAT005 uses «A для стелек; C для части одежды». Normalise them to one letter plus a note.
- **COL004 (буро-красный/мареновый)** cites `claim:textile-lac-dye-analysis`. Lac is an imported insect dye (Nahlik, sample N55-10150), not madder. The claim is evidence for a red dye, not for madder. Add a note, or cite the claim only as evidence of red.
- MAT010–015 and COL009 have an empty `visual_value`. This is a known gap.

### outfits_by_role/outfits.csv: approve_with_limits

- Every `gm_id` exists.
- No runtime-selectable outfit uses a non-eligible garment.
- Sex and season are consistent (after S2).
- Lapti appear in no outfit.
- **F4**: 38 status-band conflicts.
- **F5**: `gm_ac005` in 12 female wealthy and elite rows.
- **F6**: false «exception logged» in the traveller provenance.
- The destitute winter male row uses `gm_hw003`, a fur winter hat, and the female row uses `gm_hw011`. This is acceptable at C, but it needs a note.

### outfits_by_role/runtime_clothing_profiles.json: approve_with_limits

The shape matches `approvedClothing`: at most one variant per (sex, age, season), one template per slot, and owner, holder and controller all equal to `actor`. The slot ids use the same keys as m2c (`base_garment` and so on).
- The file inherits F4 and F5.
- The runtime requires `status=approved` for the profile and for every template, and a real `world_revision_id`. Today these are `candidate` and `TBD_by_import`.
- **Thin occupation lists.** Elite, destitute and foreign_west each allow only one occupation, so the runtime reports `PROCEDURAL_NPC_CLOTHING_DATA_GAP` for any other pairing.
- **Occupations in several profiles.** Many occupations appear in several profiles. This is allowed, because the profile is chosen by the binding, but the owner should be aware of it.

### outfits_by_role/role_clothing_map.csv: approve_with_limits

All 71 roles are covered, each exactly once. Judgement calls:
- `nov_role_church_scribe` → priest (C). The scribe may be a layman.
- `nov_role_archbishop` → monastic daily kit (C). Acceptable.
- `nov_role_sotsky` (middle) → wealthy.
- `nov_role_boyar_man` → poor.
The notes are adequate. `source_refs` point to the roles TSV. The costume-class basis is inferred at B; C would be more honest for the non-trivial mappings.

### outfits_by_role/foreign_origin_profiles.csv: approve

All 10 rows match `foreigner_profiles.csv` (presence confidence and source ids). The `runtime_selector` gap is stated honestly.

### outfits_by_role/liturgical_outfits.csv: rework

- `lit_archbishop` makes the mitre `gm_hw014` a kit slot. This is F1: an anachronism for 1230, and in CMB044 the mitre is only optional. Remove it.
- `source_refs` is written as `CMB021` and similar, without the `costume:` prefix. Make it consistent with the other files.
- The priest and deacon rows are faithful to CMB021 and CMB022.

### outfits_by_role/outfit_compatibility_exceptions.csv: approve_with_limits

The file is empty, but the outfit provenance says an exception was logged for GM003 (F6). Either log the season exceptions here, or remove the claim from the provenance.

### adornment_appearance/adornment.csv: rework (targeted rows)

- **`ad_new_glass_bracelet`: wrong date.** `weight_basis` says «мода с 1030-х». The cited WEB03 says «Мода на стеклянные браслеты появилась в 30–40-е годы XII века», that is, the 1130s–1140s.
  - WEB03 does not support «местное производство с конца XII в.»: it only says the bracelets were first imported from Kyiv and local production followed.
  - WEB02 says the lead-potassium bracelets were probably an *import* («possibly produced in the cities of the Latin Empire»), appearing in the early 13th century.
  - The existence of the item at A is fine. The dates and the production claim must be corrected.
- **`ad_new_shield_temple_ring`: wrong attribution.** WEB04 (booksite 345.htm) is a short encyclopedia entry «Височные кольца», not Sedova's book. It says only «новгородские словене — ромбощитковые». It does not support «XI–XIV вв.» or «конец XII–XIII — кольца с выпуклинами/рёбрами». Either find the real Sedova text (MIA 65) or lower the dating to a gap.
- **`weight_basis` cites sources missing from `source_refs`.**
  - `ad_ac017` and `ad_ac020` cite esoserver (WEB03).
  - `ad_ac021` cites sqlite `material_culture`.
  Add the missing refs.
- **Appearance frequency classes rest on a weak basis.**
  - «Не описаны в источниках» is used as a basis for `rare` (moustache, `none`).
  - risovalka §2 is explicitly «художественный дизайн» for *one* character, and it is used as the basis for population frequencies (`short_beard`, `medium` and `short` hair all `common`).
  - The confidence is correctly C, but the frequency class is not derived from data. Mark these rows `weight_basis=inference` so the owner can review them.
- **`name_ru` holds basis text** instead of a name in the appearance rows (`ap_*`).
- **Tonsure** (`ap_hair_style_tonsure_clergy_male`) has no source and no weight. It is honestly listed as a gap, and it should not be imported.
- **Confirmed rows.**
  - Russkaya Pravda (Prostrannaya) has the article «О бороде» with a fine of 12 grivnas (hist.msu.ru, `prp_t.htm`). The moustache appears in the Kratkaya redaction, not the Prostrannaya: correct the wording.
  - WEB03: more than 2000 glass beads, more than 1000 amber items including crosses, and amber from the Dnieper region and the Baltic. Confirmed.
- **The 18 costume adornment rows are faithful to their source.**

### adornment_appearance/vocabulary_extension_requests.csv: approve_with_limits

- `tonsure_clergy` has empty `source_refs`. It is a gap, not a request, and should be moved to the gap list.
- The row `marital_status (selector)` has an empty `owner`. It should be `@rus/actors`.
- `facet=hair_style` appears twice. That is not an error, because the key is facet plus value.

### sources.csv: approve_with_limits

WEB04 is mistitled. It is an encyclopedia entry «Височные кольца», not «Седова М. В., Ювелирные изделия… фрагмент». Correct the title and the reliability. WEB01, WEB02, WEB03 and WEB06 were confirmed at their URLs, with the corrections noted above. The 50 costume sources are carried over from the dataset.

## README

The counts match. There are two inaccuracies:
- «Four garments reuse existing v17 templates»: actually 5 garment rows reuse 4 templates (`gm_gm001` and `gm_gf001` share `item_tpl_nov_linen_shirt_v1`).
- «38 garments need visual values»: confirmed, 38.

## Required before re-verification

1. Remove the mitre (`gm_hw014`) from garments, region profiles and `lit_archbishop`, or move it to `reject` as an anachronism (F1).
2. Clear or fix the textile `dye_evidence_refs` on the 26 non-textile rows (F2). Fix the material coding of `gm_new_lapti`.
3. Fix the status parser («небогат») and the clergy status bands (F3). Add a check to `check.py` that an outfit's status band is compatible with its garments, and resolve the 38 conflicts (F4).
4. Replace `gm_ac005` in the female wealthy and elite outfits with AC004-based or woven belts (F5).
5. Log the S2 season widening in the exceptions file, or narrow it (F6).
6. Fix the glass bracelet dates and production claim, and the shield temple ring attribution. Add the refs missing from `weight_basis`. Correct the WEB04 title.
7. Normalise the confidence values in `materials_colors.csv`. Give `ANACH_ANILINE` a source and fix the WK id for `ANACH_POTATO`.

## Not verified

- MIA 65 (Izyumova, Sedova) was not available.
- The 50 costume SRC URLs were not re-fetched one by one. They were checked only through the rows that cite them.
- codebase-memory-mcp was not used. The runtime contract was checked by reading `approved-procedural-npc.js` directly.

## Исправления 2026-09-26

Правщик (`fix-clothing-appearance`), по обоим файлам со статусом `rework`. Правил только `outfits_by_role/liturgical_outfits.csv`, `adornment_appearance/adornment.csv`, генератор `scripts/build.py` и счётчики в `README.md` (группы и `adornment_appearance/`). Остальные файлы, включая `garments/garments.csv`, `garments/garment_categories.csv` (обе всё ещё содержат `gm_hw014` — см. «Осталось не исправлено» ниже), `sources.csv` и `outfits_by_role/role_clothing_map.csv`, не трогал: они не входили в список rework. Изменения внесены в `build.py` (детерминированный генератор) и получены перезапуском `python scripts/build.py` + `python scripts/check.py` (PASS, 0 failures).

### `outfits_by_role/liturgical_outfits.csv` (F1)

- **`lit_archbishop`**: убран слот `headwear=gm_hw014` (архиерейская митра). Причина (Православная энциклопедия, ст. «Митра»): митра епископа впервые упоминается в XV в., в форме шапки на Руси — с XVI в.; до этого у русских иерархов не было литургического головного убора кроме клобука. Костюмный источник HW014 (C) допускает митру только с оговоркой, а CMB044 указывает её как опциональную, не обязательную для комплекта. Строка не удалена целиком — остальные три слота комплекта архиепископа (стихарь, епитрахиль, поручи, омофор) верификатором не оспорены.
- **`source_refs`** во всех трёх строках приведены к общему виду: `CMB021`→`costume:CMB021`, `CMB022`→`costume:CMB022`, `CMB044`→`costume:CMB044` (как в остальных файлах группы).
- Строк было 3, осталось 3 (без изменения count).

### `adornment_appearance/adornment.csv` (F: датировка и атрибуция стеклянного браслета и височного кольца; отсутствующие ссылки; слабая частотная база; имя вместо name_ru; неисточниковая строка тонзуры)

- **`ad_new_glass_bracelet`**: убрана недостоверная дата «мода с 1030-х» и утверждение о местном производстве с конца XII в. (WEB03 этого не говорит — см. отчёт верификатора). Взята книжная цитата: «браслеты из этого стекла делали... в Новгороде — с конца XII до середины XIV в.» (Древняя Русь. Быт и культура, 1997, §Украшения из стекла Ю.Л. Щапова, ¶858, книга 624953, книжная база `ssh servak`). 1230 внутри диапазона. `source_refs` теперь `book:624953 §Украшения из стекла (Ю.Л. Щапова) ¶858|web:WEB02|costume:AC023`. Существование предмета при A (costume:AC023) сохранено; итоговая confidence строки снижена до B, так как решающая датировка идёт от B-источника. Название сокращено до «Стеклянный браслет» (не утверждаем состав как в основном факте).
- **`ad_new_shield_temple_ring`**: WEB04 — короткая энциклопедическая статья «Височные кольца» на booksite, не текст Седовой, и не подтверждает узкую датировку «XI — 1-я пол. XII в. / кон. XII–XIII вв. — с выпуклинами». Заменено двумя книжными источниками: (1) прямая цитата о ромбощитковых кольцах как этноопределяющем уборе новгородских словен (Древняя Русь. Быт и культура, 1997, §Украшения из меди и сплавов М.В. Седова, ¶649); (2) датировка «нач. XI–XIV в.» (Финно-угры и балты в эпоху средневековья, 1987, ¶343). 1230 внутри диапазона. `source_refs` теперь `book:624953 §Украшения из меди и сплавов (М.В. Седова) ¶649|book:681281 §Прибалтийские финны ¶343|costume:AC021`. Confidence осталась B; название приведено к нейтральному «Ромбощитковое височное кольцо новгородского типа» без узкой датировки в имени.
- **`ad_ac017`, `ad_ac020`**: `weight_basis` ссылается на esoserver (WEB03), которого не было в `source_refs`. Добавлен `web:WEB03`.
- **`ad_ac021`**: `weight_basis` ссылается на sqlite `material_culture`, которого не было в `source_refs`. Добавлен `sqlite:material_culture`.
- **Слабая частотная база апирance-строк.** Пять строк получили префикс `inference:` в `weight_basis` (частотный класс не выведен из данных о распределении, а принят по умолчанию либо по художественному дизайну одного персонажа из risovalka §2): `ap_facial_hair_short_beard_male`, `ap_facial_hair_moustache_male`, `ap_facial_hair_none_male`, `ap_hair_length_medium_male`, `ap_hair_length_short_male`. Confidence этих строк (C) не менялась.
- **Формулировка про бороду и усы.** `ap_facial_hair_full_beard_male`: было «борода и усы охраняются штрафом (РП, Пространная ред.)», что неверно приписывало штраф за ус Пространной редакции. Исправлено: штраф за бороду (12 гривен) — Пространная редакция, ст. «О бороде»; штраф за ус — отдельно, по Краткой редакции.
- **`name_ru` вместо текста-основания.** Все 12 apирance-строк получили реальные короткие названия (например, `ap_facial_hair_full_beard_male` → «Полная борода») вместо прежнего `basis[:80]`.
- **`ap_hair_style_tonsure_clergy_male` (гуменцо) удалена.** В собранной базе (костюмный датасет, WK, sqlite, книжная база `book_id` по клиру, веб-источники) источник для тонзуры новгородского клира 1230 г. не найден — строка была честно помечена как «ПРОБЕЛ» уже автором, но не должна была импортироваться в `candidate`. Правило фиксера («нет источника → удалить строку, вынести в gaps README») применено: строка и соответствующий запрос на расширение словаря (`vocabulary_extension_requests.csv`, `hair_style=tonsure_clergy`) удалены генератором; пробел документирован в `adornment_appearance/README.md`, «Known gaps».
- Строк в `adornment.csv` было 36 (23 предмета + 13 appearance), стало 35 (23 + 12). Строк в `vocabulary_extension_requests.csv` было 6, стало 5 (генерируется из appearance-строк, `tonsure_clergy` ушла автоматически вместе с удалённой строкой).

### Что осталось не исправлено (вне области этой задачи — только 2 файла со статусом `rework`)

- **`garments/garments.csv`** и **`garments/garment_categories.csv`** по-прежнему содержат `gm_hw014` (митра) как обычный гарнитурный предмет и универсальную категорию `garment.kind.liturgical_mitre`. Верификатор помечал их `approve_with_limits`, не `rework`, и требование «убрать митру из garments, region profiles и lit_archbishop» (п. 1 «Required before re-verification») per этой задаче не выполнено для garments/region_clothing_profiles — только для `lit_archbishop`. Нужна отдельная задача на файлы группы `garments`.
- **`sources.csv`** (WEB04 неверно назван «Седова М. В., Ювелирные изделия…, фрагмент», это encyclopedia-статья) не исправлен — файл имел статус `approve_with_limits`, не `rework`.
- F2 (dye evidence refs на нетекстильных garment-строках), F3 (парсер статуса «небогат»), F4 (38 конфликтов status-band), F5 (мужской ремень у женских нарядов), денормализованные confidence в `materials_colors.csv`, `ANACH_ANILINE`/`ANACH_POTATO` в `denylist.csv` — все относятся к файлам `garments/` и `outfits_by_role/outfits.csv` со статусом `approve_with_limits`, вне области этой задачи.
- Проверено на сервере `servak` (книжная база evidence): нет ни одной книжной записи со словом «митр» в `clothing-appearance.csv` — отсутствие книжного подтверждения митры для 1230 г. независимо подтверждает F1.

## Повторная проверка 2026-09-26

- **Кто:** независимый повторный проверяющий (старший проход, не правщик и не автор).
- **Объём:** только файлы со статусом `rework` — `outfits_by_role/liturgical_outfits.csv`, `adornment_appearance/adornment.csv` — и затронутый побочно `adornment_appearance/vocabulary_extension_requests.csv`. Данные не редактировались; дописан только этот раздел.
- **Детерминированно (скрипты в scratchpad, не в репозитории):**
  - Группа скопирована в зеркальную структуру в scratchpad, там перезапущены `scripts/build.py` и `scripts/check.py`. Результат побайтно совпадает с закоммиченными файлами (`diff -r`: IDENTICAL), `check.py` даёт PASS, 0 failures. Значит, правки идут из генератора, а не руками.
  - Пересчёт строк: `liturgical_outfits.csv` 3; `adornment.csv` 35 (23 предмета + 12 appearance); `vocabulary_extension_requests.csv` 5. Счётчики README группы и `adornment_appearance/README.md` совпадают.
  - `gm_hw014` нет ни в одном слоте литургических комплектов. Все `source_refs` там имеют вид `costume:CMB0xx`.
  - В `adornment.csv`: нет дублей id, нет пустых `source_refs`, confidence — только A/B/C, `weight` соответствует `frequency_class` по правилу 8/4/2/1. Строк/запросов `tonsure` нет, ссылок на WEB04 нет. Каждый источник, упомянутый в `weight_basis` (esoserver, sqlite, risovalka, культура.ру), есть в `source_refs`. `name_ru` appearance-строк — короткие названия, а не текст основания. Запросы на расширение словаря совпадают с appearance-строками, где `needs_vocabulary_extension=true`.
  - 18 костюмных строк (`ad_ac*`, `ad_fr*`) сверены с `catalog_items.csv` по name_ru, букве confidence, SRC-id и материалам: 0 расхождений. Все `claim:`/`wk:` ссылки разрешаются в WK production-v1.
- **Сверка с источниками вручную** (все 3 литургические строки, 11 строк adornment):
  - `lit_priest`, `lit_deacon`, `lit_archbishop` сверены с `combinations.csv` CMB021/022/044. У архиепископа теперь ровно обязательные предметы CMB044 (CL004|CL005|CL007|CL009); HW014 в источнике только опционален. F1 для этого файла закрыта.
  - `ad_new_glass_bracelet`: цитата книги 624953 ¶858 (Щапова) проверена по `index.sqlite` на servak, совпадает. 1230 внутри новгородского диапазона производства.
  - `ad_new_shield_temple_ring`: книга 624953 ¶649 (Седова) и книга 681281 ¶343 («датируются началом XI–XIV в.», со ссылкой на Седова 1982) проверены, совпадают.
  - `ad_ac017`, `ad_ac020` (+web:WEB03) и `ad_ac021` (+sqlite:material_culture; строка «височные кольца… | A | S16;S29» в sqlite есть) проверены.
  - `ap_facial_hair_full_beard_male`: формулировка про Пространную («О бороде») и Краткую (ус) редакции теперь верна.
  - 5 строк с `inference:` проверены: пометка стоит там, где её требовал отчёт.
  - Удаление тонзуры проверено по книжной базе. В evidence всех групп 0 записей «гуменц/тонзур». В индексе есть только косвенные хиты: Рыбаков 1948 ¶5911 о стригольниках XIV в.; «Сказание о попе Саве» XVII в. у Лихачёва 1984 ¶1058. Для 1230 они непригодны. Пробел обоснован.

### Вердикты

| Файл | Строк (скрипт) | Проверено | Вердикт |
|---|---|---|---|
| outfits_by_role/liturgical_outfits.csv | 3 | 3 из 3 | approve |
| adornment_appearance/adornment.csv | 35 | 35 скриптом, 11 вручную | approve_with_limits |
| adornment_appearance/vocabulary_extension_requests.csv | 5 | 5 из 5 | approve_with_limits |

**`outfits_by_role/liturgical_outfits.csv`: approve.** Оба требования отчёта выполнены. Замечание не к этому файлу: митра `gm_hw014` / `garment.kind.liturgical_mitre` остаётся в `garments/garments.csv` и `garments/garment_categories.csv`, а также, если строка есть, в `region_clothing_profiles.csv`. Это открытый пункт 1 списка «Required before re-verification» для группы `garments/`; вне этого файла.

**`adornment_appearance/adornment.csv`: approve_with_limits.** Все пункты rework закрыты. Остаются ограничения, не блокирующие:
1. Формулировка про стеклянный браслет занижает источник. В `weight_basis`/`notes` и в `adornment_appearance/README.md` сказано, что местное производство «не доказано» и что прежнее утверждение о местном производстве с конца XII в. «не подтверждалось». Но цитируемая книга 624953 ¶858 прямо говорит, что браслеты из калиево-свинцово-кремнезёмного стекла делали в Новгороде с конца XII в. По ней же в Новгороде было и собственное производство из бесщелочного свинцово-кремнезёмного стекла. Данные строки (`origin_refs=local|import`, B) верны; неточен только текст основания. При следующей правке переформулировать.
2. Ссылки `book:624953`/`book:681281` не зарегистрированы в `sources.csv`. `section_path` сокращён: «§Прибалтийские финны» вместо «Часть первая Финно-угры > Глава первая Прибалтийские финны»; к разделам 624953 добавлены авторы в скобках. Это прослеживаемо, но не дословный формат цитирования.
3. Книга 624953 ¶649 подтверждает для XIII–XIV вв. поздние кольца с овальными щитками и полукруглыми выпуклостями. Правщик снял эту деталь консервативно. Её можно вернуть в `notes` как вариант формы для 1230 (B).
4. Частотные классы appearance-строк остаются C/`inference:`. Нужен пересмотр владельцем до импорта.
5. `README.md` группы, п. 6 «Not done», устарел: «The web fragment of Sedova is used only for temple rings». WEB04 больше нигде не используется. В `sources.csv` у WEB04 по-прежнему неверное название, а заголовок WEB06 по-прежнему приписывает «ус» Пространной редакции. Файл имеет статус approve_with_limits, вне rework.

**`adornment_appearance/vocabulary_extension_requests.csv`: approve_with_limits.** Строка `tonsure_clergy` с пустыми refs удалена. Осталось прежнее замечание: у `marital_status (selector)` пустой `owner`, должно быть `@rus/actors`.

**Статус данных:** `candidate`. Эта проверка не утверждает ничего для production-импорта.
