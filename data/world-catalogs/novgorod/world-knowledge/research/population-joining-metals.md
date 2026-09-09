# Population research: joining, metal working and heat response

Root-authored candidates, not production approval. Universal material facts only;
no historical availability, local stock, exact temperature, strength or success.
Advanced metallurgy stays domain-internal until an independently supported actor
knowledge profile is available. These are composing relations, not recipes.

## Primary sources directly opened

- **adhesives** — Frihart & Hunt, USFS *Wood Handbook* (2021), ch.10,
  [Wood Adhesives: Bond Formation and Performance](https://research.fs.usda.gov/download/treesearch/62250.pdf).
  Full publisher PDF opened. Sections pp.10–1 to10–5, not search metadata.
- **metals** — University of Illinois, Materials Science and Technology,
  [Scientific Principles: Metals](https://matse1.matse.illinois.edu/metals/prin.html).
  Mechanical Properties, Cold Working, Quenching and Hardening directly opened.
  Historical anecdotes on that page are not adopted.
- **temperature** — Canadian Conservation Institute,
  [Incorrect temperature](https://www.canada.ca/en/conservation-institute/services/agents-deterioration/temperature.html).
  Table2 wax row; Direct physical effect of temperature fluctuations.
  No modern polymer, numerical transition or historical wax-use inference.

## Atomic candidates

| Key | Subject | Typed relation → condition | RU / EN | Source section |
|---|---|---|---|---|
| bond-contact | wood-bond | requires_condition → compatible_adhesive_surface_contact | Склейке нужен контакт совместимого клея с поверхностями. / Bonding needs compatible adhesive in contact with surfaces. | adhesives: Wetting |
| bond-contamination | wood-bond | responds_to → oil_dirt_loose_fibres | Масло, грязь и рыхлые волокна могут ослабить склейку древесины. / Oil, dirt and loose fibres can weaken a wood bond. | adhesives: Surface Properties of Wood for Bonding |
| bond-cure | wood-bond | requires_condition → adhesive_solidification | Соединение формируется после затвердевания клея; прочность не мгновенна. / The joint forms after adhesive solidifies; strength is not instantaneous. | adhesives: Solidification |
| bond-weak-link | wood-bond | depends_on → wood_adhesive_interface_strength | Соединение может разрушиться по клею, границе или самой древесине. / Failure can occur in adhesive, interface or wood itself. | adhesives: Bond Formation |
| bond-pressure | wood-bond | responds_to → suitable_pressure_during_bonding | Подходящее давление помогает клею растекаться; чрезмерное может ослабить шов. / Suitable pressure helps adhesive spread; excessive pressure can weaken the joint. | adhesives: Wetting; Assembly and Pressing |
| bond-moisture | wood-bond | depends_on → wood_moisture_and_dimensional_change | Влажность и изменение размеров дерева влияют на качество соединения. / Wood moisture and dimensional changes affect bond quality. | adhesives: Physical Properties of Wood for Bonding |
| metal-melt | metal | responds_to → melting_and_cooling | После плавления металл жидкий; охлаждение ниже соответствующего перехода возвращает твёрдое состояние. / Melted metal is liquid; cooling below its corresponding transition restores a solid state. | metals: Bonding |
| metal-fatigue | metal | responds_to → repeated_loading | Повторная нагрузка может выращивать трещины и привести к усталостному разрушению. / Repeated loading can grow cracks and cause fatigue failure. | metals: Mechanical Properties |
| metal-cold-work | metal | responds_to → cold_plastic_deformation | Холодная пластическая обработка может упрочнять металл; чрезмерная деформация ведёт к разрушению. / Cold plastic working can strengthen metal; excessive deformation leads to fracture. | metals: Cold Working |
| metal-anneal | metal | responds_to → suitable_annealing | Подходящий отжиг может размягчать наклёпанный металл; режим зависит от материала. / Suitable annealing can soften cold-worked metal; treatment depends on material. | metals: Quenching and Hardening; Cold Working |
| steel-quench | steel | responds_to → suitable_heating_and_quenching | Подходящая закалка стали повышает твёрдость, но может повысить хрупкость. / Suitable steel quenching increases hardness but can increase brittleness. | metals: Quenching and Hardening |
| steel-temper | steel | responds_to → suitable_tempering | Отпуск закалённой стали может уменьшить хрупкость с сохранением части твёрдости. / Tempering hardened steel can reduce brittleness while retaining some hardness. | metals: Quenching and Hardening |
| wax-soften | wax | responds_to → sufficient_heating | Воск размягчается или плавится при нагреве; состав определяет температурное поведение. / Wax softens or melts when heated; composition determines its temperature response. | temperature: Table 2 |
| assembly-expansion | thermal-assembly | responds_to → unequal_or_uneven_thermal_expansion | Разное тепловое расширение соединённых материалов или неравномерный нагрев могут вызвать напряжения и повреждение. / Unequal expansion of joined materials or uneven heating can cause stress and damage. | temperature: Direct physical effect of temperature fluctuations |

All rows are conditional. Source descriptions of usual responses do not override
observed material state, load, composition or exact code-owned mechanics.
