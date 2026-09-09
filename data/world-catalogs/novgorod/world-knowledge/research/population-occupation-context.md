# Early-game occupation context: research candidates

**Status:** research only.  Nothing here creates an NPC, job, workshop,
inventory, source, work shift, competence level, social rank, or completed
process.  The candidates are deliberately role-to-context relations: a role
may be grounded only after the relevant activity, place, tools and access have
independently been established.  They are not a roster of occupations.

## Sources independently opened

| Ref | Source and exact usable anchor | Scope retained here |
| --- | --- | --- |
| O1 | B. A. Kolchin, [*Russkii feodalnyi gorod Velikii Novgorod*](https://arheologija.ru/kolchin-b-a-russkiy-feodalnyiy-gorod-velikiy-novgorod/), sections **«Ремесло»**, fig. 4 and fig. 5. | Archaeological author synthesis.  The text identifies iron-working and wood-working technique by the XI–XII-century tools illustrated there; its wider urban narrative includes XII–XIII Novgorod.  It is not an inventory of a 1230 shop. |
| O2 | E. A. Rybina, [«Мир вещей средневекового Новгорода (по археологическим находкам)»](https://cyberleninka.ru/article/n/mir-veschey-srednevekovogo-novgoroda-po-arheologicheskim-nahodkam), pp. 1–3 of the article text, numbered points 2–4. | Scholarly archaeological synthesis of the Novgorod excavation collection (1932–2002).  It explicitly names the techniques of smiths, wood-carvers, shoemakers, weavers, potters and carpenters; it separately identifies agriculture, fishing and trade as subjects illuminated by the collection.  Broad medieval evidence, not a site-phase census. |
| O3 | E. A. Rybina, [«Промыслы в средневековом Новгороде (по археологическим материалам)»](https://cyberleninka.ru/article/n/promysly-v-srednevekovom-novgorode-po-arheologicheskim-materialam), pp. 219–223. | Archaeological synthesis: fishing was a major activity in Novgorod land; pp. 220–223 describe net gear, its materials and recovery to shore or boat.  Those material relations are already represented by PHC-01–09 and are not duplicated below. |
| O4 | Birch-bark corpus, [Novgorod letter no. 943](https://gramoty.ru/birchbark/document/show/novgorod/943/). | Primary record: private-letter fragment, subject “instruction to buy grain”; conditional date 1180–1200, extra-stratigraphic date late XII–first quarter XIII.  The fragment is an instruction, not proof that its addressee was a merchant or possessed grain. |
| O5 | Institute of Archaeology RAS, [«Десятинный раскоп в Великом Новгороде»](https://archaeolog.ru/press/articles/n167). | Official excavation report: a ploughed field and ploughshare occur in its early horizon; later gardens/orchards contain shovels and scythes.  The investigated plot was deserted by the beginning of the XIII century, so it does **not** establish farming there in 1230.  HA-21–25 already carry the material relations and are not duplicated below. |

## Non-duplicate atomic candidates

| ID | Candidate and proposed relation | Period / region / directness | Evidence and qualified factual wording | Limits, exclusions and gameplay use | Confidence |
| --- | --- | --- | --- | --- | --- |
| OCC-01 | `smithing_context → requires_material_basis → worked_iron_or_steel` | Novgorod / Rus; direct for the described pre-industrial supply relation, **medium** for compatibility c.1230. | O1 says iron used by Novgorod smiths was supplied by rural metallurgists, then made into smiths’ products and partly steel. **RU:** «Описанное новгородское кузнечное производство работало с уже полученным железом; источник не описывает добычу руды в городской кузнице». **EN:** “The described Novgorod smithing worked from already obtained iron; the source does not describe ore extraction in an urban smithy.” | No mine, bloomery, ingot, quantity, ownership, price, fuel, or ready stock.  Useful to stop a role label from materialising primary ore processing. | high / medium temporal |
| OCC-02 | `smithing_activity → may_use_contextual_tools → anvil_hammer_tongs_punch_chisel_file` | XI–XII urban Novgorod direct; c.1230 inferred medium. | O1 fig. 4 and its text enumerate an anvil, sledgehammers/hand hammers, tongs, punches, chisels and files among the tools of smiths and metalworkers. | It is an evidenced **tool class**, not a compulsory kit or a present forge.  It neither grants fire, fuel, anvil, nor skill to a named NPC.  Supports a tool-sensitive attempt only after those objects are present and accessible. | high / medium temporal |
| OCC-03 | `edge_tool_manufacture → may_include → heat_treatment_of_steel_working_part` | XI–XII Novgorod direct; broad compatibility around 1230. | O1 describes high-carbon steel working parts and their thermal treatment (quenching and tempering) in manufacture of tools and weapons. | Not every iron item was treated alike; no temperature, duration, alloy percentage, successful hardening, or weapon statistics.  This is historical process context, while exact heat/process mechanics remain code-owned. | high / medium temporal |
| OCC-04 | `smithing_specialization → may_focus_on → particular_product_family` | XII-century Novgorod, direct for source author’s account; c.1230 inferred medium. | O1 reports more than fifteen specialist smith professions in XII-century Novgorod and lists product-linked examples (e.g. knives, axes, nails, locks, needles, bits and ploughshares). | Do not create a guild, a closed profession vocabulary, a named master, a workshop, price, or competence from a product.  It supports only the non-universal proposition that a concrete specialist task can be historically compatible. | medium-high |
| OCC-05 | `woodworking_role → historically_attested_as → carpenter_or_related_specialist` | X–XII tools and occupations in O1; medieval Novgorod/Rus compatibility, c.1230 inferred medium. | O1 names broad-profile carpenters alongside builders of wooden buildings, bridge/paving specialists, boat-builders, coopers, turners and wood-carvers. | These are source categories, not a default staff list or social hierarchy.  “Carpenter” does not supply a house, boat, bridge, timber, tools, employment or building permission. | high / medium temporal |
| OCC-06 | `woodworking_activity → may_use_contextual_tools → axe_adze_saw_drawknife_chisel_auger_plane` | X–XII Novgorod direct; c.1230 inferred medium. | O1 fig. 5/text list axes, adzes, saws, drawknives, chisels, augers and plane-like tools in the steel toolkit used in wood-working crafts. | The list is not a recipe or mandatory loadout.  Tool presence, sharpness, access, time and a wood source remain separate facts.  This is useful for an existing carpenter/boat-worker/repair context. | high / medium temporal |
| OCC-07 | `woodworking_skill_context → may_address → building_transport_or_utility_object` | Medieval Novgorod, inferred medium from O1. | O1 links the extensive wood-working specialisms to buildings, ships, sledges, bridges/paving, mechanisms, furniture, utensils and tools. | It does **not** establish which one a worker makes, nor that an ordinary role can build a functional bridge/boat without materials, place authority and process checks.  Gameplay use is a broad task envelope, not a result whitelist. | medium |
| OCC-08 | `potter_role → historically_compatible_with → ceramic-production-skill-context` | Broad medieval Novgorod, direct category evidence; c.1230 medium. | O2 explicitly identifies “пригёмы и методы новгородских мастеров” including potters, based on technical and archaeological analysis. | O2 does not provide an exact 1230 kiln, wheel, clay recipe, firing temperature, vessel form, workshop placement, or individual potter.  Use only as a skill/context bridge when clay/process/place are independently grounded. | medium-high |
| OCC-09 | `craft_technique_context → has_period_sensitive_variation → no_default_single_method` | X–XV Novgorod direct as a research conclusion. | O2 says analysis found a transition from more complex methods in X–XII to simpler methods in XIII–XV, associated by the author with demand and market expansion. | This is not a date cutover, a quality rating, or a rule that every XIII-century object was simpler.  It blocks a single timeless “medieval craft method” from being silently assumed. | medium |
| OCC-10 | `agricultural_role_claim → requires_independent_task_and_land_or_crop_basis → no_role_from_tool_alone` | Medieval Novgorod land; inference, high confidence as an evidential boundary. | O2 treats agriculture among the fields illuminated by the assemblage; O5 supplies the separate material anchors for field/ploughshare and garden tools.  Their chronological and site limits differ. | A ploughshare, scythe or shovel is not proof that its holder is a farmer, owns land, has a harvest, or is working now.  This candidate is specifically a safe role-attribution gate for farmer context. | high as limit |
| OCC-11 | `procurement_activity → may_be_expressed_as → directed_purchase_of_named_grain` | Late XII–first quarter XIII documentary envelope; direct for the fragment, medium for continuity to 1230. | O4’s catalogue calls no. 943 an instruction to buy grain; its surviving text mentions rye and barley. **RU:** «Фрагмент грамоты фиксирует распоряжение о покупке зерна, а не наличие зерна у адресата». **EN:** “The letter fragment records an instruction to purchase grain, not grain held by the addressee.” | The addressee is not thereby a merchant, agent, farmer or owner; no quantity, price mechanism, route, market, money, completed sale or stock.  Useful for a grounded trader/procurer activity without assigning a social identity. | high |
| OCC-12 | `fishing_role_context → must_not_imply → generic_toolkit_or_clothing_or_catch` | Medieval Novgorod land; direct evidence limit from O3 plus existing PHC-01–12. | O3 documents several fishing methods and gear forms, while PHC-01–09 already carry the actual occupation/material/shore-or-boat relations. | **No new production claim proposed.** A fisher label must query existing contextual gear, water access and material relations instead of duplicating them or materialising a net, boat, catch, clothing or fishing right.  This is a coverage/authoring boundary for the requested fisher role. | high as limit |

## Authoring boundaries and verification questions

- OCC-01–07 are candidate bridges for `smith` and `carpenter`/related
  wood-worker profiles, not evidence that a particular start NPC is one.
- OCC-08–09 give only the missing `potter → skill/process context` envelope;
  no exact pottery-production toolchain was found in the independently opened
  sources and must not be invented.
- OCC-10 deliberately reuses rather than duplicates HA-21–25: those existing
  claims own agricultural material relations.  It adds only the role-evidence
  boundary.
- OCC-11 is an activity fact, not a trader profile.  It remains compatible
  with an instructed household member as well as a commercial intermediary.
- OCC-12 is intentionally non-authorable; PHC-01–12 already cover the
  requested fisher workplace/tool envelope more directly than a second claim
  could.
- Before promotion, an independent verifier should check O1’s chronological
  wording against the original 1957 publication/figures and decide whether
  the old synthesis supports `medium` rather than `high` c.1230 continuity.

## Statistics

| Measure | Count |
| --- | ---: |
| Atomic candidates | 12 |
| Proposed substantive production candidates | 11 |
| Explicit non-authorable / reuse boundary | 1 |
| Direct XI–XII tool/process anchors | 6 |
| Broad or inferred c.1230 contextual links | 6 |
| Production changes | 0 |

**Research limitation:** the sources establish occupational and technological
contexts, not population frequency, named people, fixed routines, legal work
status, access to a workshop, or a completed activity in the current world.
