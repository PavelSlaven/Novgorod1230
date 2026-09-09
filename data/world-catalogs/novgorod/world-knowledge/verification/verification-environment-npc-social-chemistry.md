# Verification: environment, NPC, social/law/economy, chemistry

**Роль:** независимый verification/approval audit чужих research shards. Это не
переписывание кандидатов и не activation. `APPROVE` и `APPROVE_WITH_LIMITS` —
единственные production-eligible verdicts. Все остальные требуют оставить claim
в research либо исправить evidence до promotion.

## Метод и состояние проверок

Каждый URL, приведённый в audited candidates, был повторно открыт через
browser-harness. Доступный первичный anchor подтверждён для НГБ №73 и №510:
карточка №73 даёт Новгород, Неревский раскоп, 1220–1240, 20–30-е годы XIII века
и жанр «долговая запись»; карточка №510 даёт Новгород, 1220–1240 с вероятным
смещением назад, стратиграфически конец XII–первая половина XIII века, и жанр
«судебная запись»/обвинение. URL №905 вернул **`File not found`**. Часть DOI,
book-record и publisher pages при повторном открытии не выдала extract/page/figure
anchor; это не подтверждает более узкий claim поверх metadata/title.

Сокращения checked URLs: `HDB-73` =
https://gramoty.ru/birchbark/document/show/novgorod/73/ ; `HDB-510` =
https://gramoty.ru/birchbark/document/show/novgorod/510/ ; `HDB-335` =
https://gramoty.ru/birchbark/document/show/novgorod/335/ ; `HDB-722` =
https://gramoty.ru/birchbark/document/show/novgorod/722/ ; `HDB-905` =
https://gramoty.ru/birchbark/document/show/novgorod/905/ ; `QI` =
https://doi.org/10.1016/j.quaint.2016.04.024 ; `ANMR` =
https://doi.org/10.2307/j.ctv138wsxr ; `BMC` =
https://doi.org/10.2307/j.ctvh1dqcg ; `VOL` =
https://doi.org/10.24852/pa2024.2.48 ; `ZIN` =
https://doi.org/10.1002/oa.70009 ; `EDGCC` = https://edgccjournal.org/view/ .

## Environment / agriculture / fauna

| Candidate | Verdict | Corrected production-safe wording | Limits and rationale | Checked URLs |
| --- | --- | --- | --- | --- |
| ENV-01 | APPROVE_WITH_LIMITS | Waterlogged anaerobic urban deposits can preserve organic remains unusually well. | Applies to excavated deposit/taphonomy, not citywide terrain or present availability. QI is a relevant peer-reviewed regional study; no micro-site claim promoted. | QI |
| ENV-02 | NEEDS_EVIDENCE | No meadow-mosaic fact is eligible from this source set. | BMC book record is not a page-anchored pollen result; S5 was cited only indirectly. Need original palynological publication/page and dated regional context. | BMC |
| ENV-03 | APPROVE_WITH_LIMITS | Fish exploitation is historically attested at regional medieval-Novgorod scale. | Does not establish stock, species, access, season, a water body, or a catch. QI scope supports only regional compatibility. | QI |
| AGR-01 | APPROVE_WITH_LIMITS | Archaeological agricultural implements support agriculture as a regional medieval practice. | No household inventory, crop, field, labour obligation, or exact 1230 tool inferred. VOL needs extract-level review before any tool subtype/chronology is promoted. | VOL |
| AGR-02 | NEEDS_EVIDENCE | No cereal list is eligible from current citation. | Claim relies on an unspecified BMC preview rather than a checked archaeobotanical page; “possibly oats” has no verified anchor. | BMC |
| AGR-03 | NEEDS_EVIDENCE | No berry/fruit food-use claim is eligible from a journal landing page alone. | EDGCC URL is journal-level, not article record/abstract/data; species, date, deposit and finding remain unverified. | EDGCC |
| FAU-01 | APPROVE_WITH_LIMITS | Domestic-animal evidence belongs to managed household/market/transport contexts, not ambient scenery. | ANMR supports regional zooarchaeological scope; it cannot create a live animal, owner, herd, breed or use. | ANMR |
| FAU-02 | APPROVE_WITH_LIMITS | Wild-animal food remains and fur procurement are distinct evidential questions. | QI is suitable for regional assemblage context; no species frequency, hunt, pelt or encounter is promoted without exact table/page. | QI |
| FAU-03 | APPROVE_WITH_LIMITS | Urban-bird historical compatibility must be taxon- and period-specific. | ZIN title/abstract scope supports the methodological distinction; production text must name only a taxon that the article directly dates, never an everyday flock. | ZIN |
| FAU-04 | NEEDS_EVIDENCE | No falconry practice candidate is eligible from QI citation alone. | A paper on wild-animal exploitation may cite falconry, but citation-chain mention is not an extract-level attestation of Novgorod falconry around 1230. | QI |
| SEA-01 | APPROVE | A calendar date alone does not establish local ground state, ice, ripeness, migration or harvest completion. | This is an evidence-limit rule, not a climate/phenology assertion; exact outcome remains time/weather/process-owned. | QI; VOL; BMC; EDGCC |
| SOI-01 | APPROVE | Do not infer a pan-Novgorod soil type, fertility or yield modifier from this corpus. | Safe negative boundary; a location-specific soil claim needs local pedological/spatial evidence. | QI; VOL; BMC |

## NPC / occupation / daily life

| Candidate | Verdict | Corrected production-safe wording | Limits and rationale | Checked URLs |
| --- | --- | --- | --- | --- |
| NPC-01 | APPROVE | NGB-73 is a complete Novgorod debt record, dated 1220–1240 (stratigraphically 1220s–1230s). | Proves document metadata and a single documented practice, not literacy rate, profession, interest, enforceability or arbitrary NPC debt. | HDB-73 |
| NPC-02 | APPROVE | NGB-510 is a Novgorod judicial record/document of accusation in a 1220–1240 window with an earlier possible shift. | It does not establish court procedure, officeholders, sanctions, guilt or access for a present actor. | HDB-510 |
| NPC-03 | NEEDS_EVIDENCE | No commissioned-specialist-work continuity claim is eligible until NGB-335 can be re-opened or replaced with a stable corpus anchor. | Browser re-open was blocked; earlier 1160–1180 date also cannot itself establish continuity to 1230. | HDB-335 |
| NPC-04 | APPROVE_WITH_LIMITS | Agriculture is historically compatible for a grounded rural household/settlement context. | Regional implements do not assign a job, tool, crop, landholding or current task to a person. | VOL |
| NPC-05 | APPROVE_WITH_LIMITS | Animal care/use may be considered only where a specific domesticated animal and its context already exist. | ANMR regional corpus does not establish a live animal, owner, profession, animal health or wealth. | ANMR |
| NPC-06 | APPROVE_WITH_LIMITS | Fishing, hunting and fur procurement require separately grounded source, setting and practice. | QI supports regional resource-exploitation context, not a composite “woodsman” occupation or individual skills. | QI |
| NPC-07 | APPROVE_WITH_LIMITS | A causally established dwelling/property may supply a neutral household scene context. | BMC does not justify kinship, residents, gendered work, wealth, privacy, livestock or possessions. | BMC |
| NPC-08 | APPROVE | No recovered source here provides an ordinary named person’s day-by-day 1230 timetable. | Safe limitation; actual recurring activities derive from committed role/state and time/process owners. | HDB-73; BMC; QI |
| NPC-09 | APPROVE | These sources do not establish a closed social or occupational taxonomy for individual NPC assignment. | Safe limitation; clothing/location/tool alone cannot confer status. | HDB-73; HDB-335; VOL |

## Social / law / economy

| Candidate | Verdict | Corrected production-safe wording | Limits and rationale | Checked URLs |
| --- | --- | --- | --- | --- |
| SLE-01 | APPROVE | NGB-73 is a Novgorod birch-bark debt record in the 1220–1240 window. | One record is not a universal credit form, interest rule, collateral system or literacy measure. | HDB-73; https://gramoty.ru/birchbark/document/list/ |
| SLE-02 | APPROVE_WITH_LIMITS | NGB-510 documents an accusation in a judicial record whose date range can include the 1230s. | The verified metadata also permit an earlier date; no court procedure, proof standard, office or outcome is eligible. | HDB-510 |
| SLE-03 | NEEDS_EVIDENCE | Only the use of «гривна» in NGB-73 is presently verified; no general «гривна и куна» claim is eligible. | HDB-905 returned `File not found`; HDB-722 yielded no inspectable metadata/text in re-open. No exchange rate or money-form claim may be promoted. | HDB-73; HDB-905; HDB-722 |
| SLE-04 | APPROVE_WITH_LIMITS | Surviving Novgorod birch-bark documents include different practical genres, including debt and judicial records. | It supports a limited documentary-practice observation only; do not infer literacy prevalence, author identity, writer identity or social rank. | HDB-73; HDB-510; https://gramoty.ru/birchbark/document/list/ |
| SLE-05 | APPROVE_WITH_LIMITS | A debt record may record an obligation; a present obligation still needs established parties and basis. | NGB-73 does not prove later presentation, enforcement, interest, seizure or any default legal consequence. | HDB-73 |
| SLE-06 | APPROVE_WITH_LIMITS | *Russkaya Pravda* is comparative evidence for wider Rus’ legal language/traditions, not an executable Novgorod-1230 code. | No tariff, social status, judge or procedure may be imported without local/date-specific support. | https://www.hist.msu.ru/ER/Etext/RP/ ; https://sourcebooks.fordham.edu/source/russpravda.asp |
| SLE-07 | APPROVE | Do not use the much later Novgorod Judicial Charter as evidence for 1230 procedure. | Negative anachronism boundary; it does not imply absence of earlier disputes. | https://bigenc.ru/c/novgorodskaia-sudnaia-gramota-099d1a ; HDB-510 |
| SLE-08 | APPROVE | These records do not establish a universal property title or a complete chain of transfer for a present object. | Safe evidential boundary; possession, control, claim and obligation remain separate state. | HDB-73; HDB-510 |
| SLE-09 | NEEDS_EVIDENCE | No general market/price candidate is eligible from present evidence. | NGB-73 alone does not demonstrate price formation; HDB-722 could not be inspected. Keep exact rate and transaction form as data gap/mechanics. | HDB-73; HDB-722 |

## Chemistry / metallurgy / food processes

| Candidate | Verdict | Corrected production-safe wording | Limits and rationale | Checked URLs |
| --- | --- | --- | --- | --- |
| CMF-01 | NEEDS_EVIDENCE | No combustion/pyrolysis candidate is eligible from presently inspectable links. | NIST page did not yield inspectable content and IUPAC re-open stopped at an anti-bot interstitial. Replace with an accessible standard/textbook source before promotion. | https://www.nist.gov/el/fire-research-division-73300/fire-dynamics ; https://goldbook.iupac.org/terms/view/P04977 |
| CMF-02 | APPROVE_WITH_LIMITS | Iron corrosion is electrochemical and is generally promoted by moisture/water and oxygen. | No corrosion rate, residual strength or “instant destruction” conclusion is eligible for a specific object. | https://www.nist.gov/pml/materials-measurement-science/corrosion ; https://www.rsc.org/periodic-table/element/26/iron |
| CMF-03 | APPROVE_WITH_LIMITS | Lime production, slaking and carbonation are distinct transformations; water added to quicklime is hazardous and exothermic. | NPS mortar source supports lime-mortar chemistry; exact firing, mix, cure and structural quality require composition/environment. USGS limestone page is resource information, not a process recipe. | https://www.nps.gov/orgs/1739/upload/preservation-brief-02-repointing.pdf ; https://www.usgs.gov/centers/national-minerals-information-center/limestone-statistics-and-information |
| CMF-04 | NEEDS_EVIDENCE | No clay drying/firing sequence is eligible from the checked links. | BGS URL resolves to swelling/shrinking soils; American Ceramic Society URL is 404. Replace both with an accessible ceramic-science source. | https://www.bgs.ac.uk/geology-projects/mineralsuk/clay/ ; https://ceramics.org/ceramic-tech-today/ceramic-processing/ |
| CMF-05 | APPROVE_WITH_LIMITS | Iron/steel and copper/bronze are distinct material classes; composition and processing affect behavior. | Do not assign alloy, steel quality, forging temperature, casting method or exact properties to an unknown object. | https://www.rsc.org/periodic-table/element/26/iron ; https://www.rsc.org/periodic-table/element/29/copper ; https://www.asminternational.org/materials-resources/online-materials-information/steel |
| CMF-06 | NEEDS_EVIDENCE | No “more than 30 jewellers’ workshops” or 1230-compatible workshop claim is eligible from current links. | OpenLibrary is bibliographic metadata; ResearchGate is a host, not a verified primary/publisher extract. Need the published article/full source with page and dating of the claimed workshop evidence. | https://openlibrary.org/isbn/9781842172780 ; https://www.researchgate.net/publication/348796216_Metal_melting_crucibles_from_medieval_Novgorod |
| CMF-07 | APPROVE_WITH_LIMITS | Salting, drying and adequate heating can reduce microbial hazards; protection from recontamination matters. | Sources support modern food-safety mechanism, not a 1230 practice, safe shelf-life, or certainty of safety for a particular batch. | https://www.fao.org/4/x6932e/x6932e00.htm ; https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/food-safety-danger-zone ; https://www.fda.gov/food/consumers/what-you-need-know-about-foodborne-illnesses |
| CMF-08 | APPROVE_WITH_LIMITS | Fermentation depends on substrate, microorganisms, time and conditions; spoilage/contamination remain possible. | Does not establish a historic drink, starter culture, vessel, safety or specific product. | https://www.fao.org/4/x0560e/x0560e00.htm ; https://www.fda.gov/food/consumers/what-you-need-know-about-foodborne-illnesses |
| CMF-09 | NEEDS_EVIDENCE | Keep the methodological rule: a specific 1230 food process needs a dated material/textual source. | The cited UCL download URL and OpenLibrary record did not provide a verified extract for claimed Novgorod preservation; replace with an accessible academic page/section before promotion. | https://journals.uclpress.co.uk/archaeology/article/id/263/galley/367/download/ ; https://openlibrary.org/isbn/9781842172780 |

## Summary

| Verdict | Count |
| --- | ---: |
| APPROVE | 9 |
| APPROVE_WITH_LIMITS | 19 |
| NEEDS_EVIDENCE | 11 |
| DISPUTED | 0 |
| REJECT | 0 |

**Production-eligible:** 28/39, only with wording and limits above. **Not
eligible:** ENV-02, AGR-02, AGR-03, FAU-04, NPC-03, SLE-03, SLE-09, CMF-01,
CMF-04, CMF-06, CMF-09. No audited candidate establishes a particular present entity, item,
location, legal result, exact value, weather state, process outcome or historical
availability beyond its explicitly approved envelope.
