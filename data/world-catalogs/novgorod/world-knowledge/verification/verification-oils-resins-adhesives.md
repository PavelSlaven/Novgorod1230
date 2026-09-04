# Independent verification — oils, resins and adhesives

**Scope:** ORA-01--ORA-08 in `research/population-oils-resins-adhesives.md`.
This verifies one early-Novgorod boat assemblage. It does not identify an oil,
tar-making process, ordinary 1230 boat, resin source, animal-glue production,
or a waterproof result.

## Source independently read

M. Kh. Aleshkovsky, [«Ладья XI в. из Новгорода»](https://arheologija.ru/aleshkovskiy-m-h-ladya-xi-v-iz-novgoroda/),
*Советская археология* 1969, no. 2, pp. 264–269. I opened and read the full
article. It places the three boats in the fill of the 1044 rampart, and dates
boat no. 1 itself to the beginning of the 11th century. The decisive passage
begins “Сама обшивка лодки № 1 не найдена…” after fig. 6; it reports G. N.
Tomashevich’s analysis of organic traces.

The date is materially earlier than 1100–1300. Therefore every eligible
historical normalization must be `inferred / medium`, bounded to a broad
Old-Rus technical compatibility envelope; none is a direct 1230 attestation.

| Candidate | Verdict | Production-safe wording | Source check and strict limit |
|---|---|---|---|
| ORA-01 | **APPROVE_WITH_LIMITS** | На лодке № 1 начала XI в. аналитически определена сосновая смола на всех её поверхностях. / Pine resin was analytically identified on all surfaces of early-11th-century boat no. 1. | The post-fig.-6 passage states “Удалось определить наличие сосновой смолы” and “Смола имеется на всех поверхностях лодки.” Keep the individual boat/date explicit in research; a 1100–1300 use is only inferred compatibility, not a current boat, resin stock, tar, or universal wood treatment. |
| ORA-02 | **APPROVE_WITH_LIMITS** | На полустрингерах лодки № 1, где была просмолена лыковая вица, найдены особенно крупные сгустки сосновой смолы. / Particularly large pine-resin clumps were found on boat no. 1’s half-stringers where the bast *vitsa* was resin-coated. | Direct same passage. It is a component-specific observation, not a required treatment for all bast lashings, a proof of watertightness, or a generic cordage claim. Historical transfer remains inferred/medium. |
| ORA-03 | **APPROVE_WITH_LIMITS** | На внешней поверхности лодки № 1 белковое вещество, определённое как животный клей, скрепляло меловую массу. / On boat no. 1’s exterior, protein material identified as animal glue bound a chalk mass. | Direct: “Белковое вещество (животный клей) … скрепляло меловую массу.” Do not generalize to a recipe, glue strength, all exterior layers, animal-glue production, or a protective coating. |
| ORA-04 | **APPROVE_WITH_LIMITS** | Животный клей найден между двумя скреплёнными нагелями древесными пластинами борта лодки № 1. / Animal glue was found between two wooden side-planks fastened by small pegs on boat no. 1. | Direct same passage. The glue is associated with a mechanically pegged, layered construction; it does not replace fastening or prove a general wooden joint. |
| ORA-05 | **APPROVE_WITH_LIMITS — composite, do not separately normalize if ORA-03/04 and the cladding relation are retained** | Для конкретной тонкой осиновой обшивки лодки № 1 меловая шпаклёвка на животном клее вместе с нагелями прикрепляла обшивку к корпусу. / For boat no. 1’s thin aspen cladding, chalk filler on animal glue together with pegs attached the cladding to the hull. | The article’s synthesis says exactly that filler on animal glue and pegs firmly attached cladding. It is direct for this assemblage but repeats ORA-03/04 plus the cladding relation. Prefer atomic evidence records over a fourth near-duplicate composite. No ratios, cure time, strength, or transferrable recipe. |
| ORA-06 | **APPROVE_WITH_LIMITS** | На лодке № 1 тонкая осиновая обшивка закрывала соединение корпуса и борта; автор реконструирует её как защиту линии соединения от воды. / On boat no. 1, thin aspen cladding covered the hull-side joint; the author reconstructs it as protecting that joint from water. | Direct description/reconstruction in the post-fig.-6 passage. Retain authorial/reconstructed status: it is not a measured waterproofness, a seaworthiness result, or a rule for arbitrary hulls. |
| ORA-07 | **APPROVE_WITH_LIMITS** | В лодке № 1 липовая лыковая вица через отверстие привязывала шпангоут к полустрингеру. / In boat no. 1, a lime-bast *vitsa* passed through an opening to tie a frame to a half-stringer. | Direct structural-description passage before fig. 3. This is not tarred tow, not an ordinary fastening for every boat, and not proof of accessible bast/skill in 1230. |
| ORA-08 | **APPROVE_WITH_LIMITS** | У носового фрагмента лодки № 1 две части были скреплены лыком. / In boat no. 1’s bow fragment, two parts were fastened with bast. | Direct post-fig.-6 passage. A distinct join location from ORA-07, so it need not be merged if the model benefits from separate `bast → bow-part fastening` versus `vitsa → frame/stringer lashing` relations. No glue, material stock, or general join guarantee follows. |

## Combination and non-evidence boundary

ORA-01 and ORA-02 are not duplicates: the first is the full-boat resin
identification and the second is a documented resin-coated *vitsa* location.
ORA-03 and ORA-04 are distinct exterior chalk binding and inter-plank glue
contexts. ORA-05 is their useful but redundant composite and should be omitted
when its atomic parts plus cladding are modeled. ORA-07 and ORA-08 describe
different bast-fastening contexts and may remain separate.

No candidate supports `oil`, `tar` as a separately identified substance,
animal-fat glue, paint binder, chalk recipe, resin harvesting, or automatic
availability. All technical material/process relations should be
`domain_internal_only`; dated historical compatibility is a profile-level
constraint, not automatic actor knowledge.

## Exact production normalization check

**Verdict: APPROVE_WITH_LIMITS.** I read the six normalized records, source,
evidence, concepts and RU/EN localizations in
`production-v1/approved-construction.json` against the independently read
Aleshkovsky source. All correctly retain 1100–1300 as `inferred / medium`
compatibility while naming boat no. 1 and its early-11th-century date in the
runtime text; all use `domain_internal_only`.

| Production claim refs | Exact-review result |
|---|---|
| `claim:construction-pine-resin-surfaces`; `claim:construction-pine-resin-bast` | Approved: distinguish overall pine-resin identification from the large clumps at the resin-coated *vitsa*. The texts exclude a present stock, universal treatment and waterproofness. |
| `claim:construction-animal-glue-chalk`; `claim:construction-animal-glue-pegged-planks` | Approved: preserve the distinct exterior chalk-binding and mechanically pegged plank-layer observations, without turning either into a recipe, general glue strength, or replacement for fasteners. |
| `claim:construction-aspen-cladding-joint` | Approved: correctly preserves the author’s reconstructed water-protection function, not a measured watertightness or a universal hull rule. |
| `claim:construction-bast-vessel-fastening` | Approved: the combined ORA-07/08 record accurately keeps both the lime-bast *vitsa* frame/half-stringer lashing and bast-fastened bow parts. This is a valid non-redundant consolidation, distinct from tarred tow or glue. |

ORA-05 was correctly omitted as the redundant composite. No normalized record
asserts oil, separately identified tar, animal-fat glue, resin extraction, a
1230 boat, or a scene inventory.

## Editorial re-check — source-faithful surface wording

**APPROVE NARROWER WORDING.** The underlying observation identifies pine resin
on surfaces of Novgorod boat no. 1; it does not establish the function of that
surface occurrence. The localization should therefore say only **RU:**
`Это раннее наблюдение присутствия смолы на поверхности, не установление её
функции.` / **EN:** `This is an earlier observation of resin on a surface, not
an establishment of its function.` The current "совместимого приёма" /
"supports technical compatibility" wording goes beyond the observation and
should not be retained. The existing date, boat identification and no-present-
stock limit remain appropriate; this re-check adds neither sealing nor a
special exception about sealing.

## Exact editorial-normalization check — compiled 491

**MATCHES_APPROVAL.** `claim:construction-pine-resin-surfaces` now says only
that analysis identified pine resin on surfaces of early-eleventh-century
Novgorod boat no. 1 and labels this an observation of resin on a surface, not
its function. RU/EN retain the limits on every boat and present stock; neither
adds compatibility, treatment function, sealing, or a scene assertion.


## Addendum — OFA-01…03, independent CCI verification

**Scope:** read-only verification of the oil/fat addendum in
`research/population-oils-resins-adhesives.md`. I independently opened and
read the full 2018 Canadian Conservation Institute page, including **Rawhide**,
**Oil-tanned skin (chamois)** and **Vegetable-tanned leather**, on 2026-09-04.
It is technical/conservation evidence for conditional material processes only;
it supplies no Old-Rus historical availability or practice.

| Candidate | Verdict | Source-faithful, production-safe relation | Limits |
| --- | --- | --- | --- |
| OFA-01 | **APPROVE_WITH_LIMITS** | **Намасленная недублёная шкура → описана как более устойчивая к влаге и воде. / Oiled rawhide → is described as more resistant to moisture and water.** | **Rawhide** says kayak coverings and sealskin floats are made of rawhide oiled “to make it more resistant to moisture and water.” This supports a conditional treatment/property relation, not a result for every oil, skin, application, exposure or finished object. No impermeability, amount, method, duration, present rawhide/oil, or historical availability follows. |
| OFA-02 | **APPROVE_WITH_LIMITS** | **В конце растительного дубления жировые вещества или масла могут врабатываться в жёсткую кожу для гибкости. / At the end of vegetable tanning, fats or oils may be worked into hard leather for flexibility.** | **Vegetable-tanned leather** says the leather is hard and inflexible at that stage and fats/oils such as tallow or cod-liver oil are worked in for flexibility. Keep the end-of-vegetable-tanning/material-state condition. This is neither a universal all-leather recipe nor evidence for a particular fat/oil, sequence, actor skill, historical practice, or guaranteed result. |
| OFA-03 | **APPROVE_WITH_LIMITS** | **В описанной реакции масляного дубления химическое сшивание масла в структуре шкуры предотвращает слипание волокон при высыхании и придаёт мягкость. / In the described oil-tanning reaction, oil crosslinking within skin structure prevents fibres sticking on drying and imparts suppleness.** | **Oil-tanned skin (chamois)** says oils used in oil tannage react further to create chemical links; its described modern heated process effects oxidation/crosslinking, and “This reaction” prevents fibres sticking on drying and imparts suppleness. The relation must remain tied to that reaction, not ordinary surface oiling, every oil, unheated treatment, all skins/furs, waterproofing, or a historical method. No temperature, duration, species, equipment, current material, or availability is supplied. |

All three are eligible only as universal, conditional,
`domain_internal_only` material/process facts. They do not evidence an
XI–XIII Novgorod oil/fat resource, supply, lamp, food, glue, dye binder,
worker, workshop, recipe, or scene state.

## Exact production normalization check — OFA-01…03

**MATCHES_APPROVAL.** I read the three normalized claims, evidence anchors and
RU/EN runtime texts in `production-v1/leather-plant-fibre-water.json` against
the independent OFA verdict.

| Claim ref | Check |
| --- | --- |
| `claim:oil-rawhide-moisture-resistance` | Correctly uses `physics_material_science` / `responds_to` for rawhide, the literal “described more resistant to moisture and water,” universal scope, direct/high/unknown and `domain_internal_only`. RU/EN retain conditional treatment/property wording and reject impermeability, every oil/skin/exposure, present stock and historical availability. |
| `claim:oil-fat-vegetable-leather-flexibility` | Correctly uses `physics_material_science` / `responds_to` for vegetable-tanned leather. RU/EN preserve end-of-vegetable-tanning and hard-leather conditions, flexibility purpose, and exclude all-leather recipe, particular oil/fat, guaranteed result, skill and historical practice. |
| `claim:oil-tanning-crosslinking-fibres` | Correctly uses `chemistry_process` / `supported_fact` for oil tanning. RU/EN confine anti-sticking/suppleness to described crosslinking reaction and exclude surface oiling, every oil, unheated treatment, waterproofness, parameters, present material and historical availability. |

All evidence anchors point to independently read CCI sections. No coverage
promotion follows from this normalization.

## Addendum — OFH-01, independent Gramoty.ru verification

**Verdict: APPROVE_WITH_REWORDING.** I independently opened and read the full
HSE / Institute for Slavic Studies RAS record for [Novgorod birchbark letter
No. 718](https://gramoty.ru/birchbark/document/show/novgorod/718/). It names
Novgorod, the Mikhailo-Arkhangel'skii excavation, category `деловые записи`,
genre `реестр доходов или выплат`, and content as a Gorodets Bezhetskii
*pogorodie* entry. Its metadata gives conditional date 1220–1240 with a
probable later shift, stratigraphic XIII century, and extra-stratigraphic
1160s–1230s (preferred 1180s–1210s). The preserved text includes `... [г]ърньць
масла ...`; the record's supplied Russian translation reads “горшок масла”.

The record directly supports a **dated textual accounting occurrence** of the
lexeme `масло` with a pot/container reference. It does not identify animal or
plant source, oil/fat chemistry, lamp/food/leather use, ownership, local stock,
trade route, household practice, production, or current scene presence. The
editorial date is conditional, so it is not a fixed 1230 attestation; a broad
1100–1300 Old-Rus compatibility envelope can only be `inferred / medium`.

Do **not** normalize the candidate's “two pots”: the opened authoritative
record and its translation establish `горшок масла`, but do not supply a stable
two-pot reading for a production claim. Production-safe wording is:

> **RU:** В новгородской берестяной грамоте № 718 масло упомянуто в реестре
> доходов или выплат как «горшок масла».
> **EN:** Novgorod birchbark letter No. 718 mentions oil in a receipt/payment
> register as “a pot of oil”.

Keep document/record limits explicit. This is a historical-material-context
fact only; it does not compose universal oil-treatment relations into a
historical technique or supply claim.

## Exact normalization check — compiled 508 / OFH-01

**BLOCK — duplicate canonical source identity.** The claim text itself matches
the approved narrowed relation: `claim:maslo-birchbark-718-account` uses the
pot wording, 1200–1300 inferred/medium historical envelope, conditional
1220–1240 date with possible later shift, and correctly excludes animal/plant
identity, use, stock and current scene presence.

However, new `source:birchbark-novgorod-718` duplicates existing approved
`source:gramota718`: both name the same Gramoty canonical URL and
`novgorod/718` record. Reuse `source:gramota718` for the new evidence (and
update metadata only in that existing source owner if needed), then remove the
duplicate source record. Do not approve two source identities for one
authoritative record.

## Exact source-identity recheck — compiled 508

**RESOLVED / APPROVE.** `evidence:maslo-birchbark-718-account` now reuses
existing `source:gramota718`; compiled sources contain one identity for the
canonical Gramoty `novgorod/718` URL. The duplicate
`source:birchbark-novgorod-718` is absent. Claim/evidence text retains the
approved pot wording, conditional-date limit and non-claims. No source reread
was needed for this identity-only correction.
