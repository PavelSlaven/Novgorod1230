# Независимая проверка gameplay-plant-identification-v3

Проверяемый кандидат: `git:254653427d9739f68b2c4f2bc37f934460adf0f6:data/world-catalogs/novgorod/world-knowledge/production-v1/gameplay-plant-identification-v3.json`.

Проверены точные claim/concept/RU/EN ограничения и actual `knowledge_access.class = domain_internal_only` у всех трёх claim. Это ботанические границы идентификации и свойств растения, не медицинская рекомендация, не дозировка и не утверждение о растении или воздействии в сцене.

## candidate-plant-identity-can-require-multiple-diagnostic-characters

Источник: [University of Minnesota Extension, “Poison hemlock” — “How to identify poison hemlock” и “Common look-alikes”](https://extension.umn.edu/natural-resources/forestry-and-wildlife/invasive-species/poison-hemlock).

Суженный claim теперь ссылается на independently read UMN anchor. Страница применяет общий облик и признаки stem, leaves, flowers, seeds и roots к различению poison hemlock среди look-alikes. Это поддерживает намеренно более слабое inferred/medium `plant_identity_differentiation_can_use_distinguishing_characters_from_multiple_parts_and_overall_habit` и оба точных runtime-текста:

- RU: «Для различения таксономической принадлежности растения могут использоваться различительные признаки нескольких частей и общий облик. Это не устанавливает таксон по названию, одному признаку, тексту, изображению или конкретной сцене.»
- EN: “Distinguishing a plant’s taxonomic identity can use characters from multiple parts and its overall habit. This establishes no taxon from a name, one feature, text, image, or concrete scene.”

`can use/могут использоваться`, `medium`, `inferred` и `domain_internal_only` верно не переносят один пример на готовую идентификацию любого растения. Не установлены таксон, локальное растение, actor expertise, наблюдение, image/text identification или результат сцены. Verdict: `APPROVE`.

## candidate-edible-plant-status-does-not-transfer-to-every-part

Источник: [U.S. National Library of Medicine, MeSH “Plants, Edible” — Definition](https://www.ncbi.nlm.nih.gov/mesh?Cmd=DetailsSearch&Db=mesh&Term=%22Plants%2C+Edible%22%5BMeSH+Terms%5D).

Независимо прочитанное определение прямо говорит: “Not all parts of any given plant are edible”. Это точно подтверждает `edible_plant_status_does_not_establish_that_every_part_of_that_plant_is_edible`, concept food-part boundary и оба runtime-текста:

- RU: «Статус пищевого растения не устанавливает пригодность в пищу каждой его части. Это не устанавливает растение, часть, количество, сезон, безопасность, обработку или исход в конкретной сцене.»
- EN: “A plant’s food-use status does not establish that every part is edible. This establishes no plant, part, amount, season, safety, processing effect, or outcome in a concrete scene.”

`domain_internal_only` уместен: MeSH definition не является советом по безопасному употреблению. Не установлены вид, часть, доза, сезон, обработка, безопасность или исход. Verdict: `APPROVE`.

## candidate-visually-similar-plants-can-differ-in-identity-and-hazard-properties

Источник: [University of Minnesota Extension, “Poison hemlock” — “How to identify poison hemlock” и “Common look-alikes”](https://extension.umn.edu/natural-resources/forestry-and-wildlife/invasive-species/poison-hemlock).

Независимо прочитанная страница говорит, что многие растения ошибочно принимают за poison hemlock или наоборот, и делит look-alikes на native, toxic native и noxious. Для poison hemlock она отдельно приводит несколько различительных stem, leaf, flower, seed и root characters и сообщает, что все части highly/extremely toxic. Это поддерживает возможное, не всеобщее отношение `visually_similar_plants_can_differ_in_taxonomic_identity_and_hazard_related_properties` и оба runtime-текста:

- RU: «Внешне похожие растения могут различаться таксономической принадлежностью и свойствами, связанными с опасностью. Это не устанавливает вид, наличие растения, опасность, воздействие или исход в конкретной сцене.»
- EN: “Visually similar plants can differ in taxonomic identity and hazard-related properties. This establishes no species, plant presence, hazard, exposure, or outcome in a concrete scene.”

`can/могут`, `medium`, `inferred` и `domain_internal_only` сохраняют scope: источник — один современный региональный пример, не перенос опасности на семейство или конкретную сцену. Не установлены Новгород, вид, наличие, диагноз, воздействие, доза или исход. Verdict: `APPROVE`.

## Итог

Все три claim получают `APPROVE`. Проверены три candidate digest из in-memory merged authoring pack; candidate, descriptor и ledger не изменялись.
