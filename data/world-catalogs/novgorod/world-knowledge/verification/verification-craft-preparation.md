# Independent verification: craft-preparation CPP01–03

**Scope:** CPP01–03 only.  CPP04–06 are already handled by the independent
terrain-resource verification and compiled pack; they were not re-reviewed.
No production file was edited.

## Sources independently reopened

1. **M. M. Savenkova (2015), “Понёвы из средневекового Новгорода,”**
   [publisher record](https://www.gramota.net/article/hss20151942/fulltext).
   I independently opened the record and the locally retained publisher PDF
   text.  Printed p. 152 says the XII-century Nerev find contains
   non-decomposed *coloured* wool threads in parts of the pattern.  The same
   discussion treats possible mordants/dyes as an explanation of degradation;
   it does not identify a dye, a colouring operation, bath, mordant or local
   production.
2. **T. Brorsson (2012), “Pottery production in the Novgorod region,”**
   [JSTOR chapter record](https://www.jstor.org/stable/j.ctvh1dqcg.31), pp.
   425–434.  I independently opened the book and the accessible chapter
   abstract.  It says that excavations at Rurik Gorodishche and Novgorod found
   many pottery sherds over several centuries, and that **many** vessels were
   hand-made from suitable local clays and tempers for vessel building.  It
   calls the technology conservative and long-lived, but the available
   abstract supplies no layer-specific 1230 date, clay pit, recipe or firing
   sequence.

| Candidate | Verdict | Production-safe wording if promoted | Rationale and mandatory limits |
| --- | --- | --- | --- |
| CPP-01 | **APPROVE_WITH_LIMITS** | **В XII-вековом фрагменте ткани Неревского раскопа сохранились цветные шерстяные нити в частях узора. / A twelfth-century Nerev-excavation textile fragment preserves coloured wool threads in parts of its pattern.** | Direct find-level evidence, high confidence.  Replace Russian `окрашенные` with `цветные` and do not render it “dyed”: the source establishes observed colour, not pigment/dyestuff, mordant, dyeing step, colour name, local workshop or garment.  For a 1220–1240 use it is an inferred/medium historical compatibility, not direct c.1230 presence. |
| CPP-02 | **APPROVE_WITH_LIMITS** | **Многие ручные сосуды из корпуса Рюрикова городища и Новгорода изготовлялись из пригодных местных глин. / Many hand-made vessels in the Rurik Gorodishche and Novgorod corpus were made from suitable local clays.** | The abstract directly states this material relation, but CPP02’s unrestricted wording overgeneralizes “many” into all handmade regional pottery.  It supports a broad medieval regional compatibility with inferred/medium applicability to 1230; it does not establish that visible soil is suitable clay, that a source/pit is present or accessible, or that a pot results. |
| CPP-03 | **APPROVE_WITH_LIMITS** | **Многие ручные сосуды из корпуса Рюрикова городища и Новгорода изготовлялись из пригодных местных глин и отощителей. / Many hand-made vessels in the Rurik Gorodishche and Novgorod corpus were made from suitable local clays and tempers.** | The same abstract directly gives `suitable local clays and tempers for vessel-building`.  Keep the corpus and `many` limit; do not phrase temper as an obligatory input of every pot or supply its type, proportion, processing, firing, workshop or finished vessel.  Medieval-wide corpus evidence makes 1230 compatibility inferred/medium, not a direct layer date. |

## Boundary

Only the narrowed texts above are eligible for a separate authoring decision.
They provide no historical dyeing chain and no ordinary kiln/firing chain.
They do not materialize coloured cloth, a vessel, a clay deposit, a potter,
skill, stock, access, recipe or successful craft outcome.

## Exact normalization — compiled 442

**PASS_WITH_LIMITS.** Checked the three normalized CPP records:
`claim:clothing-nerev-coloured-wool` in `production-v1/clothing.json` and
`claim:pottery-handmade-local-clay` /
`claim:pottery-handmade-temper` in `production-v1/woodwork-ceramics.json`.
All use existing `supported_fact`, approved evidence, 1220–1240 Novgorod-Land
applicability, and `attested` / `medium` / `inferred` qualifiers with
`domain_internal_only` access. RU/EN wording preserves `coloured`, `many`,
corpus limitation, and no-present-scene boundary. No dyeing chain, universal
pot recipe, local clay source, or craft outcome entered the canonical claims.
