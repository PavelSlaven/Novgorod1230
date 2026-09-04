# Plant identification and food-use bounds v3

## Scope

Research-only response to cartography P1 `non-fungal edible-versus-toxic plant
identification`. It supplies bounded factual premises for open actions such as
recognise, gather, compare and propose a use. It is not a foraging guide,
species whitelist, dosage/consumption advice, treatment advice, or proof that a
plant occurs in a Novgorod scene.

Existing records stay distinct and are not duplicated:
`claim:bearberry-lingonberry-resemblance-not-identification`,
`claim:mezereon-poisonous-sap-all-parts`, and
`claim:wild-mushroom-resemblance-not-edibility`. They demonstrate named cases;
they do not supply the cross-taxon identification and plant-part bounds below.

## Reopened primary/official anchors

1. [Connecticut Agricultural Experiment Station, *Poisonous Plants*, pp. 2–4,
   “Helpful information for identification” and “Selected terms used in plant
   identification”](https://portal.ct.gov/-/media/CAES/DOCUMENTS/Publications/Fact_Sheets/Plant_Pathology_and_Ecology/POISONOUSPLANTS062708Rpdf.pdf?la=en).
   The official station document says accurate identification benefits from a
   complete sample and records flowers/fruits, leaves, twigs, habit, and leaf
   form/arrangement; its botanical glossary is for describing and distinguishing
   leaves, fruits and flowers. This supports diagnostic-character premises, not
   a field-identification procedure or a conclusion from a single trait.
2. [Royal Botanic Gardens, Kew, *Name and synonymy resources*, “Plant and
   fungal taxonomy”](https://www.kew.org/science/collections-and-resources/data-and-digital/names-and-taxonomy).
   Kew distinguishes accepted names/taxonomic classification from names and
   synonyms, and describes WCVP/POWO as taxonomy, description, distribution and
   use resources. This grounds taxon-level identity rather than common-name or
   appearance-only identity.
3. [National Library of Medicine, MeSH, *Plants, Edible*](https://www.ncbi.nlm.nih.gov/mesh?Cmd=DetailsSearch&Db=mesh&Term=%22Plants%2C+Edible%22%5BMeSH+Terms%5D), definition.
   NLM states that not every part of an edible plant is edible and lists plant
   parts that may occur as raw or cooked foods. It supports part-specific food
   bounds; it does not certify any unknown plant or preparation.
4. [University of Minnesota Extension, *Poison hemlock*, “How to identify” and
   “Common look-alikes”](https://extension.umn.edu/natural-resources/forestry-and-wildlife/invasive-species/poison-hemlock).
   The official university extension page contrasts multiple stem, leaf, flower,
   seed and root characters among look-alikes; it records a carrot-like root
   for toxic *Conium maculatum* and differentiates it from other taxa. This is
   a concrete botanical counterexample to one-feature identity. It is not
   evidence of current Russian presence, medieval use, or an action instruction.

Browser Harness initially reached a USDA Forest Service page but it returned a
service-block response. The listed anchors were then opened through the
official/academic web fallback; no claim relies on the blocked page.

## Bounded candidate premises — pending independent verification

### PID-01 — diagnostic characters and taxonomic identity

**RU candidate:** Для установления ботанической идентичности растения могут
требоваться различительные признаки нескольких частей и общий облик растения;
одного разговорного названия или одного внешнего признака недостаточно, чтобы
установить таксон.

**EN candidate:** Establishing a plant’s botanical identity can require
distinguishing characters from multiple plant parts and its overall habit; one
common name or one visible feature is insufficient to establish a taxon.

**Evidence/anchor:** CAES pp. 2–4; Kew “Plant and fungal taxonomy”.

**Qualitative scope:** universal botanical-identification premise. It permits a
resolver to request/consider additional observed characters or return unknown.
It does not identify a plant from text, image, habitat, scent, colour, a common
name, or one observed feature; it does not materialize a taxon.

### PID-02 — food use is plant-part bounded

**RU candidate:** То, что растение относится к пищевым, не устанавливает
пригодность в пищу каждой его части; часть растения должна быть указана
отдельно.

**EN candidate:** A plant’s food-use status does not establish that every part
of it is suitable as food; the plant part must be specified separately.

**Evidence/anchor:** NLM MeSH “Plants, Edible”, definition.

**Qualitative scope:** a taxon/part boundary only. It establishes no edible
taxon, present plant, quantity, season, condition, nutrition, dose, safety,
or outcome. It does not say that a named part is safe or unsafe.

### PID-03 — resemblance is not taxonomic or hazard transfer

**RU candidate:** Внешнее сходство растений не переносит между ними
ботаническую идентичность или свойства, связанные с опасностью; для различения
могут требоваться признаки стебля, листьев, цветков, плодов/семян, корней и
общего облика.

**EN candidate:** Visual resemblance between plants does not transfer botanical
identity or hazard-related properties between them; distinguishing them can
require stem, leaf, flower, fruit/seed, root, and whole-habit characters.

**Evidence/anchor:** CAES pp. 2–4; UMN “How to identify” and “Common
look-alikes”.

**Qualitative scope:** modal cross-taxon caution, not a claim that all similar
plants differ in every property. It does not diagnose toxicity, identify an
Apiaceae member, establish a plant’s local presence, or create a mandatory
action. The *Conium* example is evidence for the principle, not a Novgorod
scene assertion.

### PID-04 — raw/cooked form is not implicit

**RU candidate:** Для утверждения о пищевом использовании при необходимости
следует различать таксон, часть растения и форму употребления — сырую либо
приготовленную; общий ярлык «съедобное растение» не задаёт все эти параметры.

**EN candidate:** A food-use assertion should distinguish, where relevant, the
taxon, plant part, and raw or cooked form; the general label “edible plant”
does not supply all of those parameters.

**Evidence/anchor:** NLM MeSH “Plants, Edible”, definition; Kew “Plant and
fungal taxonomy”.

**Qualitative scope:** data-granularity premise only. It does **not** infer that
processing removes danger, makes a part edible, changes a dose, or supplies a
method. Any processing effect needs separate taxon-and-part-specific evidence.

## Relevant research targets without a species whitelist

For a future materialized temperate plant, examine the actual accepted taxon and
part rather than selecting from a global food list. High-value target shapes are
umbellifer-like flower/leaf/root look-alikes (the UMN *Conium* / carrot-like
example), berry/fruit look-alikes beyond the already covered bearberry–lingonberry
pair, and roots, leaves, fruits, seeds and saps whose properties differ by part.
These are **research families**, not assertions of local Novgorod availability
or historical food practice. Historical/regional source and materialization are
still separately required before a specific plant can enter a 1230 scene.

## Open-world probes and limits

- “These two white-flowered herbs look alike; are they same plant?” PID-01/03
  support an unknown/additional-character response, not a species answer.
- “This plant has an edible fruit; can this root be used as food?” PID-02
  prevents part transfer. It gives no use result.
- “Plant is called edible; does heating settle it?” PID-04 prevents implicit
  raw/cooked transfer. It gives no processing result.
- “A taxon appears in a description.” None of these candidates establishes
  regional range, historical use, present stock, access, actor expertise or
  perception.

No candidate should be approved from this file. Source/domain verifier must
recheck each exact RU/EN text, anchors and limits before authoring or promotion.
