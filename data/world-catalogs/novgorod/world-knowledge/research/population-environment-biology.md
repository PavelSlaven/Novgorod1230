# Population research: verified environment, fishing and practical biology

**Status:** research candidates, not self-approved production facts. These
relations establish neither party-world presence, inventory, ownership, access,
seasonal state, actor knowledge nor success. Exact mechanics, bodies, time and
persistence remain code-owned.

## Directly reopened source register

- **H1 — Rybina 2015, MSU:** [“Промыслы в средневековом Новгороде (по
  археологическим материалам)”](https://cyberleninka.ru/article/n/promysly-v-srednevekovom-novgorode-po-arheologicheskim-materialam), pp. 219–224,
  sections “Рыболовство” and gear discussion. Opened in full through
  browser-harness.
- **U3 — Périard, Eijsvogels & Daanen 2021:** [Exercise under heat
  stress](https://pubmed.ncbi.nlm.nih.gov/33829868/), abstract. Opened:
  prolonged exercise in heat raises core temperature and sweat loses body water.
- **U4 — Guo & DiPietro 2010:** [Factors affecting wound
  healing](https://pubmed.ncbi.nlm.nih.gov/20139336/), abstract. Opened:
  normal healing phases are haemostasis, inflammation, proliferation and
  remodelling.
- **U5 — McDermott et al. 2017:** [Fluid replacement for physically active
  individuals](https://pubmed.ncbi.nlm.nih.gov/28985128/), abstract. Opened:
  inadequate and excessive replacement can both harm performance/health, and
  practice varies by conditions.
- **U6 — Burnley & Jones 2018:** [Power–duration
  relationship](https://pubmed.ncbi.nlm.nih.gov/27806677/), abstract. Opened:
  maintainable duration falls as required power rises.
- **U8 — U.S. Geological Survey:** [Temperature and
  water](https://www.usgs.gov/water-science-school/science/temperature-and-water),
  “Significance of water temperature” and “Seasonal changes in lakes and
  reservoirs.” Opened: temperature governs aquatic organism ranges; warm water
  holds less dissolved oxygen than cool water; seasonal lake mixing/stratification
  depends on temperature and climate.
- **U9 — Clemson University HGIC:** [Drying Foods](https://hgic.clemson.edu/factsheet/drying-foods/),
  “How Drying Preserves Food.” Opened: drying removes moisture so bacteria,
  yeasts and moulds cannot grow; low humidity and air current affect drying.
- **H2 — Serëzhnikova et al. 2024, Russian Archaeology / HSE and Institute of
  Archaeology RAS:** [“Berry and fruit plants in the nutrition of Novgorod
  dwellers”](https://edgccjournal.org/0869-6063/article/view/655814), abstract.
  Opened: plant macroremains from a midden/latrine feature in a mid-13th-century
  Novgorod layer are direct evidence for studying plant diet.
- **H3 — Birch-bark letter no. 510, Old Russian Birch-Bark Documents corpus
  (HSE and Institute of Slavic Studies RAS):** [document
  page](https://gramoty.ru/birchbark/document/show/novgorod/510/). Opened:
  Novgorod official judicial record, conventional 1220–1240 and preferred no
  later than the 1230s; its text includes cattle, mares and rye in one dispute.
- **U10 — University of Connecticut Extension:** [Common reed (*Phragmites
  australis*)](https://ipm.cahnr.uconn.edu/invasive_plants_common_reed/),
  “Roots,” “Reproduction/spread” and “Habitat.” Opened: perennial hollow stems
  arise at rhizome joints; this species forms wetland/river-edge stands.
- **U11 — EUFORGEN / European Forest Institute:** [White willow (*Salix
  alba*)](https://www.euforgen.org/species/salix-alba). Opened: native range
  includes Europe to northern China; the species thrives in moist, well-lit
  temperate settings and is commonly found on riverbanks, wetlands and
  floodplains.
- **U12 — University of Alaska Fairbanks Geophysical Institute:** [Stoneware
  Pottery](https://www.gi.alaska.edu/index.php/alaska-science-forum/stoneware-pottery-0),
  paragraph beginning “Plasticity is the essential feature.” Opened: primary
  clays form in place; secondary clays are water-transported and later bedded.
- **U13 — Purdue University Extension:** [Managing Grain in the
  Spring](https://extension.purdue.edu/news/2020/04/Managing-Grain-in-the-Spring.html),
  “Drying grain” section. Opened: increasing grain temperature and moisture
  reduce storage life; warm/moist grain increases mould/insect risk.

## Atomic candidates

| ID | Atomic fact — RU / EN | Suggested relation | Applicability and evidence | Limit / gameplay use |
| --- | --- | --- | --- | --- |
| ENV-POP-01 | **Рыболовство было важной хозяйственной практикой средневековых Новгорода и Новгородской земли. / Fishing was an important economic practice in medieval Novgorod and its land.** | `activity.fishing → historically_important_in → region.novgorod_medieval` | Historical regional compatibility; H1, pp. 219–220. | Supports a factual query for an already established freshwater setting; no fish, right, gear, boat, camp or catch. |
| ENV-POP-02 | **В слоях X–XIV вв. сообщены остатки 23 видов рыб; кости, чешуя и снасти служат evidence рыболовства и потребления. / 10th–14th-century layers report remains of 23 fish species; bone, scale and gear evidence fishing and consumption.** | `archaeological_fish_remains → evidence_for → historical_fish_consumption` | Historical excavated assemblage; H1 p. 220. | Not a c.1230 species/stock list, local abundance, edible state or live-animal observation. |
| ENV-POP-03 | **В грамотах XII–XIII вв. собирательные обозначения рыбы встречаются чаще названий пород. / In 12th–13th-century letters collective fish terms are more frequent than species names.** | `source.birchbark_letters_12_13c → uses → category.fish_collective_terms` | Historical language evidence; H1 p. 220. | Keeps later named-species lists from becoming default 1230 vocabulary or stock. |
| ENV-POP-04 | **Грамоты упоминают сушёную, просоленную и солёную рыбу как продуктовые формы. / Letters mention dried, lightly salted and salted fish as food forms.** | `food.fish → has_historically_attested_form → {dried,lightly_salted,salted}` | Historical food-form attestation; H1 p. 220. | No salt, drying structure, method, shelf-life, stock or safe food result. |
| ENV-POP-05 | **На раскопанных усадьбах разных периодов найдены рыболовные принадлежности; в выборке массовые сетевые приспособления преобладают над индивидуальными. / Fishing gear occurs at excavated estates across periods; mass-net gear outnumbers individual gear in the discussed sample.** | `archaeological_gear_distribution → supports → fishing_as_economic_practice` | Historical excavation evidence; H1 pp. 220–221. | No particular estate/camp owns a net or can use one. |
| ENV-POP-06 | **Бортничество исторически засвидетельствовано для средневекового Новгорода, но материально представлено слабее рыболовства. / Wild-bee keeping is historically attested for medieval Novgorod but materially represented more weakly than fishing.** | `activity.wild_beekeeping → historically_attested_in → region.novgorod_medieval` | Historical regional practice; H1 p. 219. | No bee colony, tree, wax, honey or skill is created. |
| ENV-POP-07 | **Берестяные/сосново-коровые и деревянные поплавки, а также каменные сетевые грузила засвидетельствованы как части снасти. / Birch-bark/pine-bark and wooden floats, plus stone net sinkers, are attested gear components.** | `fishing_gear_component → has_historical_material_form → {bark,wood,stone}` | Historical Novgorod archaeology; H1 pp. 221–223. | Not a complete net, cord, ownership, placement or operating procedure. |
| ENV-POP-08 | **Для описанного плоского берестяного поплавка фиксируются отверстия, резание и сшивание лыком. / The described flat birch-bark float has holes, cutting and bast sewing.** | `birchbark_float_assembly → requires_process → {hole_cutting,bast_sewing}` | Historical artefact-construction relation; H1 p. 222. | One documented construction, not a recipe or proof of tools, bark, skill/time or an output. |
| ENV-POP-09 | **В описанном контексте тонкий гибкий прут сгибали дугой и связывали верёвкой для петли снасти. / In the described context, a thin flexible rod was bent into an arc and tied with cord for a gear loop.** | `flexible_rod → compatible_with_process → bending_and_tying` | Historical fishing-gear context; H1 p. 224. | Does not generalize to every wood/fibre, create cord or establish fastening durability. |
| ENV-POP-10 | **Температура воды влияет на виды и биологическую активность водных организмов; тёплая вода удерживает меньше растворённого кислорода. / Water temperature affects aquatic organisms and warm water holds less dissolved oxygen.** | `water_temperature → constrains → aquatic_organism_compatibility` | Universal freshwater ecology; U8 “Significance of water temperature.” | No measured temperature/oxygen, named fish, migration, mortality, stock or catch. |
| BIO-POP-01 | **Продолжительная работа в жаре повышает heat load: растёт core temperature, потоотделение ведёт к потере воды. / Prolonged work in heat raises heat load: core temperature rises and sweat loses body water.** | `prolonged_exertion_in_heat → increases → thermoregulatory_load` | Universal physiology; U3 abstract. | No threshold, diagnosis, clothing/wind claim, individual tolerance or body-state mutation. |
| BIO-POP-02 | **Для физически активных людей как недостаточное, так и чрезмерное восполнение жидкости может быть вредным; уместность зависит от условий. / For active people, inadequate and excessive fluid replacement can both be harmful; appropriateness depends on conditions.** | `fluid_replacement_appropriateness → varies_with → person_and_conditions` | Universal physiology; U5 abstract. | No volume, diagnosis, water source or health outcome. |
| BIO-POP-03 | **Поддерживаемая длительность физической работы уменьшается с ростом требуемой мощности/интенсивности. / Maintainable work duration decreases as required power/intensity rises.** | `required_work_intensity → inversely_constrains → maintainable_duration` | Universal exercise physiology; U6 abstract. | No stamina score, forced failure, exact duration or NPC trait. |
| BIO-POP-04 | **Нормальное заживление кожной раны включает фазы гемостаза, воспаления, пролиферации и ремоделирования. / Normal cutaneous wound healing includes haemostasis, inflammation, proliferation and remodelling.** | `cutaneous_wound_healing → includes_phase → {haemostasis,inflammation,proliferation,remodelling}` | Universal biology for an already committed wound; U4 abstract. | No overlap claim, treatment, infection, severity, time-to-heal or survival result. |
| BIO-POP-05 | **Высушивание пищи удаляет влагу, без которой бактерии, дрожжи и плесени не растут; ферментативные процессы при этом замедляются, но не исчезают. / Food drying removes moisture required for bacterial, yeast and mould growth; enzyme action slows but is not eliminated.** | `food_drying → reduces → microbial_growth_conditions` | Universal food biology; U9 “How Drying Preserves Food.” | Not proof of a medieval drying method, a shed/rack, safety, duration or a preserved stock. |
| BIO-POP-06 | **Низкая влажность и движение воздуха ускоряют перенос влаги из пищи; влажный воздух замедляет drying. / Low humidity and moving air speed moisture removal from food; humid air slows drying.** | `low_humidity_and_airflow → accelerates → moisture_removal_from_food` | Universal drying relation; U9 “How Drying Preserves Food.” | No local wind, weather, fuel, temperature, insect exclusion, completed drying or food-safety result. |
| ENV-POP-11 | **В изученной средневековой новгородской пробе из слоя середины XIII в. растительные макроостатки из выгребной ямы дают прямой археоботанический материал для изучения растительного рациона. / In a studied mid-13th-century Novgorod context, plant macroremains from a latrine feature provide direct archaeobotanical material for studying plant diet.** | `plant_macroremains_mid13c_novgorod → evidence_for_study_of → plant_diet` | Historical Novgorod evidence; H2 abstract. | Does not name a crop, berry or quantity from the abstract; does not materialize food, a garden, a latrine or an edible plant. |
| ENV-POP-12 | **У *Phragmites australis* надземные стебли возникают из узлов корневища; вид образует плотные заросли в пресноводных болотах и по краям рек. / In *Phragmites australis*, aerial stems arise from rhizome joints; the species forms dense stands in freshwater wetlands and along river edges.** | `phragmites_rhizome → can_produce → aerial_stems` | Universal, species-specific ecology; U10 “Roots,” “Reproduction/spread” and “Habitat.” | North-American extension source, not proof that reed, a stand, stalks, access or a harvest exists in Novgorod c.1230; excludes non-*Phragmites* “reeds.” |
| ENV-POP-13 | **Белая ива (*Salix alba*) распространена в Европе до северного Китая; она обычна на берегах рек, во влажных угодьях и поймах, где ей нужны влага и свет. / White willow (*Salix alba*) ranges from Europe to northern China; it is commonly found along riverbanks, wetlands and floodplains, where it needs moisture and light.** | `salix_alba → compatible_with → moist_lit_riparian_or_floodplain_habitat` | European-temperate species ecology; U11. | Supports only broad ecological compatibility after a suitable willow has independently been established; it does not prove *S. alba*, any willow stand, twig/bark availability, season, ownership or collection at Novgorod c.1230. |
| ENV-POP-14 | **Первичная глина образуется на месте, вторичная переносится водой и затем откладывается пластами. / Primary clay forms in place; secondary clay is transported by water and later deposited in beds.** | `secondary_clay → has_formation_path → water_transport_and_deposition` | Universal sediment/material distinction; U12 paragraph beginning “Plasticity is the essential feature.” | Does not identify any bank sediment as clay, assert local clay availability, purity, plasticity, extraction right or vessel result. |
| ENV-POP-15 | **При хранении зерна рост температуры и влажности сокращает storage life; в тёплых/влажных условиях выше риск плесени и насекомых. / In stored grain, increasing temperature and moisture reduce storage life; warm/moist conditions increase mould and insect risk.** | `stored_grain_temperature_and_moisture → constrain → storage_life` | Universal storage biology; U13 “Drying grain” section. | Modern grain-management source supports only qualitative condition relation; no medieval bin, safe moisture, duration, pest species, edible stock or spoilage state. |
| ENV-POP-16 | **В озёрах с холодной зимой сезонные изменения температуры могут менять стратификацию и перемешивание водных слоёв; это связано с распределением растворённого кислорода. / In lakes with cold winters, seasonal temperature change can alter water-layer stratification and mixing; this is linked to dissolved-oxygen distribution.** | `seasonal_water_temperature → can_change → lake_stratification_and_mixing` | Universal lake ecology; U8 “Seasonal changes in lakes and reservoirs.” | Applies to an already established lake/reservoir and suitable climate, not automatically to a riverbank; no ice state, depth profile, fish movement, catch or local calendar. |
| ENV-POP-17 | **В новгородской судебной записи 1220–1240 гг. в одном споре упомянуты скот, кобылы и рожь. / A Novgorod judicial record dated 1220–1240 mentions cattle, mares and rye in one dispute.** | `judicial_record_510 → references → {cattle,mares,rye}` | Direct local text, preferred no later than the 1230s; H3 metadata and text. | A single disputed-record reference, not a regional livestock/crop census, proof of a living herd/field, property rule, household stock, or a materialization basis. |

## Explicitly unresolved after source verification

Named crop taxa, agricultural implements, domestic-animal taxa, exact fruit or
berry taxa from the H2 sample, untreated-water infection, pasture calendar and
local seasonal availability remain unresolved. The reopened sources support
only the qualified relations above; H3 is one document, not a census. None
establishes a medieval Novgorod reed/willow stand, local clay deposit, grain
store or livestock presence.

## Statistics

| Measure | Count |
| --- | ---: |
| Directly reopened sources | 13 |
| Historical Novgorod candidates | 11 |
| Universal environment/biology candidates | 12 |
| Candidate facts total | 23 |
| Self-approved claims | 0 |

This narrowed revision is deliberately evidence-first. It does not change
production, schemas, profiles, materialization, NPC state, physics/body
mechanics or persistence.
