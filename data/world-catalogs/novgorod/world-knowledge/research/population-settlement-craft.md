# Population research: settlement, craft and material-resource substrate

**Status:** research candidates only; no self-approval, inventory, recipe,
action whitelist or scene materialization. Scope is broad medieval Novgorod/Rus
compatibility around 1230. “Attested” describes an excavated/documented class;
it never establishes a present object, stock, worker, building, access or
successful process.

## Sources and applicability

- **C1 — B. A. Kolchin, *Russkii feodalnyi gorod Velikii Novgorod*,**
  [archaeological publication text](https://arheologija.ru/kolchin-b-a-russkiy-feodalnyiy-gorod-velikiy-novgorod/), settlement section. It directly describes archaeological Novgorod wooden houses/structures, log construction, vestibules, ovens, unheated underfloors, storage, roofs, streets and carts; passages specifically address X–XIII centuries. Use for urban forms, not an exact rural or riverside plan.
- **C2 — Rybina 2006, “Мир вещей средневекового Новгорода,”**
  [scholarly article](https://cyberleninka.ru/article/n/mir-veschey-srednevekovogo-novgoroda-po-arheologicheskim-nahodkam), previously opened in full. Its collection overview explicitly enumerates objects of iron, non-ferrous metals, bone, stone, clay, glass, amber, leather, wood and birch bark, and discusses household vessels, craft tools, transport, residential, household and production structures. Broad medieval collection evidence.
- **C3 — Eniosova & Rehren, “Metal Melting Crucibles from Medieval
  Novgorod,”** chapter 13 in [*The Archaeology of Medieval Novgorod in
  Context*](https://www.jstor.org/stable/j.ctvh1dqcg), pp. 210–223. Publisher
  record identifies excavated crucibles and jewellers’ workshops from the
  middle 10th to late 15th centuries and says there is no evidence of primary
  metal processing. Broad chronology only.
- **C4 — Kublo, “The Production of Textiles in Novgorod from the 10th to the
  14th Centuries,”** chapter 14 in the [same academic volume](https://www.jstor.org/stable/j.ctvh1dqcg), pp. 224–258. Publisher record describes systematic archaeological textile analysis, manufacture techniques and local/imported textiles across the stated range.
- **C5 — Kozmina, archaeological plant-remain study,**
  [*Sovetskaya arkheologiya* PDF](https://archaeolog.ru/media/books_sov_archaeology/1979_book04.pdf), table of grain finds. The Novgorod row records cereal and fibre-crop remains; the text treats rye, barley, wheat/oats and hemp in the medieval agricultural record. Use only as broad Rus/Novgorod archaeobotanical compatibility, never a c.1230 field or store.
- **C6 — Novgorod Museum-Reserve, “Обувь древнего Новгорода X–XV веков,”**
  [museum record](https://novgorodmuseum.ru/o-muzee-zapovednike/novosti/obuv-drevnego-novgoroda-x-xv-vekov), lines 153–163. It directly records shoe-production tools, 12th–13th-century shoemaking workshops, tanned cattle/small-ruminant hide, wool socks/felt insoles, iron ice-grips, bone skates and spurs. Included only where not duplicating the existing fishing/leather/woodworking production relations.

## Atomic compositional candidates

| ID | Candidate — RU / EN | Suggested typed relation | Period / directness | Evidence | Limits and gameplay use |
| --- | --- | --- | --- | --- | --- |
| SC-01 | **Древесина — основной строительный материал новгородских домов и сооружений. / Wood was the principal construction material of Novgorod houses and structures.** | `wood → attested_use → building_structure` | Novgorod X–XIII; direct. | C1. | No particular wall, hut, shed or timber source. |
| SC-02 | **Сосновые и еловые брёвна применялись для срубов. / Pine and spruce logs were used for log structures.** | `pine_or_spruce_log → attested_use → log_structure` | Novgorod X–XIII; direct. | C1. | Not species presence at a scene or a ready beam. |
| SC-03 | **Сруб — исторически засвидетельствованный тип деревянной постройки. / A log-built structure is an attested wooden-building type.** | `log_structure → historically_compatible_with → settlement_building` | Novgorod X–XIII; direct. | C1. | No dimensions, roof, room count or function. |
| SC-04 | **К срубу могли примыкать тесовые сени. / A plank-built vestibule could adjoin a log structure.** | `vestibule → may_attach_to → log_structure` | Novgorod X–XIII; direct. | C1. | A conditional architectural relation, not a default entrance. |
| SC-05 | **Печь служила отоплению дома. / An oven served to heat a house.** | `oven → attested_use → dwelling_heating` | Novgorod X–XIII; direct. | C1. | No present hearth, fuel, temperature or safe fire. |
| SC-06 | **Домашняя печь могла использоваться для приготовления пищи. / A domestic oven could be used for food preparation.** | `oven → attested_use → food_preparation` | Novgorod X–XIII; direct. | C1. | Not a recipe, food stock or cooking success. |
| SC-07 | **Неотапливаемая подклеть могла быть хозяйственным помещением. / An unheated underfloor level could be a utility space.** | `unheated_underfloor → compatible_context → utility_space` | Novgorod X–XIII; direct. | C1. | Does not materialize a cellar under every building. |
| SC-08 | **В подклети хранили имущество, припасы и утварь. / Underfloor spaces held property, provisions and utensils.** | `underfloor_storage_context → may_hold → property_or_provisions_or_utensils` | Novgorod X–XIII; direct. | C1. | No inferred inventory, capacity, owner or edible state. |
| SC-09 | **Крыши покрывали дубовой дранью/лемехом. / Roofs were covered with oak shingles.** | `oak_shingle → attested_use → roof_covering` | Medieval Novgorod; direct. | C1. | No roof condition, waterproofing result or local oak source. |
| SC-10 | **Жилые, хозяйственные и производственные сооружения различаются как археологические классы. / Residential, household and production structures are distinct archaeological classes.** | `settlement_structure → has_function_class → residential_or_household_or_production` | Broad medieval Novgorod; direct class evidence. | C2. | A class does not decide a building’s individual function. |
| SC-11 | **Двор мог быть отделён высоким столбовым забором. / A yard could be enclosed by a high post fence.** | `post_fence → may_enclose → yard` | Medieval Novgorod; direct. | C1. | No boundary, owner, permission or fortification follows. |
| SC-12 | **Мастерские могли выходить фасадом на городскую улицу. / Workshops could front an urban street.** | `workshop → may_front → street` | Medieval urban Novgorod; direct. | C1. | Not a workshop at every route or a trade licence. |
| SC-13 | **Деревянные мостовые — засвидетельствованный городской путь. / Wooden street paving is an attested urban route surface.** | `wooden_paving → attested_use → urban_street_surface` | Novgorod from X century; direct. | C1. | No canonical route, load capacity or maintenance state. |
| SC-14 | **Повозки входили в городской транспортный контекст. / Carts belonged to the urban transport context.** | `cart → historically_compatible_with → urban_transport_context` | Medieval urban Novgorod; direct. | C1 (two carts on streets). | No cart, animal, axle, cargo or travel right. |
| SC-15 | **Глина — засвидетельствованный материал новгородской вещевой коллекции. / Clay is an attested material in the Novgorod artefact collection.** | `clay → attested_material_class → archaeological_object` | Broad medieval; direct collection overview. | C2. | Not a local clay bed, vessel, kiln or firing event. |
| SC-16 | **Камень — засвидетельствованный материал новгородской вещевой коллекции. / Stone is an attested material in the Novgorod artefact collection.** | `stone → attested_material_class → archaeological_object` | Broad medieval; direct. | C2. | Not a quarry, tool, weight or building foundation. |
| SC-17 | **Кость — засвидетельствованный материал новгородской вещевой коллекции. / Bone is an attested material in the Novgorod artefact collection.** | `bone → attested_material_class → archaeological_object` | Broad medieval; direct. | C2. | No animal, carcass, food or object form. |
| SC-18 | **Железо и цветные металлы представлены в новгородской вещевой коллекции. / Iron and non-ferrous metals occur in the Novgorod artefact collection.** | `iron_or_nonferrous_metal → attested_material_class → archaeological_object` | Broad medieval; direct. | C2. | No mine, ingot, tool, weapon or alloy composition. |
| SC-19 | **Тигли — археологическое свидетельство плавки металла. / Crucibles are archaeological evidence of metal melting.** | `crucible → evidence_for → metal_melting_process` | Medieval Novgorod, middle X–late XV; direct. | C3. | No specific metal, workshop, furnace, fuel or working practitioner. |
| SC-20 | **Ювелирские мастерские засвидетельствованы раскопками. / Jewellers’ workshops are attested by excavation.** | `jeweller_workshop → historically_attested_in → novgorod_urban_context` | Medieval Novgorod, broad range; direct. | C3. | Not a general metal shop or a named artisan. |
| SC-21 | **Новгородское металлоделие по C3 не даёт свидетельств первичной переработки металла. / C3 gives no evidence for primary metal processing in Novgorod.** | `metal_melting_context → presupposes → processed_metal_input` | Medieval Novgorod; inferred medium from C3’s explicit negative finding. | C3. | A process-input limitation, not proof that every metal came from outside or an exclusion of all forging. |
| SC-22 | **Текстильные предметы составляют систематически исследуемую археологическую категорию. / Textile items form a systematically studied archaeological category.** | `textile_item → historically_attested_in → novgorod_material_culture` | Novgorod X–XIV; direct. | C4. | No particular garment, fibre, loom or wearer. |
| SC-23 | **Текстильное производство включает технологические признаки изготовления. / Textile production has manufacturing-technique attributes.** | `textile_production → has_process_attributes → manufacturing_technique` | Novgorod X–XIV; direct at category level. | C4. | Not an enumerated weaving recipe or actor skill. |
| SC-24 | **Местный и привозной текстиль различимы как исследовательские категории. / Local and imported textiles are distinguishable research categories.** | `textile_item → may_have_origin_context → local_or_imported` | Novgorod X–XIV; direct scope of C4, inferred medium relation. | C4. | No trade route, origin or quality of a materialized cloth. |
| SC-25 | **Зерновые и прядильные культуры представлены в археоботанической традиции Новгорода. / Cereals and fibre crops occur in Novgorod archaeobotanical evidence.** | `crop_remain → evidence_for → cereal_or_fibre_crop_context` | Broad medieval/chronologically mixed Rus-Novgorod evidence; inferred medium for c.1230. | C5. | No standing field, seed lot, harvest, store or yield. |
| SC-26 | **Рожь, ячмень, пшеница/овёс и конопля являются названными категориями в C5. / Rye, barley, wheat/oats and hemp are named categories in C5.** | `archaeobotanical_crop_category → includes → rye_barley_wheat_oats_hemp` | Broad evidence; medium. | C5. | Exact taxon, local phase and c.1230 cultivation require a narrower table/sample anchor. |
| SC-27 | **Конопля относится к прядильному культурному контексту C5. / Hemp belongs to the fibre-crop context in C5.** | `hemp → historically_compatible_with → fibre_crop_context` | Broad medieval Rus/Novgorod; inferred medium. | C5. | No hemp field, fibre processing, cordage or cloth is created. |
| SC-28 | **Шерстяные носки и войлочные стельки засвидетельствованы как обувные аксессуары. / Wool socks and felt insoles are attested footwear accessories.** | `wool_or_felt → attested_use → footwear_accessory` | Medieval Novgorod; direct. | C6 lines 160–163. | Does not reconstruct a full costume or individual footwear. |
| SC-29 | **Железные ледоходные шипы крепили к обуви для льда. / Iron ice-grip spikes were attached to footwear for ice.** | `iron_ice_grip → attested_use → footwear_traction` | Medieval Novgorod; direct. | C6 line 161. | No current ice, footwear, traction result or winter scene. |
| SC-30 | **Костяные коньки крепились к обуви для движения по льду. / Bone skates were attached to footwear for movement on ice.** | `bone_skate → attested_use → ice_movement` | Medieval Novgorod; direct. | C6 line 161. | No ice, person, route or winter access follows. |

## Limits and exclusions

- These claims intentionally avoid the existing normalized fishing, net,
  leather-shoemaking, generic woodworking, boat and horse-tack relations.
- C1 is urban archaeology: it supports broad settlement categories, not a
  particular rural camp, shed or storehouse at the Volkhova bank.
- C3 and C4 give broad chronological craft categories, not target-year workshop
  inventories. C5 does not establish an exact crop phase around 1230.
- No exact capacities, tool dimensions, furnace/oven temperatures, crop yields,
  coin rates, prices, construction plans, labour skills, or food-safety result
  are asserted.

## Statistics

| Measure | Count |
| --- | ---: |
| Substantive compositional candidates | 30 |
| Direct local medieval/urban relations | 24 |
| Broad inferred medium relations | 6 |
| Production changes | 0 |

**Research limit:** candidate availability must be combined with an authorised
place, material source, ownership/access, time and existing process mechanics
before any concrete world result can exist.
