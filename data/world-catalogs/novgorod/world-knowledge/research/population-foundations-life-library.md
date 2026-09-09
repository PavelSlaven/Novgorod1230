# Population research: foundations of life from local library

**Status:** research candidates, not self-approved production facts. Date:
2026-09-04. Scope is general biology, human physiology and microbiology;
psychology and fauna are deliberately out of scope. These facts neither
diagnose a person nor prescribe treatment. They establish no present entity,
body state, infection, pregnancy, food safety, actor knowledge or outcome;
exact bodies, checks, time and persistence remain code-owned.

## Method and directly opened sources

The FB2 members below were read directly from the read-only local-library
server `root@192.168.1.100:/srv/library`. Archive/member is a reproducible
library locator, not a claim that a book is authoritative gameplay canon.
Chapter and section labels are the FB2's actual headings.

- **L1 — Н. И. Федюкович, _Анатомия и физиология человека: учебное
  пособие_**, Феникс, 2003. `f.fb2-425051-428054.zip`, `426945.fb2`.
  Opened: «Организм как единое целое», «Физиология пищеварения»,
  «Физиология дыхания», «Обмен веществ и энергии», «Физиология
  нервно-мышечной системы», «Физиология сна», «Кожа».
- **L2 — А. С. Солодков, Е. Б. Сологуб, _Физиология человека_**.
  `f.fb2-473833-476870.zip`, `475091.fb2`. Opened table of contents and
  relevant chapters: 2.4 «Гомеостаз», 5 «Нервно-мышечный аппарат», 8
  «Кровь», 9 «Кровообращение», 10 «Дыхание», 11 «Пищеварение», 12 «Обмен
  веществ и энергии», 13 «Выделение», 14 «Тепловой обмен».
- **L3 — В. С. Коротяев, С. А. Бабичев, _Медицинская микробиология,
  иммунология и вирусология_**. `f.fb2-471134-473832.zip`, `473402.fb2`.
  Opened: гл. 25 «Система макрофагов и формирование видового иммунитета»,
  гл. 29 «Приобретенный иммунитет. Антигены», гл. 31 «...Антитела», гл. 46
  «Жизненный цикл вирусов...».
- **L4 — В. И. Сивоглазов и др., _Общая биология. 10–11 классы_**.
  `f.fb2-406402-412295.zip`, `411927.fb2` (10 класс) and `411928.fb2`
  (11 класс). Opened: §§4, 14, 16, 18, 19, 21, 22; 11-классные главы 21–29
  об экологических факторах, экосистеме и круговороте веществ.

## Existing runtime coverage excluded

I compared `production-v1/runtime-bundle.json` before drafting. The following
existing general claims were not duplicated: homeostatic response; food-derived
energy and ATP/muscle links; osmotic balance; sweat, heat exchange and work
intensity; coagulation, wound repair and skin barrier; moisture/temperature/
solute effects on microbes; drying/heating; and specific fermentation facts.
The candidates below fill adjacent structural relations rather than restating
those claims.

## Atomic candidates

| ID | Atomic fact — RU / EN | Suggested relation | Evidence | Limit / gameplay use |
| --- | --- | --- | --- | --- |
| LIFE-01 | **Клетка является основной структурной и функциональной единицей живого. / The cell is the basic structural and functional unit of life.** | `cell → is → basic_unit_of_life` | L4, 10кл., §4 «История изучения клетки. Клеточная теория». | No present cell, organism or health inference. |
| LIFE-02 | **Клетки содержат органические и неорганические вещества; вода и минеральные соли входят в неорганическую часть. / Cells contain organic and inorganic substances; water and mineral salts are inorganic components.** | `cell → contains → organic_and_inorganic_substances` | L4, 10кл., §§5–8. | No dietary dose or body-state claim. |
| LIFE-03 | **Белки, углеводы и липиды участвуют в строении и обмене клетки. / Proteins, carbohydrates and lipids participate in cellular structure and metabolism.** | `cellular_macromolecules → participate_in → structure_and_metabolism` | L4, 10кл., §§7–8. | No nutritional recommendation or exact energy value. |
| LIFE-04 | **АТФ служит непосредственным переносчиком доступной энергии для процессов клетки. / ATP serves as an immediate carrier of usable energy for cellular processes.** | `ATP → supplies → cellular_energy_requiring_processes` | L4, 10кл., §16 «Обмен веществ и превращение энергии». | Existing ATP claims cover muscle/heat; this adds no numeric mechanic. |
| LIFE-05 | **Обмен веществ включает взаимосвязанные синтез и распад веществ. / Metabolism includes interrelated synthesis and breakdown of substances.** | `metabolism → includes → anabolism_and_catabolism` | L1, «Обмен веществ и энергии»; L4, 10кл., §16. | No rate, calorie or present nutritional state. |
| LIFE-06 | **Рост многоклеточного организма связан не только с увеличением клеток, но и с увеличением их числа через деление. / Multicellular growth involves both cell enlargement and an increase in cell number through division.** | `multicellular_growth → includes → cell_division` | L4, 10кл., §18 «Деление клетки. Митоз». | No individual growth prediction. |
| LIFE-07 | **При митозе дочерние клетки получают копию генетического материала. / In mitosis, daughter cells receive a copy of genetic material.** | `mitosis → transmits → copied_genetic_material_to_daughter_cells` | L4, 10кл., §18. | No heredity outcome for a particular person. |
| LIFE-08 | **Специализация клеток лежит в основе различия тканей и органов. / Cellular specialization underlies differences among tissues and organs.** | `cell_specialization → underlies → tissue_and_organ_differences` | L4, 10кл., §18; L1, «Организм как единое целое». | No anatomy claim about an individual. |
| LIFE-09 | **Органы состоят из разных тканей и объединяются в системы, выполняющие взаимосвязанные функции. / Organs comprise different tissues and form systems with interrelated functions.** | `organs → form → organ_systems` | L1, «Организм как единое целое». | No complete anatomical simulation required. |
| LIFE-10 | **Пищеварение механически обрабатывает пищу и ферментативно расщепляет её вещества до форм, доступных для усвоения. / Digestion mechanically processes food and enzymatically breaks its substances into absorbable forms.** | `digestion → enables → absorption_of_food_components` | L1, «Физиология пищеварения»; L2, 11.1–11.3. | No food safety, diet, dose or health result. |
| LIFE-11 | **Всасывание переносит продукты переваривания из пищеварительного тракта во внутреннюю среду организма. / Absorption transfers digestion products from the digestive tract into the body's internal environment.** | `intestinal_absorption → transfers → digested_products_to_internal_environment` | L2, 11.3 «Всасывание продуктов переваривания пищи». | No absorption rate or condition-specific outcome. |
| LIFE-12 | **Дыхание связывает поступление кислорода, его транспорт к клеткам и удаление углекислого газа. / Respiration links oxygen uptake, transport to cells, and carbon-dioxide removal.** | `respiration → links → oxygen_delivery_and_carbon_dioxide_removal` | L1, «Физиология дыхания»; L2, 10.1–10.3. | No respiratory diagnosis or capability score. |
| LIFE-13 | **В лёгких кислород и углекислый газ переходят между альвеолярным воздухом и кровью путём диффузии. / In lungs, oxygen and carbon dioxide move between alveolar air and blood by diffusion.** | `alveolar_gas_exchange → occurs_by → diffusion` | L1, «Физиология дыхания». | No blood-gas value or disease inference. |
| LIFE-14 | **Сердечно-сосудистая система обеспечивает движение крови между лёгкими, тканями и органами. / The cardiovascular system moves blood among lungs, tissues, and organs.** | `circulation → transports → blood_between_lungs_and_tissues` | L1, «Организм как единое целое»; L2, гл. 9. | No pulse, pressure or blood-volume mechanic. |
| LIFE-15 | **Кровь включает плазму и форменные элементы; эритроциты, лейкоциты и тромбоциты имеют разные функции. / Blood includes plasma and formed elements; erythrocytes, leukocytes, and platelets have distinct functions.** | `blood → includes → plasma_and_formed_elements` | L2, 8.1–8.2. | No laboratory values or clinical interpretation. |
| LIFE-16 | **Нервная и гуморальная регуляция координируют функции органов и систем. / Neural and humoral regulation coordinate functions of organs and systems.** | `physiological_regulation → coordinates → organ_system_functions` | L2, 2.2 «Нервная и гуморальная регуляция функций». | No behavioural or psychological conclusion. |
| LIFE-17 | **Рефлекс — регулируемая нервной системой ответная реакция на раздражение. / A reflex is a nervous-system-mediated response to a stimulus.** | `reflex → is → stimulus_response_via_nervous_system` | L2, 2.3 «Рефлекторный механизм деятельности нервной системы». | No specific reflex, timing or compelled action. |
| LIFE-18 | **Скелетные мышцы сокращаются и расслабляются, обеспечивая движение через работу с костями и суставами. / Skeletal muscles contract and relax to produce movement through work with bones and joints.** | `skeletal_muscle_activity → enables → bodily_movement` | L2, 5.2; L1, «Вспомогательный аппарат и работа мышц». | No force, endurance or injury calculation. |
| LIFE-19 | **Сенсорные рецепторы преобразуют раздражение во входящую для нервной системы информацию. / Sensory receptors transform stimuli into information for the nervous system.** | `sensory_receptors → transduce → stimuli_into_neural_information` | L2, 7.1–7.4. | Does not establish perception, noticeability or knowledge. |
| LIFE-20 | **Почки участвуют в выделении продуктов обмена и поддержании состава внутренней среды. / Kidneys participate in excreting metabolic products and maintaining the internal environment.** | `kidneys → support → excretion_and_internal_environment` | L1, «Физиология почек»; L2, 13.2–13.4. | No urine, hydration or disease conclusion. |
| LIFE-21 | **Потоотделение участвует в теплоотдаче и одновременно связано с потерей воды. / Sweating participates in heat loss and is also associated with water loss.** | `sweating → couples → heat_loss_and_water_loss` | L2, 13.6 and 14.3. | Existing bundle owns qualitative water-loss/evaporation claims; no threshold added. |
| LIFE-22 | **Теплообразование и теплоотдача регулируются для поддержания относительно постоянной температуры тела. / Heat production and heat loss are regulated to maintain a relatively constant body temperature.** | `thermoregulation → balances → heat_production_and_heat_loss` | L2, 14.1–14.4. | No normal temperature, weather tolerance or diagnosis. |
| LIFE-23 | **Сон и бодрствование входят в суточный ритм организма, на который влияет смена освещения и внешних раздражителей. / Sleep and wakefulness are part of a daily rhythm influenced by changing light and external stimuli.** | `sleep_wake_cycle → responds_to → circadian_light_and_environmental_cues` | L1, «Физиология сна». | Existing bundle covers acute sleep-loss performance; no duration or recovery promise. |
| LIFE-24 | **Кожа граничит с внешней средой и участвует в тактильной, болевой и температурной чувствительности. / Skin borders the external environment and participates in tactile, pain, and temperature sensation.** | `skin → participates_in → tactile_pain_and_temperature_sensation` | L1, «Кожа». | No injury, infection or pain-intensity conclusion. |
| LIFE-25 | **Размножение обеспечивает преемственность поколений через передачу генетической информации. / Reproduction provides continuity of generations through genetic-information transmission.** | `reproduction → transmits → genetic_information_between_generations` | L4, 10кл., §19 «Размножение: бесполое и половое». | No fertility, kinship or pregnancy inference. |
| LIFE-26 | **При половом размножении слияние гамет образует зиготу, из которой начинается развитие нового организма. / In sexual reproduction, gamete fusion forms a zygote from which a new organism develops.** | `fertilization → forms → zygote` | L4, 10кл., §21 «Оплодотворение». | No conception probability or individual status. |
| LIFE-27 | **Онтогенез — совокупность преобразований организма от возникновения до конца жизни; его ход зависит от наследственной программы и условий среды. / Ontogeny is the set of transformations from origin to end of life; it depends on hereditary programming and environmental conditions.** | `ontogeny → depends_on → heredity_and_environment` | L4, 10кл., §22 «Индивидуальное развитие организмов». | No developmental schedule or prognosis. |
| LIFE-28 | **Вирусы не имеют клеточного строения и не размножаются самостоятельно вне клетки хозяина. / Viruses lack cellular structure and do not reproduce independently outside a host cell.** | `virus_replication → requires → host_cell` | L4, 10кл., §14; L3, гл. 46. | No infection or transmission claim. |
| LIFE-29 | **Вирусная частица содержит генетический материал (ДНК или РНК) и белковую оболочку; у некоторых есть дополнительная оболочка. / A virus particle contains genetic material (DNA or RNA) and a protein coat; some have an additional envelope.** | `virion → contains → genome_and_protein_coat` | L4, 10кл., §14. | No species identification or pathology. |
| LIFE-30 | **Микроорганизмы разнообразны; бактерии, грибы, простейшие и вирусы не образуют одну биологически одинаковую группу. / Microorganisms are diverse; bacteria, fungi, protozoa, and viruses are not one biologically identical group.** | `microorganisms → include → biologically_distinct_groups` | L3, contents: parts on bacteria, fungi, protozoa and viruses; L4, §14. | No statement that a named microbe is present. |
| LIFE-31 | **Фагоцитоз включает движение фагоцита к частице, её захват и последующий исход внутри клетки. / Phagocytosis includes phagocyte movement toward a particle, uptake, and a subsequent intracellular outcome.** | `phagocytosis → includes → approach_uptake_and_intracellular_outcome` | L3, гл. 25 «Система макрофагов...». | No promise that an infection is cleared. |
| LIFE-32 | **Макрофаги и другие фагоциты участвуют в защитных реакциях организма, но исход фагоцитоза может различаться. / Macrophages and other phagocytes participate in protective responses, but phagocytic outcomes can differ.** | `phagocyte_response → has → variable_outcomes` | L3, гл. 25. | Avoids deterministic immunity mechanics. |
| LIFE-33 | **Приобретённый иммунный ответ специфичен к антигену, вызвавшему его формирование. / An acquired immune response is specific to the antigen that induced it.** | `acquired_immunity → is_specific_to → inducing_antigen` | L3, гл. 29 «Приобретенный иммунитет. Антигены». | No proof of immunity in a person. |
| LIFE-34 | **Лимфоидные органы, ткани и циркулирующие иммунные клетки образуют распределённую систему защитного надзора. / Lymphoid organs, tissues, and circulating immune cells form a distributed protective-surveillance system.** | `lymphoid_system → supports → distributed_immune_surveillance` | L3, гл. 29. | No present immune state. |
| LIFE-35 | **Антитела — иммуноглобулины, образующиеся в ответ на антиген и способные специфически взаимодействовать с ним. / Antibodies are immunoglobulins formed in response to an antigen and able to interact specifically with it.** | `antibodies → bind → corresponding_antigen` | L3, гл. 31 «...Антитела». | No testing, diagnosis or treatment implication. |
| LIFE-36 | **Иммунный ответ может включать образование клеток иммунологической памяти. / An immune response can include formation of immunological-memory cells.** | `immune_response → can_form → immunological_memory` | L3, гл. 31. | No duration or protection guarantee. |
| LIFE-37 | **Экологические факторы включают абиотические и биотические влияния; организм существует во взаимодействии со средой. / Ecological factors include abiotic and biotic influences; an organism exists through interaction with its environment.** | `organism → interacts_with → abiotic_and_biotic_environment` | L4, 11кл., §§21–23. | No local habitat, season or organism presence. |
| LIFE-38 | **Пищевые связи и разложение органического вещества участвуют в круговороте веществ и потоке энергии экосистемы. / Feeding relations and decomposition of organic matter participate in ecosystem matter cycling and energy flow.** | `ecosystem → includes → food_links_and_matter_cycling` | L4, 11кл., §§24–25 and 29. | No local food web, biomass or decomposition rate. |
| LIFE-39 | **Устойчивость и смена экосистем связаны с взаимодействием организмов и изменением условий среды. / Ecosystem persistence and change are related to organism interactions and changing environmental conditions.** | `ecosystem_change → relates_to → organism_interactions_and_environmental_change` | L4, 11кл., §26 «Причины устойчивости и смены экосистем». | No deterministic local succession. |
| LIFE-40 | **Фотосинтез связывает образование органических веществ с использованием энергии света у фотосинтезирующих организмов. / Photosynthesis links organic-matter formation to light-energy use in photosynthetic organisms.** | `photosynthesis → uses → light_energy_to_form_organic_matter` | L4, 10кл., §17 «Пластический обмен. Фотосинтез». | Existing plant-growth requirements remain authoritative; no local plant or yield claim. |

## Explicitly unresolved

The books are educational/medical references, not a basis for exact treatment,
diagnosis, medical outcomes, epidemiological probabilities, individual
development schedules, nutrition norms, normal ranges, or pathogen-specific
game rules. Those were intentionally omitted. The existing runtime facts listed
above should remain single owners for their relations.

## Statistics

| Measure | Count |
| --- | ---: |
| Directly opened library sources | 4 books / 5 FB2 members |
| New non-duplicate candidates | 40 |
| Psychology candidates | 0 |
| Fauna candidates | 0 |
| Self-approved claims | 0 |

This research note changes no production pack, profile, schema, source binding,
code or test.
