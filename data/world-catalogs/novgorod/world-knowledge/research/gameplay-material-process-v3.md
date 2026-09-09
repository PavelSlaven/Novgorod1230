# Gameplay material/process gap map v3

Scope: development research only.  Read `production-v1` at
`a816e596d1d899dc163f0a0056c561e6ab22917a`; this note proposes factual
premises, never presence, actor knowledge, numeric mechanics, a resolver, or
an approval.

## Current map and bounded gaps

| Need | Existing claim refs | Remaining factual gap |
| --- | --- | --- |
| Interior function | `population-household-storage`, `population-storage-role`, `settlement-underfloor-storage`, `settlement-workshop-street` | Rybina 2006/PHC-19 supports a bounded residential/household/production category envelope. Ventilation and particular contents remain unproved. |
| Storage condition | `stored-grain-condition-depends-on-temperature-moisture`, `microbial-growth-depends-on-available-moisture`, `drying-reduces-microbial-growth-conditions`, `population-material-wood-decay`, `population-material-leather-mould` | No composed premise for temperature gradient → condensation/moisture pocket → higher spoilage risk; no general claim that a particular store is spoiled. |
| Wet nets/hulls | `population-net-cord`, `population-net-work`, `population-processes-hemp-net`, `population-boat-work`, `household-boat-repair-clamp`, `construction-aspen-cladding-joint`, `construction-pine-resin-bast`, `population-material-wood-moisture`, `population-material-wood-decay` | Modern sources support bounded net upkeep and wet-wood material response. They do not prove a Novgorod maintenance routine or a particular hull’s condition. |
| Water and fire | `population-material-wood-combustion`, `population-physics-evaporation-below-boiling`, `foundations-thm-06-moisture-vaporization-heat-demand` | NIST independently supports water’s fuel/flame-cooling suppression mechanism for Class A fires. It still must not imply success, safety, quantity, or use on every fire. |

The 105-family cartography already has partial physics/material/chemistry/craft
families.  It covers force/load, wood moisture/decay/combustion, clay, iron,
food moisture/temperature and dated boat/net evidence.  It remains visibly
partial for qualitative rope/knot load and wear, indoor air/moisture gradients,
cross-material storage degradation, and open wet-use maintenance.  These are
compositional gaps; do not create action or recipe catalogues.

## Independently read source

[Purdue Extension, *Managing Dry Grain in Storage*](https://www.extension.purdue.edu/extmedia/aed/aed-20.html),
sections **“Grain Temperature and Moisture Migration”**, **“Aerate for
Temperature Control”** and **“Other Aeration Tips”**, was read 2026-09-04.
It explains: unequal grain temperatures drive convection; warm air carries
moisture into cooler grain; cooling deposits moisture by condensation/diffusion;
accumulation and crusting can precede severe spoilage. It separately describes
forced airflow as temperature management and warns that condensed water can
spoil grain or block airflow. This is a modern grain-storage source, not proof
of a medieval building, stock, fan, granary, or duration.

[FAO, *Role of Fishery Technology in Management and Development of Freshwater
Fisheries in Africa*](https://www.fao.org/4/AC674E/AC674E03.htm), §§3.1.1.6,
3.1.2.6, 3.1.3.6 and 3.1.6.6, was also read 2026-09-04.  It describes
regular mending/replacement of worn net parts as upkeep and says an unused
gillnet is properly suspended in shade to prolong effectiveness.  It is modern
fisheries guidance, not evidence of a Novgorod net, fibre, owner or practice.

[NIST, *Fire Fighting Properties* (NISTIR 6191)](https://www.nist.gov/publications/fire-fighting-properties-nistir-6191), abstract and report description, was read 2026-09-04. Its abstract identifies fuel cooling and flame cooling among water’s mechanisms for suppressing and extinguishing Class A fires; the reported experiments separately quantify specific heat, droplet size, fuel cooling, penetration and surface contact. That is independent modern fire science, not an operational instruction or a claim about any historical fire.

[US Forest Service, *Wood Handbook*, Chapter 4: “Moisture Relations and Physical Properties of Wood”](https://research.fs.usda.gov/treesearch/62243), and [Chapter 14, “Biodeterioration of Wood”](https://research.fs.usda.gov/treesearch/62262), were rechecked 2026-09-04. Chapter 4 covers water/moisture relations and dimensional stability, including shrinkage and swelling; Chapter 14 covers biodeterioration and preservation. These are modern, species- and condition-sensitive material premises, not evidence of medieval boat care.

[FAO/ILO, *Keep It Working – Simple Maintenance*](https://www.fao.org/fileadmin/user_upload/fao_ilo/pdf/Other_docs/FAO/JFFLS_Capture.pdf), exercise 3, was read 2026-09-04. It treats boat, engine and gear maintenance as a safety topic and expressly says the exercise’s point applies to trips in saltwater **and** freshwater. It is a modern training exercise with an illustrated damaged wooden boat: adequate for a general inspection/repair possibility, not a material rule, construction standard, historical practice or freshwater-specific decay result.

For interior functions, the independently reopened
[`research/verification-population-historical-context.md`](verification-population-historical-context.md)
records Rybina 2006’s residential, household and production structure
categories as PHC-19.  This source-backed historical compatibility already
grounds category envelopes; it does not turn a named room into an inventory.

## Candidate factual primitives

| Candidate | Bilingual bounded claim | Source / evidence | Limits |
| --- | --- | --- | --- |
| GMP-01 | **RU:** При разнице температур в хранимой сыпучей массе движение воздуха может переносить влагу к более холодной зоне, где она осаждается. **EN:** Temperature differences in stored bulk material can move air and moisture toward a cooler zone, where moisture can deposit. | Purdue, “Grain Temperature and Moisture Migration”. | Universal qualitative storage premise for a bulk material with air space; no room, vessel, stock, rate, condensation amount or current wetness. |
| GMP-02 | **RU:** Локальное повышение доступной влаги в хранимом зерне может повысить риск порчи. **EN:** A local increase in available moisture in stored grain can raise spoilage risk. | Purdue, same section; compose only with existing `microbial-growth-depends-on-available-moisture`. | Grain only; risk, not a finding of mould/spoilage, organism, duration, loss or actor knowledge. |
| GMP-03 | **RU:** Прохождение воздуха через хранимую сыпучую массу может уменьшать температурные различия; неполный проход оставляет зоны различной температуры. **EN:** Airflow through stored bulk material can reduce temperature differences; incomplete passage leaves zones at different temperatures. | Purdue, “Aerate for Temperature Control”. | Modern physical relation only. No fan, ventilation architecture, guaranteed drying, medieval practice, present airflow or outcome. |
| GMP-04 | **RU:** При попадании на горящее твёрдое топливо вода может отводить тепло через охлаждение топлива и пламени и тем самым способствовать подавлению Class A-горения. **EN:** When it reaches burning solid fuel, water can remove heat through fuel and flame cooling and thereby contribute to suppressing Class A burning. | NISTIR 6191 abstract; align with existing `foundations-thm-06-moisture-vaporization-heat-demand` and `population-material-wood-combustion`. | **SOURCE-BACKED modern physical candidate.** “Can/contribute” only: no guaranteed extinguishment, targeting, safe approach, amount, oil/electrical-fire use, smoke result, or scene fire. Class A is a bounded solid-fuel context, not a medieval label. |
| GMP-05 | **RU:** Рыболовная сеть при использовании изнашивается; регулярная починка или замена изношенных частей может продлевать её пригодность. **EN:** A fishing net wears in use; regular mending or replacement of worn parts can prolong its serviceability. | FAO §§3.1.1.6, 3.1.2.6, 3.1.3.6, 3.1.6.6. | Universal modern net-maintenance premise only; no fibre class, wetness effect, historic practice, net presence, owner, skill, repair result or duration. |
| GMP-06 | **RU:** Функциональное назначение жилых, хозяйственных и производственных пространств может ограничивать ожидаемые категории хранения и работы, но не создаёт конкретные предметы. **EN:** Residential, household and production functions can constrain expected storage and work categories, but do not create particular objects. | Rybina 2006, collection overview / residential-household-production structures, independently reopened as PHC-19. | Historical compatibility is inferred for region-wide ordinary context; no named room, item, capacity, owner, access or current activity. |
| GMP-07 | **RU:** Изменение влажности древесины может сопровождаться усушкой или разбуханием; длительная влажность при подходящих условиях повышает риск биоповреждения. **EN:** A change in wood moisture can accompany shrinkage or swelling; sustained wetness under suitable conditions raises biodeterioration risk. | USFS *Wood Handbook*, chapters 4 and 14; align with existing `population-material-wood-moisture`, `population-material-wood-shrinkage`, and `population-material-wood-decay`. | **SOURCE-BACKED modern material candidate.** No care routine follows automatically: the FAO exercise supports only that inspection/repair is a general freshwater-or-saltwater boat-maintenance possibility. No Novgorod practice, hull presence, construction, coating, drying cycle, interval, skill or result is asserted. |

## General unseen probes

- A warm grain sack beside a cold wall: use GMP-01/02 only for conditional
  moisture/spoilage reasoning; state owner decides present wetness and outcome.
- A damp hemp net hung in an otherwise ordinary shed: GMP-05 supplies only
  wear/mending possibility. Its historical maintenance method remains open.
- A wet wooden hull: GMP-07 permits only conditional dimensional/decay-risk
  reasoning; FAO permits a general inspection/repair possibility, while the
  historical routine remains open.
- Player throws water at a wood-fuel fire: GMP-04 constrains qualitative
  cooling in the bounded solid-fuel case; world-process/body owners decide
  quantity, spread, smoke, safety and committed result.
- “Storeroom” alone: GMP-06 provides only category envelope; materialization
  still requires causal basis and does not populate it.

## Next research, not production work

1. If a historical 1230 boat-care assertion is needed, open dated Novgorod/Rus
   maintenance evidence; GMP-07 deliberately supplies material physics, not
   that historical practice.
2. Keep any future water-fire wording within NIST’s bounded solid-fuel/Class A
   mechanism unless a separate source supports another fire class or procedure.
