# adornment_appearance: adornments, hairstyles and appearance (candidate)

## What is here
`adornment.csv` has 35 rows.
- **23 adornment items** go to `target_table=item_templates`:
  - 18 come from the costume dataset: fibula, foreign brooches, pectoral cross, encolpion, lunula, bead necklace, temple rings and earrings, spiral ornaments, bracelet, finger ring, колт, рясна, the enamel quadrifolium, chain pins, amulet, neck ring, regional bracelet.
  - 5 come from research: glass bracelets, the Novgorod shield-type temple ring, amber pendants and beads, bronze and bone collar buttons.
  - Fields: kind, slot (neck, chest_pendant, ear_temple, head_ornament, wrist, finger, garment_fastener), material ids, sex, age, status_band, origin_refs (local, west, scandinavian, baltic, baltic_finnic, import), frequency class, weight, wear states, sources and confidence.
- **12 appearance rows** have `appearance_facet` and `vocabulary_value`:
  - beards (4 values);
  - men's hair length (2);
  - women's long hair and braids (2);
  - the maiden braid and married covered hair (both need vocabulary extension);
  - famine build: slim, and emaciated (needs extension).

  Clerical tonsure (гуменце), formerly a 13th row here with no source and no weight, was deleted 2026-09-26 (rework fix; see "Known gaps" and `VERIFICATION.md`, section «Исправления 2026-09-26»).

`vocabulary_extension_requests.csv` has 5 requests to the @rus/actors owner: 2 appearance values, `emaciated`, `age_category=child`, and a `marital_status` selector. (A 6th request, for `hair_style=tonsure_clergy`, is gone along with the deleted row — it had no source and belonged in gaps, not in a request to the vocabulary owner.)

## Weight rule
Frequency class to weight: ubiquitous/common/contextual/rare → 8/4/2/1. Each row states its basis in `weight_basis`. Rows with no source get no weight.
The approved v3 appearance entries (36, all weight 1) are not changed. The rows here are proposals with narrower applicability. Confidence is C wherever the frequency is inferred. Five rows (`ap_facial_hair_short_beard_male`, `ap_facial_hair_moustache_male`, `ap_facial_hair_none_male`, `ap_hair_length_medium_male`, `ap_hair_length_short_male`) have `weight_basis` prefixed `inference:` — their frequency class is not derived from population data (a single-character art reference, or "not described in the sources"), and the owner should review them before any production import.

## Researched facts
- **Glass bracelets:** book evidence (Древняя Русь. Быт и культура, 1997, §Украшения из стекла Ю.Л. Щапова, ¶858) dates local Novgorod production from the late 12th to the mid-14th century — 1230 falls inside it → B. Lead-potassium glass bracelets are a probable early-13th-century import (web:WEB02); this does not by itself establish local production. (Corrected 2026-09-26: the previous "мода с 1030-х" date and the "местное производство с конца XII в." claim attributed to web:WEB03 were not supported by that source and were dropped.)
- **Temple rings:** book evidence (same 1997 volume, §Украшения из меди и сплавов М.В. Седова, ¶649) names the rhombic-shield temple ring the defining ethnic marker of Novgorod-Slovene women's dress, and a second book (Финно-угры и балты в эпоху средневековья, 1987, ¶343) dates the type to the early 11th–14th century — 1230 falls inside it → B. (Corrected 2026-09-26: web:WEB04 is a short encyclopedia entry, not Sedova's own text, and did not support the previous narrow dating; it is replaced by the two book citations above.)
- **Beads and amber:** more than 2,000 glass beads and more than 1,000 amber items (beads, crosses, pendants) come from the Novgorod excavations (web:WEB03) → common.
- **Beards:** the Russkaya Pravda, Prostrannaya redaction, article «О бороде», fines pulling out a beard at 12 grivnas (web:WEB06); the moustache fine is separately in the Kratkaya redaction. This supports that beards were worn (A). How common each form was is inferred, so those rows are C (five of them explicitly `weight_basis=inference:`, see "Weight rule").
- **Married women's hair covered by the povoi:** WK claim `clothing-povoi-headcover` (approved). The maiden braid rests on a popular source (web:WEB07), so it is C.

## Acceptance (`scripts/check.py`, PASS)
- Every appearance value is either in `ACTOR_BASE_APPEARANCE_VOCABULARY` (read from packages/actors) or flagged `needs_vocabulary_extension=true`.
- Weights are positive integers that follow the frequency rule.
- Ages are within the vocabulary.

## Known gaps
- No pigmentation data (hair, eyes, skin) by origin: Novgorod Slavs vs Finno-Ugric groups vs Western visitors. The weights stay uniform, as in the approved v3.
- **Clerical tonsure (гуменце).** No source was found in the collected base (book evidence, WK, costume dataset or the web sources) for 1230 Novgorod. The row `ap_hair_style_tonsure_clergy_male` and its vocabulary-extension request were deleted 2026-09-26 (author had no basis and flagged it as its own gap; the rework fix removes the unsourced row instead of importing it — see `VERIFICATION.md`). If a source is found later, re-add the row with real `source_refs` and a stated frequency basis.
- Men's haircut shapes beyond length have no source in the collected base.
- The approved v3 applicability allows only `facial_hair=none` for `young_adult`. The owner should review this.
- Sedova's full typology from MIA 65 is not used; it needs OCR.
- The runtime has no slots for adornments yet (neck, wrist and the others are new).
