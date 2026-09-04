# Independent verification — leather and plant-fibre water response

**Scope:** LP-01--LP-04 and PF-01--PF-05 from
`research/population-leather-plant-fibre-water.md` only. This is a universal
material-response review, not historical availability, an inventory assertion,
or proof that an in-world object is wet, damaged, tanned in a particular way,
or made from a named fibre.

## Sources independently read

- Carole Dignard and Janet Mason, [*Caring for leather, skin and fur*](https://www.canada.ca/en/conservation-institute/services/preventive-conservation/guidelines-collections/caring-leather-skin-fur.html), Canadian Conservation Institute (CCI): **Rawhide**, **Alum-tawed skin**, **Vegetable-tanned leather**, and **Water**.
- Renée Dancause, Janet Wagner and Jan Vuori, [*Caring for textiles and costumes*](https://www.canada.ca/en/conservation-institute/services/preventive-conservation/guidelines-collections/textiles-costumes.html), CCI: **Natural fibres**, **Water**, and **Pollutants** / “Liquid contaminants.”

Both live CCI pages and the cited sections were opened and read independently.

| Candidate | Verdict | Production-safe wording | Checked basis and limits |
|---|---|---|---|
| LP-01 | **APPROVE_WITH_LIMITS** | Прямой контакт с водой может повредить кожу и выделанную кожу; степень повреждения зависит в том числе от обработки, отделки и состояния. / Direct water contact can damage skins and leather; degree of damage depends in part on processing, finishing and condition. | CCI leather, **Water**, opening two sentences (“Most skins and leathers …”; degree depends on processing, finishing and condition). Conditional only: it establishes no wet object, damage, tanning type, or outcome. |
| LP-02 | **APPROVE_WITH_LIMITS** | Растительно-дублёная кожа при прямом контакте с водой может усохнуть или затвердеть; дубильные вещества могут мигрировать к поверхности, вызывая окрашивание и поверхностную хрупкость. / Vegetable-tanned leather directly exposed to water may shrink or stiffen; tannins may migrate to the surface, causing staining and surface embrittlement. | CCI leather, **Water**, vegetable-tanned-leather sentences. Tannage-specific and conditional; do not infer a local historical tannage, wet strap, stain, or strength loss. |
| LP-03 | **APPROVE_WITH_LIMITS** | Квасцово-выделанная кожа имеет малую водостойкость: при намокании соли обработки могут вымываться, оставляя твёрдое роговидное состояние. / Alum-tawed skin has little water resistance: wetting can wash out processing salts, resulting in a hard, horny condition. | CCI leather, **Water**, alum-tawed-skins sentence; consistent with the separate **Alum-tawed skin** section. Do not equate it with vegetable-tanned leather or infer that any hide is alum-tawed. |
| LP-04 | **APPROVE_WITH_LIMITS** | Достаточно намокшая сыромятная кожа может разбухать, а при высыхании усыхать. / Rawhide wet enough can swell and shrinks as it dries. | CCI leather, **Rawhide** and **Water**: sufficiently wet rawhide first swells; “As rawhide dries, it shrinks.” Rawhide is a distinct, untanned material. This does **not** assert a reversible cycle, a permanent dimensional change, putrefaction, contraction force, or rawhide's historical availability in a scene. |
| PF-01 | **APPROVE_WITH_LIMITS** | Растительные волокна состоят преимущественно из целлюлозы; конопля названа среди целлюлозных волокон, используемых для тканей, а лён — ткань, получаемая из волокон льна. / Plant fibres are predominantly cellulosic; hemp is among cellulosic fibres used for fabrics, while linen is the textile made from flax fibre. | CCI textiles, **Natural fibres**: cellulose is the major plant-fibre component; hemp is listed among cellulosic fibres; flax requires processing to make yarn and fabric called linen. Production must use this corrected wording, which does not collapse a fibre (flax) with yarn/fabric (linen). No wet-strength or availability inference follows. |
| PF-02 | **APPROVE_WITH_LIMITS** | Новый лён из волокон льна прочен, впитывает влагу, быстро высыхает и мало восстанавливает форму. / New linen made from flax is strong, absorbent, quick-drying and low-resiliency. | CCI textiles, **Natural fibres**, flax paragraph. This is a new-linen description, not a claim about hemp, every plant fibre, aged linen, a particular weave, wet tensile strength, or a scene drying time. |
| PF-03 | **APPROVE_WITH_LIMITS** | Избыточная вода может проникать в природные волокна; при этом волокна могут разбухать. / Excess water can penetrate natural fibres; when it does, the fibres can swell. | CCI textiles, **Water**, “Excess water” paragraph. Production must use this narrower, directly supported wording rather than the unsupported extra proposition that textile structure and material state govern this particular response. Swelling here is not evidence of a permanent dimensional change, a wet textile, or transmission through every fabric. |
| PF-04 | **APPROVE_WITH_LIMITS** | При намокании текстиль может получить усадку, потерять гибкость, растянуться или порваться, если волокна не удерживают дополнительный вес воды. / Water damage to a textile can include shrinkage, loss of flexibility, stretching, and tears when fibres cannot support the added water weight. | CCI textiles, **Water**, opening paragraph. This is a conditional object-level damage list, not a rule for every fibre/yarn/fabric or a conclusion that damage is irreversible. It gives neither current wetness nor a load threshold. |
| PF-05 | **APPROVE_WITH_LIMITS** | Вода или масла могут переносить загрязнения внутрь волоконной структуры текстиля капиллярно; со временем такие пятна могут окисляться, ослабляя и разрывая волокна. / Water or oils can carry soils inside textile fibre structure by capillary action; over time such stains can oxidize, weakening and breaking fibres. | CCI textiles, **Pollutants**, “Liquid contaminants.” Requires a contaminating liquid/stain and time. It does not make water alone a contaminant, assert ingress for every textile, or establish immediate damage. |

## Boundary for later normalization

Keep rawhide, alum-tawed skin, and vegetable-tanned leather as separate
material/process classes. Do not generalize their water response to “leather.”
Likewise retain the fibre--yarn/fabric distinction: PF-01 is a taxonomy bridge,
whereas PF-02 is a new-linen (textile) description. Neither swelling candidate
proves irreversible dimensional change; PF-04 identifies possible textile
damage only under its stated conditions. Technical tannage, cellulose and
capillary explanations are `domain_internal_only`; limited observable outcomes
may be presented as `general_physical` only without presenting the theory as
automatic NPC knowledge.

## Exact production normalization check

**Verdict: APPROVE_WITH_LIMITS.** I read all nine records, their concepts,
evidence anchors and RU/EN localizations in
`production-v1/leather-plant-fibre-water.json` against the CCI passages already
opened for this review. The fragment preserves a universal, conditional
material-science scope; it does not convert a conservation source into an
assertion of medieval processing, local supply, a present water event, or a
particular object's condition.

| Production claim refs | Exact-review result |
|---|---|
| `claim:material-water-leather-water-processing`; `claim:material-water-vegetable-leather-water`; `claim:material-water-alum-skin-water`; `claim:material-water-rawhide-wet-dry` | Approved: the relations, source anchors, separate material classes and RU/EN limits match LP-01--04. Rawhide remains distinct from leather; no localization adds reversibility, permanent dimensional change, contraction force, or historical availability. |
| `claim:material-water-plant-fibre-cellulose`; `claim:material-water-new-linen-water` | Approved: PF-01 exactly distinguishes plant fibre, hemp and linen textile made from flax; PF-02 stays specifically about **new linen**, omitting any improper hemp/all-plant-fibre generalization. |
| `claim:material-water-natural-fibres-water-swelling` | Approved: PF-03 uses the corrected narrow proposition only—excess water can penetrate natural fibres and can swell them. It correctly excludes a permanent change, current wetness and universal through-flow. |
| `claim:material-water-textile-water-load`; `claim:material-water-textile-liquid-contaminants` | Approved: PF-04 retains conditional textile-object damage and no threshold/irreversibility; PF-05 retains contaminating liquid plus time before oxidation-related weakening. Neither makes water alone a contaminant or a present damage finding. |

All nine claims use `domain_internal_only`, which is correct for their
processing, material-class, capillary, or conditional damage content. This does
not remove separately modeled observable material behaviour; it prevents the
technical explanation from being treated as automatic actor knowledge.

## CCI natural-fibres atomic split addendum

**Scope:** source verification for a proposed split of the former compound
`claim:material-water-plant-fibre-cellulose`, not an assertion that a fibre,
yarn or textile exists in the historical scene.  I independently reopened CCI,
[*Caring for textiles and costumes*](https://www.canada.ca/en/conservation-institute/services/preventive-conservation/guidelines-collections/textiles-costumes.html), **Natural fibres**.

| Proposed atomic relation | Verdict | Exact source basis and approved limit |
|---|---|---|
| Plant fibres → predominantly cellulosic | **APPROVE_WITH_LIMITS** | CCI states that cellulose is the **major component** in plant fibres and therefore they are also called cellulosic fibres. Safe RU/EN: **«Растительные волокна состоят преимущественно из целлюлозы. / Plant fibres are predominantly cellulosic.»** This is a universal material classification only. |
| Hemp → cellulosic plant fibre used for fabrics | **APPROVE_WITH_LIMITS** | The same paragraph says that varieties of cellulosic fibres have been used to create fabrics, including hemp. Safe RU/EN: **«Пенька относится к растительным целлюлозным волокнам, используемым для тканей. / Hemp is a cellulosic plant fibre used for fabrics.»** It does not assert local/medieval hemp, yarn, a finished cloth, wet strength, or a present item. |
| Linen textile → made from flax fibre | **APPROVE_WITH_LIMITS** | CCI identifies flax as a plant fibre and says it requires processing steps to produce the yarn and fabric called “linen.” Safe RU/EN: **«Льняную ткань (linen) получают из волокон льна (flax). / Linen is the textile made from flax fibre.»** This is an origin relation; it does not collapse flax fibre into yarn or fabric, prescribe a process, or infer historical availability or water response. |

All three relations belong to universal material science and should remain
`domain_internal_only`: they do not supply automatic actor knowledge, historical
presence, a craft recipe, or any wet-strength conclusion.

## Exact normalization check — CCI atomic split

**Verdict: APPROVE_WITH_LIMITS.** I read the three normalized records and their
RU/EN localizations in `production-v1/leather-plant-fibre-water.json` against
the reopened CCI **Natural fibres** passage.

| Claim ref | Exact-review result |
|---|---|
| `claim:material-water-plant-fibre-cellulose` | Approved: it now contains only the broad cellulosic classification; `supported_fact`, universal scope, high/direct qualifiers and `domain_internal_only` fit the source and do not leak a historical or wet-strength claim. |
| `claim:material-water-hemp-cellulosic-fibre` | Approved: the subject, literal relation and bilingual text preserve CCI’s hemp example among cellulosic fibres used to create fabrics. They distinguish fibre from yarn/fabric and exclude present or historical availability. |
| `claim:material-water-linen-flax-origin` | Approved: the claim and bilingual text preserve the flax-fibre → linen-yarn/fabric origin relation without calling fibre itself a finished textile, asserting a prescribed method, or inferring water response or presence. |

## Atomic classification split and registry boundary — compiled 457

**APPROVE_WITH_LIMITS.** The former compound PF-01 localization is now three
source-faithful claims with the same approved CCI evidence: generic plant-fibre
cellulose (`claim:material-water-plant-fibre-cellulose`), direct hemp
classification on the existing `wk:material_culture:hemp-fibre`
(`claim:material-water-hemp-cellulosic-fibre`), and linen-from-flax origin on
the existing `wk:material_culture:linen-textile`
(`claim:material-water-linen-flax-origin`). Their RU/EN texts keep the
fibre/yarn/textile distinction and explicitly deny wet-strength, present
material and historical-availability inferences. They are universal,
common/high/direct, and `domain_internal_only`; no new source or factual
relation was introduced.

The `physics_material_science.supported_fact` signature now also permits a
`material_culture` subject. This is contract-compatible and necessary for a
universal physical classification of an existing material concept: the old
`material_culture.supported_fact` signature requires contextual applicability,
whereas the physics signature is literal, universal and retains the same
consumer meaning. It mirrors existing cross-domain material subjects on
physics response predicates; it adds no predicate, schema, owner, route or
retrieval exception. The compiled 457 Core replay returns the hemp
classification together with water swelling for the saved wet-hemp query under
the existing 12/12/5000 budget. That proves the intended retrieval projection,
not a full semantic or production-gate pass.

## Editorial re-check — liquid-contaminant pathway

**APPROVE NARROWER WORDING.** The source-backed condition applies to the
specific pathway in this claim: contamination carried by liquid and subsequent
time before oxidation-related weakening. It does not establish those two
conditions as exclusive requirements for all textile damage. The localizations
should read **RU:** `Для описанного пути через загрязнение нужны загрязняющая
жидкость и последующее время: ...` / **EN:** `For this
contamination-mediated pathway, contaminating liquid and subsequent time are
required: ...` The existing limits that water is not itself made a contaminant
and that no immediate damage follows remain source-faithful.

## Exact editorial-normalization check — compiled 491

**MATCHES_APPROVAL.** `claim:material-water-textile-liquid-contaminants` now
states in RU/EN that contaminating liquid and subsequent time are required
**for this contamination-mediated pathway**. It retains the verified capillary
transport/oxidation sequence and does not represent these conditions as an
exclusive cause of all textile damage.

## Addendum — FPD-10, independent CCI fibre-to-yarn verification

**Verdict: APPROVE_WITH_REWORDING.** I independently reopened and read the
full CCI [*Caring for textiles and costumes*](https://www.canada.ca/en/conservation-institute/services/preventive-conservation/guidelines-collections/textiles-costumes.html), including **General characteristics of textiles / Fibrous structure**. It states: “Fibres are long, fine, rod-like structures capable of being twisted together to form yarns.”

This supports one universal, `domain_internal_only`, direct/high **capability**
relation only:

> **RU:** Текстильные волокна могут скручиваться вместе, образуя пряжу.
> **EN:** Textile fibres can be twisted together to form yarn.

Do not use “prepared textile fibres” as source wording: CCI does not describe
a preparation state or its required stages. A caller with already-established
prepared fibre may apply the universal capability, but the claim itself does
not prove preparation, plant/species identity, staple length, twist direction
or amount, tool, spinner, time, tensile quality, successful output,
historical/local availability, or current fibre/yarn. “Capable” is not a
guarantee that every fibre can make usable yarn. No production approval or
historical-practice inference follows.

## Exact normalization check — compiled 508 / FPD-10

**MATCHES_APPROVAL.** `claim:textile-fibres-twist-yarn` uses the approved
universal `physics_material_science.supported_fact` relation, a literal object,
unknown/high/direct qualifiers and `domain_internal_only`. RU/EN state only
that textile fibres *can* be twisted together to form yarn and retain the
capability/non-guarantee limit. They do not reintroduce a prepared-fibre state,
species, twist specification, tool, worker, successful output, historical
availability or present material.
