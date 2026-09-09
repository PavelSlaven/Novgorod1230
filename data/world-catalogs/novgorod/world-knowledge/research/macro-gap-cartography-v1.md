# Macro-gap cartography v1

**Status:** research / proposed authoring map; not a production catalog, not a release gate, and not an authority to materialize a fact, item, role, law, location, or action.

**Scope:** independent static World Knowledge (WK) blind-spot pass for Novgorod 1220–1240. It does not start live gameplay or alter the active `production-v1` pack.

## Method and result

`production-v1/category-cartography.json` says explicitly that classifying every existing claim is **not** evidence that all gameplay knowledge exists. Its eleven domain rollups are all `partial`; the present 128 families contain strong physical, material, ecological, craft and bounded social coverage, but do not contain standalone families for the nine P1 macro-domains below.

The [HRAF Outline of Cultural Materials](https://hraf.yale.edu/ehc/ocm/) (OCM) is used only as an external *blind-spot classifier*: it separates such areas as language, family/kinship, political organization, law, warfare, sickness, life cycle, education and recreation. It supplies no fact about thirteenth-century Novgorod and must never be used as evidence for a production claim.

The required next step is a source-backed authoring pass for each P1 domain, not a bulk import and not a claim-count target. Candidate wording below is deliberately compositional: a future claim may state a bounded relation, but cannot assert a scene fact, an NPC's identity/status/knowledge, a current legal result, or exact mechanics.

## Cross-cutting limits

* **Historical claims** need place, period and source-specific applicability. A birch-bark letter attests that letter's text and context; it does not prove a universal custom, present possession, literacy of a concrete actor, or a currently delivered message.
* **Universal biological and physical claims** may support conditional causal narration, but diagnosis, thresholds, body state, treatment result, navigation coordinates, light level and combat numbers remain code/state owned.
* **Institutional claims** describe evidence-bounded context only. Jurisdiction, office-holder, authority, legal admissibility, sanction, relationship and outcome remain authoritative state and their existing domain owners.
* The work must extend existing WK authoring/verification flow and the sole `turn_step_request_v1 → turn_step_plan_v1` semantic boundary. It must not create a new gameplay resolver, action whitelist, legal simulator, medical engine, combat engine, source ledger or runtime fallback.

## P1: language, names and everyday literacy

**Current support.** `material-written-objects`, `social-documentary-practice` and `social-family-care` are grounded. `family-social-context.json` cites Novgorod birch-bark letters [7](https://gramoty.ru/birchbark/document/show/novgorod/7/), [9](https://gramoty.ru/birchbark/document/show/novgorod/9/), [87](https://gramoty.ru/birchbark/document/show/novgorod/87/), [112](https://gramoty.ru/birchbark/document/show/novgorod/112/) and [147](https://gramoty.ru/birchbark/document/show/novgorod/147/). `social-documentary-practice` and the partial `speech-acts-and-social-commitments` support records and generic pragmatic meaning, not a language model.

**Missing subfamilies (P1).** Novgorod linguistic forms/dialect evidence; personal names, patronymics and forms of address; reading, writing and counting as materially situated practices; birch-bark message composition, carrier and delivery; school exercise/child writing; distinction between spoken wording, written carrier and authoritative truth.

**Minimal candidate relations.** A dated letter can attest named correspondents and a written request/order in its text; writing on a carrier can preserve an utterance without proving that it was sent, read, obeyed or true. Direct period leads are [letter 219 (1200–1220)](https://gramoty.ru/birchbark/document/show/novgorod/219/), [334 (1220–1240)](https://gramoty.ru/birchbark/document/show/novgorod/334/) and [616 (1220–1240)](https://gramoty.ru/birchbark/document/show/novgorod/616/). Onfim [199](https://gramoty.ru/birchbark/document/show/novgorod/199/) is currently dated 1240–1260: it is a strong lead for later-thirteenth-century educational evidence, but is not direct 1230 grounding. Do not infer a reconstructed everyday dialogue or a universal literacy rate from individual texts.

**Owner limits.** Dialogue interpretation remains the common semantic boundary; identities, knowledge, message delivery and document authenticity remain state/knowledge owners.

## P1: warfare and military material culture

**Current support.** `built-civic-defence`, `material-fishing-hunting`, `material-metals`, `material-tools` and `craft-technology-boundaries` are grounded. `agriculture-fauna.json` has `claim:agriculture-fauna-ash-hunting-bow`, an archaeological bow from a second-quarter-thirteenth-century Novgorod layer, explicitly not a present weapon or performance. `weapons_and_armor.txt` is an `UNDECLARED / DOMAIN GUIDE`, so it is not evidence or a verified production family.

**Missing subfamilies (P1).** Period/place-specific weapon and protective-equipment categories; carrying, maintenance and damage context; military roles and mustering; movement, provisioning and siege context; battle aftermath and peace-making context. OCM's warfare grouping is the external coverage prompt, not evidence for Novgorod.

**Minimal candidate relations.** A dated find or securely contextualized museum object may attest the category/form of an implement or defence; an evidence-bounded source may attest an institutional military role or campaign practice. The Institute of Archaeology catalogues [Kolchin's Novgorod ironwork](https://archaeolog.ru/el-bib/el-cat/el-series/mia/mia-65) and [Medvedev's projectile-weapon typology](https://archaeolog.ru/el-bib/el-cat/el-series/svod-arch/sai-e1-36_1966) are evidence leads: the latter is broad Rus typology, not Novgorod commonness or access. Neither permits a weapon in a scene, grants skill/access, chooses a tactic, establishes an army, or assigns hit, damage, armour or morale values.

**Owner limits.** Existing combat/body/time owners retain exact exchange, injury, inventory, access and persistent consequences.

## P1: marriage, kinship, gender and social status

**Current support.** `social-family-care`, `social-roles-norms-and-socialization`, `npc-household-routines`, `npc-political-roles` and partial `care-dependency-and-household-negotiation` exist. The latter is scoped to kin requests and narrow Extended *Russkaya Pravda* care/succession clauses (`claim:rp-minor-children-conditional-care`, `claim:rp-caretaker-principal-goods`, `claim:rp-mother-household-care-succession`) and expressly is not enacted Novgorod-1230 law.

**Missing subfamilies (P1).** Marriage formation/ceremony and affinal kin; household and descent terminology; gendered/age/status expectations as source-bounded context; social rank, prestige, dependency and legal capacity; inheritance as a system rather than isolated textual clauses.

**Minimal candidate relations.** A source may attest the relation or office named in its own textual/archaeological context; a historical norm may be encoded only with its date, place, participants and uncertainty. It must not become a universal gender rule, a deterministic NPC disposition, proof of a live marriage/kinship/status, or an automatic property/legal result. Primary targets: the *Russkaya Pravda* source edition already used by the pack, period-specific Novgorod texts, and academic editions interpreting them.

**Owner limits.** Relationship graphs, consent, household membership, ownership, legal capacity and social response remain persisted/state semantics, not WK facts.

## P1: reproduction and human life cycle

**Current support.** `biology-reproduction-and-development` is grounded, but currently only supplies broad organismal premises such as gamete fusion and development. `body-exertion-hydration-and-sleep`, `body-injury-repair-and-barrier`, `body-thermoregulation-energy-and-fatigue`, and `physiology-*` families cover particular causal mechanisms, not lifecycle care.

**Missing subfamilies (P1).** Pregnancy, childbirth, postpartum condition, infant feeding/care, childhood development, puberty, ageing, and functional variation/disability as non-diagnostic contextual domains.

**Minimal candidate relations.** Use authoritative clinical/physiology sources (for example the [WHO International Classification of Functioning](https://www.who.int/standards/classifications/international-classification-of-functioning-disability-and-health)) only for bounded universal functional relations. Historical practices, roles and outcomes require separately dated Rus/Novgorod evidence. A candidate must never diagnose pregnancy/illness/disability, infer ability, force a life event, set duration/risk, or guarantee birth/recovery.

**Owner limits.** Actor body state, age, capacity, medical outcome and exact mechanics belong to body/state owners.

## P1: sickness, medicine and care

**Current support.** `biology-pathogen-immunity-and-infection`, `body-injury-repair-and-barrier`, `built-bathing-sanitation`, `chemistry-exposure-and-routes`, `combustion-carbon-monoxide-and-ventilation`, and `physiology-*` establish bounded causal premises. Cartography calls biology/physiology `partial` and expressly excludes diagnosis and exact body mechanics.

**Missing subfamilies (P1).** Symptom versus diagnosis boundary; fever and dehydration context; gastrointestinal illness; burns, fractures/dislocations and wound-infection context; dental problems, parasites, poisoning; care tasks and historically attested medical roles/practices; functional limits without reducing a person to diagnosis.

**Minimal candidate relations.** A universal source can support a conditional mechanism (for example injury can impair a relevant function) only with no diagnosis or threshold. A historical source can attest a treatment/role/text, not efficacy in a concrete scene. The [WHO ICD](https://www.who.int/standards/classifications/classification-of-diseases) is a modern classifier for blind-spot checking, never period evidence. Production historical claims need period/local medical or archaeological sources.

**Owner limits.** Health state, exposure, diagnosis, treatment permission, effectiveness, mortality and persistence remain code/state owned.

## P1: political institutions, government and external relations

**Current support.** `social-administration`, `npc-political-roles`, `built-public-civic-space`, and `built-civic-defence` are grounded; `civic-space.json` contains `claim:civic-public-assembly`, which attests an assembly space, not procedure or authority. `legal-locality-period-and-status` is already partial.

**Missing subfamilies (P1).** Offices and competences; urban/territorial organization; relation of assembly, prince, posadnik, church and other actors where actually attested; collection/administration; diplomatic and external-relations context; chronological change and uncertainty.

**Minimal candidate relations.** A dated Novgorod chronicle/document or museum/academic source may attest an office, event, named institutional relationship or text-specific competence. The [Novgorod First Chronicle critical edition](https://archive.org/details/novhorodskyj_litopys) is a primary source lead for dated events/actors, not a sufficient source for routine constitutional competence. Do not promote later statutes, an office title, or a single event into a 1230 municipal constitution; never instantiate an office-holder, jurisdiction, order, tax, treaty or diplomatic outcome.

**Owner limits.** Canonical history, political facts, authority and external relations are authoritative facts; active policy/permission remains the relevant code/state owner.

## P1: crime, sanctions and public safety

**Current support.** `social-law-practice`, `social-property-and-market`, `social-documentary-practice`, `social-administration` and partial families for possession, debt, testimony and legal locality already cover narrow textual/property contexts. `social-norms.json` includes the bounded merchant-loss clause (`claim:rp-merchant-credit-relates-third-party-goods`), not a general criminal code.

**Missing subfamilies (P1/P2).** Offences against person/property/authority; non-fulfilment of obligations; accusation/inquiry; compensation/sanction and authority response, each constrained by period/locality/status and source uncertainty. P1 is the boundary itself; P2 is broader everyday public-order texture after direct legal evidence.

**Minimal candidate relations.** Encode only source-bounded “this text distinguishes/describes” relations with participants and applicability; do not derive a live offence, guilt, evidence sufficiency, arrest, sentence, compensation amount or enforcement. The [MSU *Russkaya Pravda* text portal](http://www.hist.msu.ru/ER/Etext/RP/) is a broad-Rus legal comparator—not proof of Novgorod 1230 local procedure. The HRAF law/crime partitions are a coverage checklist only.

**Owner limits.** Incident facts, knowledge, guilt, admissibility, authority activation and consequences remain state/legal-policy owners.

## P1/P2: education, apprenticeship and transmission of skills

**Current support.** `psychology-learning-and-skilled-action`, `social-roles-norms-and-socialization`, `npc-craft-occupations`, `material-written-objects` and `social-documentary-practice` give generic learning, roles, occupations and writing-carrier context, but no historical education family.

**Missing subfamilies.** P1: evidenced reading/writing/counting exercises, apprenticeship/skill transmission and professional knowledge boundaries. P2: routine curricula, formal school organization, rates and universal access.

**Minimal candidate relations.** A dated exercise or tool/context can attest that a practice/object occurred, not that every child read, a particular NPC was trained, a school existed in every district, or that a learner acquired skill. The Institute of Archaeology [Novgorod wooden-object catalogue](https://archaeolog.ru/el-bib/el-cat/el-series/svod-arch/sai-e1-55_1968) and the Gramoty corpus are source leads. Onfim's currently later date needs explicit applicability handling, not silent use as 1230 evidence.

**Owner limits.** Knowledge/perception, skill values, NPC decisions and object existence remain their current owners.

## P2: recreation, music, games and oral culture

**Current support.** `physics-sound-and-vibration` is universal; `material-misc-household` and `material-written-objects` cover objects generally. No dedicated recreation/music/games family is mapped.

**Missing subfamilies (P2).** Toys, board/competitive games, musical instruments/performance context, oral narration/ritual speech, and leisure gatherings—each without assuming scene participation or cultural uniformity.

**Minimal candidate relations.** A securely dated object can attest object type/context; a text can attest a named performance/game. The Institute of Archaeology [Novgorod wooden-object catalogue](https://archaeolog.ru/el-bib/el-cat/el-series/svod-arch/sai-e1-55_1968) and [GIM Novgorod collection record](https://catalog.shm.ru/entity/OBJECT/132148) are leads that require page/object anchoring before atomic claims. They cannot create the object, audience, sound, rule set, player skill, event, belief or social reaction.

**Owner limits.** Sound propagation stays physics; utterance/performance content stays semantic/narration; participants and outcomes remain state.

## P2: winter, cryosphere and northern travel conditions

**Current support.** `environment-weather`, `environment-hydrology`, `environment-geology`, `material-transport`, `body-thermoregulation-energy-and-fatigue`, `physiology-cold-water-immersion`, plus partial `freeze-thaw-soil-bank-integrity` and `seasonal-logistics-and-provisioning` cover freeze–thaw, winter sled evidence and immersion. They do not cover snow/ice travel as a coherent family.

**Missing subfamilies (P2).** Snowpack/crust and tracks; surface freezing/thawing and slip; river/lake ice, leads and breakup; snow load; ice-route access; seasonally contingent visibility/route interpretation.

**Minimal candidate relations.** NOAA/NASA/USGS-style sources may support conditional physical relations only (for example ice/snow state affects surface conditions); period-local winter practice needs local historical evidence. No actual weather, thickness, load-bearing capacity, safe route, transit time or injury may follow from a generic claim.

**Owner limits.** Weather/time, topology, movement, safety calculations and body consequences remain exact owners.

## P2: sky, daylight and natural navigation

**Current support.** `physics-optics-and-light`, `environment-weather`, `psychology-attention-and-perception`, and `material-transport` exist; no sky/celestial or natural-navigation family is mapped.

**Missing subfamilies (P2).** Qualitative daylight/twilight and cloud effects on visibility; sun/moon/stars as potential orientation cues; navigational uncertainty; historically evidenced travel orientation only where sourced.

**Minimal candidate relations.** An astronomy authority such as [NASA Science](https://science.nasa.gov/solar-system/sun/) can support a universal relation between natural illumination and observational conditions, but no scene time/position/direction. A historical navigation claim needs period/place evidence. Do not turn a qualitative WK relation into a clock, ephemeris, map reveal or location proof.

**Owner limits.** Exact celestial position/time, lighting/visibility calculation, map/topology and perceived information remain code/state owners.

## P2: broader food system, hospitality and travel

**Current support.** `material-food-resources`, `process-bread-dough-and-baking`, `process-food-preservation-and-fermentation`, `biology-food-safety-storage-and-fermentation`, `craft-rural-processing`, `environment-fauna-subsistence`, `material-transport`, `ordinary-cooking-handling-and-cross-contact`, `seasonal-logistics-and-provisioning` and `watercraft-operation-and-shore-transfer` are grounded or partial. This is substantial process coverage, not a complete diet/economy/social-practice model.

**Missing subfamilies (P2).** Meat slaughter/butchery; fish processing; dairy and fats; salt and beverages; meal composition and child feeding; animal fodder/veterinary care; travel provisions and lodging; hospitality/guest obligations, each separated from universal access/price/custom claims.

**Minimal candidate relations.** Use archaeological faunal/botanical evidence, securely dated material culture, and primary texts to attest product/process/context. A food find/text cannot supply a current stock, meal, price, hospitality entitlement, dietary rule, nutrition outcome, travel itinerary or present host. Existing cross-contact and heating claims remain the compositional universal layer.

**Owner limits.** Stocks, mass, spoilage, access, transaction, route, accommodation, relationship and health outcome remain their existing owners.

## Authoring order

1. Build nine separate P1 research packets: language/literacy; warfare; family/status; lifecycle; medicine; politics; crime; education; recreation.
2. For each, distinguish (a) externally classified gap, (b) source-backed historical candidate, (c) universal causal premise, and (d) still-unresolved historical question.
3. Only then decide whether a compact new family is justified. Add claims one at a time through the existing WK validation and independent-verification flow.
4. Run a distinct P2 pass for cryosphere, sky/navigation, food and hospitality/travel after the P1 packets. No claim count, filled matrix or retrieval score is a completeness claim.

## Evidence targets

* [HRAF OCM](https://hraf.yale.edu/ehc/ocm/) — external taxonomy only.
* [Древнерусские берестяные грамоты](https://gramoty.ru/birchbark/) — primary textual corpus; use each document's number/date/provenance anchor.
* [WHO ICF](https://www.who.int/standards/classifications/international-classification-of-functioning-disability-and-health) and [WHO ICD](https://www.who.int/standards/classifications/classification-of-diseases) — modern functional/health classifiers only, not medieval diagnosis or practice evidence.
* [NASA Sun overview](https://science.nasa.gov/solar-system/sun/) — universal astronomy orientation only, not a historical navigation source.
* [Novgorod First Chronicle, critical edition](https://archive.org/details/novhorodskyj_litopys), [IA RAS Novgorod ironwork](https://archaeolog.ru/el-bib/el-cat/el-series/mia/mia-65), and [IA RAS Novgorod wooden objects](https://archaeolog.ru/el-bib/el-cat/el-series/svod-arch/sai-e1-55_1968) — source leads; each future production claim needs a page/object/date anchor and scoped applicability.

Before production authoring, replace each evidence target with the exact source record and anchor that supports the individual claim; official Novgorod museum/GIM collection pages and critical academic editions are preferred for regional historical claims.
