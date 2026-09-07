# Static human physiology residuals v1 — research only

**Status:** original research snapshot against the 912-claim pack. The six
proposals below have since been independently approved and promoted in
`production-v1/static-human-physiology-v1.json`; see
`verification/static-human-physiology-v1.md`. The table's partial/missing labels
describe that earlier discovery, not current production gaps. These premises
are not medical guidance, actor diagnosis, body-state assertions, forced actions,
thresholds, treatment or runtime-owner changes.

## Reconciliation against plan §§11/37

| Need | Exact existing composition | Disposition and limit |
| --- | --- | --- |
| Hypoxia / lowered consciousness | `claim:candidate-physiology-v3-airway-obstruction-respiratory-impairment`; `claim:foundations-life-12-respiration`; `claim:foundations-life-13-alveolar-exchange`; `claim:candidate-physiology-v3-oxygen-delivery-brain-function` | **Closed bounded.** Airway obstruction may impair breathing/O₂ delivery; low blood O₂ may cause drowsiness or LOC. No cause, duration, reversibility, actor state or outcome. |
| Choking / drowning | `claim:candidate-physiology-v3-airway-obstruction-respiratory-impairment`; `claim:candidate-physiology-v3-cough-reflex-airway-irritation`; `claim:candidate-physiology-v3-gag-reflex-pharyngeal-stimulation`; `claim:candidate-physiology-v3-swallowing-airway-protection`; `claim:candidate-physiology-v3-drowning-respiratory-impairment` | **Closed bounded.** Drowning requires respiratory impairment from immersion; a submersion alone is not drowning. No relief method, diagnosis, aspiration, survival or scene state. |
| Blood loss / perfusion / severe-volume pathway | `claim:coagulation-reduces-blood-loss`; `claim:care-direct-pressure-bleeding`; `claim:candidate-physiology-v3-blood-volume-perfusion-compensation`; `claim:candidate-physiology-v3-low-brain-perfusion-awareness` | **Partial.** Volume loss → lower pressure/perfusion and possible compensation/dizziness is covered. General acute circulatory shock is not stated; proposal HP-02. |
| Syncope / transient LOC | `claim:candidate-physiology-v3-low-brain-perfusion-awareness`; `claim:candidate-physiology-v3-oxygen-delivery-brain-function` | **Partial.** Existing first claim expressly stops before LOC; second does not connect cerebral hypoperfusion to syncope. Proposal HP-01 only names that relation; it does not identify any event as syncope. |
| Cough, sneeze, blink, gag, vomiting, swallowing, withdrawal, startle, vestibular/postural correction | `claim:candidate-physiology-v3-cough-reflex-airway-irritation`; `claim:candidate-physiology-v3-sneeze-reflex-nasal-irritation`; `claim:candidate-physiology-v3-blink-corneal-protection`; `claim:candidate-physiology-v3-gag-reflex-pharyngeal-stimulation`; `claim:candidate-physiology-v3-emesis-reflex-response`; `claim:candidate-physiology-v3-swallowing-airway-protection`; `claim:candidate-physiology-v3-protective-withdrawal`; `claim:candidate-physiology-v3-startle-reflex-strong-sudden-stimulus`; `claim:candidate-physiology-v3-vestibular-postural-correction` | **Closed bounded** for named reflex relations. No forced movement, clearance, protected airway, fall, diagnosis or actor state follows. |
| Pupil response | `claim:candidate-physiology-v3-blink-corneal-protection` is corneal/bright-light blink only. | **Missing.** Pupillary light response is distinct autonomic relation; proposal HP-03. |
| Orienting / attention to novelty | `claim:foundations-ms-02-attention-novelty`; `claim:candidate-physiology-v3-startle-reflex-strong-sudden-stimulus`; `claim:candidate-physiology-v3-threat-autonomic-arousal` | **Partial.** These cover selective attention, startle and arousal, not involuntary orienting response itself. Proposal HP-06; no concrete noticing, gaze, movement, choice or perception. |
| Shivering / sweating / heat balance | `claim:candidate-physiology-v3-shivering-thermogenesis`; `claim:sweat-evaporation-reduces-surface-heat`; `claim:continued-sweating-can-cause-body-water-loss`; `claim:human-thermoregulation-depends-on-heat-exchange`; `claim:exercise-heat-dissipation`; `claim:foundations-life-42-thermoreceptors` | **Partial.** Mechanisms exist, but severe heat stress and non-immersion cold stress are not stated. Proposals HP-04–05; no heat/cold illness diagnosis. |
| Cold-water immersion | `claim:research-cold-water-immersion-can-cause-immersion-hypothermia` | **Closed bounded** for cold-water immersion only; it must not be stretched to all cold-air/wet/cold-work exposure. |
| Intoxication | `claim:candidate-physiology-v3-alcohol-intoxication-impairment` | **Closed bounded** for alcohol’s conditional coordination/decision/consciousness impairment. Not a general toxin or dose rule. |
| Injury / pain / inflammation / wound healing / infection | `claim:pain-nociception-distinct`; `claim:tissue-injury-can-cause-inflammatory-repair-response`; `claim:wound-healing-time-dependent`; `claim:intact-skin-reduces-pathogen-entry`; `claim:foundations-life-43-infection-chain`; `claim:foundations-life-44-pathogen-transport`; `claim:foundations-life-45-infection-entry` | **Closed bounded.** No wound contamination, infection, severity, recovery or actor knowledge is inferred. |
| Hunger, digestion, energy, fatigue, sleep, hydration | `claim:food-energy-nutrients`; `claim:foundations-life-10-digestion`; `claim:foundations-life-11-absorption`; `claim:aerobic-muscle-atp-regeneration-depends-on-oxygen`; `claim:reduced-atp-reserves-can-cause-muscle-fatigue`; `claim:work-intensity-duration`; `claim:acute-sleep-loss-performance`; `claim:activity-fluid-balance`; `claim:candidate-physiology-v3-dehydration-functional-risk` | **Closed bounded.** No meal, thirst, sleep history, numeric exertion limit, individual endurance or outcome. |

## Scoped candidate proposals

### HP-01 — cerebral hypoperfusion and syncope

- **RU:** «Кратковременное глобальное снижение перфузии мозга может вызвать обморок — преходящую потерю сознания.»
- **EN:** “Transient global cerebral hypoperfusion can cause syncope, a transient loss of consciousness.”
- **Anchor:** Bassetti, *Transient loss of consciousness and syncope*, *Handbook of Clinical Neurology* (2014), abstract: syncope is sudden brief TLOC with postural failure due to global cerebral hypoperfusion. [PubMed](https://pubmed.ncbi.nlm.nih.gov/24365296/)
- **Limit:** no particular cause, diagnosis, duration, fall, recovery, recurrence or actor state.

### HP-02 — acute circulatory shock and inadequate tissue perfusion

- **RU:** «Острая недостаточность кровообращения может приводить к недостаточной перфузии тканей и клеточной дисфункции.»
- **EN:** “Acute circulatory failure can result in inadequate tissue perfusion and cellular dysfunction.”
- **Anchor:** *Consensus on circulatory shock and hemodynamic monitoring*, European Society of Intensive Care Medicine task force, **Definition**. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4239778/)
- **Limit:** no diagnosis, shock type/cause, blood pressure, symptom, organ outcome, severity or treatment.

### HP-03 — pupillary light response

- **RU:** «Яркий свет, попадающий на сетчатку, может вызывать парасимпатическое сужение зрачков.»
- **EN:** “Bright light reaching the retina can elicit parasympathetic constriction of the pupils.”
- **Anchor:** OpenStax, *Anatomy and Physiology 2e*, **15.3 Central Control**, “Pupillary Reflex Pathways”. [OpenStax](https://openstax.org/books/anatomy-and-physiology-2e/pages/15-3-central-control)
- **Limit:** no actual light, visual function, eye condition, pupil measurement, perception or actor state.

### HP-04 — extreme heat and heat stress

- **RU:** «Воздействие сильной жары или работы в горячей среде может приводить к тепловому стрессу — увеличению накопления тепла в теле.»
- **EN:** “Exposure to extreme heat or work in a hot environment can lead to heat stress, increased heat storage in the body.”
- **Anchor:** CDC/NIOSH, *Heat Stress and Workers*, **Key Points** and **Overview**. [CDC](https://www.cdc.gov/niosh/heat-stress/about/index.html)
- **Limit:** no temperature, work, clothing, hydration, illness, injury, diagnosis, impairment or outcome.

### HP-05 — cold environment and cold stress

- **RU:** «Воздействие сильного холода или холодной среды может вызывать холодовой стресс; при понижении температуры тепло может быстро покидать тело.»
- **EN:** “Exposure to extreme cold or a cold environment can cause cold stress; when temperatures drop below normal, heat can rapidly leave the body.”
- **Anchor:** CDC/NIOSH, *Cold and Work: Types, Causes, Preparation*, **Key Points** and **Overview**. [CDC](https://www.cdc.gov/niosh/cold-stress/about/index.html)
- **Limit:** no temperature, duration, clothing, body temperature, hypothermia diagnosis, frostbite, impairment, survival or treatment.

### HP-06 — orienting response to novelty

- **RU:** «Новый или неожиданный стимул может вызывать ориентировочную реакцию с направлением сенсорного внимания на этот стимул; она может ослабевать при повторении.»
- **EN:** “A novel or unexpected stimulus can elicit an orienting response that directs sensory attention toward it; the response can habituate with repetition.”
- **Anchor:** Bradley, *Natural selective attention: Orienting and emotion*, **Novelty and Significance — Stimulus Novelty**. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3645482/)
- **Limit:** no actual notice, direction of gaze/body, recognition, emotion, threat, decision, action or perception of a concrete actor.

All six claims are included in the active descriptor with
`verification-static-human-physiology-v1.json`. Their six static retrieval
probes cover syncope, circulatory tissue supply, pupil response, heat storage,
cold stress and orienting/habituation. Additional `phys_*` probes in
`benchmarks/gameplay-coverage-v3.json` exercise the existing respiratory,
protective-reflex, blood-volume, hydration, alcohol and sweating premises from
plan §37. They test retrieval of conditional facts, not clinical outcomes or
live gameplay. Shivering and vestibular correction retain their existing
`cold_body_response_ru` and `boat_turn_balance_en` probes.
