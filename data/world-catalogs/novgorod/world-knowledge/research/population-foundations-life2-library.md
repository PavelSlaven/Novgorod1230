# LIFE2: causal health axes — library research candidates

**Status:** research only; not self-approved and not production. These
relations establish no diagnosis, treatment, present infection, exposure,
immunity, actor knowledge, or outcome. Exact body state, time and mechanics
remain code-owned.

## Directly read local sources

- Коротяев, Бабичев, _Медицинская микробиология, иммунология и вирусология_,
  `/srv/library/f.fb2-471134-473832.zip!473402.fb2`: гл. 25, 29, 31, 43, 46.
- Федюкович, _Анатомия и физиология человека_,
  `/srv/library/f.fb2-425051-428054.zip!426945.fb2`: «Физиология сна» and
  «Организм как единое целое».
- Солодков, Сологуб, _Физиология человека_,
  `/srv/library/f.fb2-473833-476870.zip!475091.fb2`: 2.4 «Гомеостаз», 14.4
  «Регуляция теплообмена».

## Atomic candidates for independent review

| ID | Candidate RU / EN | Evidence | Boundary |
| --- | --- | --- | --- |
| LIFE2-01 | **Инфекционный процесс требует взаимодействия возбудителя и восприимчивого хозяина. / An infectious process requires interaction between an agent and a susceptible host.** | Коротяев/Бабичев, гл. 25, opening protective-response discussion. | No claim of exposure, infection, diagnosis, or transmission route. |
| LIFE2-02 | **Попадание антигена может вызывать специфический приобретённый иммунный ответ. / Entry of an antigen can elicit a specific acquired immune response.** | Коротяев/Бабичев, гл. 29, opening paragraphs. | No claim that any person is immune or protected. |
| LIFE2-03 | **Защитная реакция организма включает несколько клеточных и тканевых участников, а не один универсальный исход. / Protective response involves multiple cellular and tissue participants rather than one universal outcome.** | Коротяев/Бабичев, гл. 25 and 29. | No deterministic clearance/failure model. |
| LIFE2-04 | **Вирусное размножение происходит внутриклеточно, поэтому наличие вирусной частицы вне клетки само по себе не описывает полный цикл размножения. / Viral replication is intracellular, so a virus particle outside a cell does not itself describe a complete replication cycle.** | Коротяев/Бабичев, гл. 46, opening paragraph. | No transmission or disease inference. |
| LIFE2-05 | **Гомеостаз является динамическим равновесием внутренней среды, поддерживаемым регуляторными функциями. / Homeostasis is a dynamic equilibrium of the internal environment maintained by regulatory functions.** | Солодков/Сологуб, 2.4, opening paragraphs. | Existing runtime may already own adjacent homeostasis; duplicate check required. |
| LIFE2-06 | **Терморецепторы воспринимают изменения температуры во внешней и внутренней среде и участвуют в регуляции теплообмена. / Thermoreceptors detect temperature changes in external and internal environments and participate in thermoregulation.** | Солодков/Сологуб, 14.4, opening paragraphs. | No temperature threshold, diagnosis, tolerance, or body-state mutation. |
| LIFE2-07 | **Смена освещения и внешние раздражители влияют на становление суточного ритма сна и бодрствования. / Changes in light and external stimuli influence the formation of the sleep–wake daily rhythm.** | Федюкович, «Физиология сна», opening paragraph. | Existing runtime may already own this adjacent relation; duplicate check required. |
| LIFE2-08 | **Антитела взаимодействуют специфически с антигеном, вызвавшим их образование. / Antibodies interact specifically with the antigen that induced their formation.** | Коротяев/Бабичев, гл. 31, opening paragraph. | Existing runtime may already own it; no testing, diagnosis, or treatment. |

## Gaps retained

The reopened textbooks do not by themselves support safe, general gameplay
claims for route-specific transmission, infectious dose, exposure duration, or
individual risk variation. Those require separately sourced epidemiology or
public-health primary guidance before they can become candidates.

## Appendix: LIFE3 — transmission and exposure conditions

**Status:** research only; separately sourced from current official CDC/NIOSH
guidance after the library text proved insufficient for route and exposure
conditions.  These are causal preconditions and modifiers, not a diagnostic,
an assertion that an exposure happened, a prediction of infection, or treatment
advice.  They must remain `domain_internal_only` if normalized.

### Sources independently opened

- **LIFE3-S1 — CDC/NIOSH, “Chain of Infection Components”** (last reviewed
  2022), [full page](https://www.cdc.gov/niosh/learning/safetyculturehc/module-2/3.html),
  sections “Modes of Transport”, “Portal of Entry”, and “Susceptible Host”.
- **LIFE3-S2 — CDC, “C. Air: Guidelines for Environmental Infection Control
  in Health-Care Facilities”** (content 2003; web page dated 2023), [full
  page](https://www.cdc.gov/infection-control/hcp/environmental-control/air.html),
  “Modes of Transmission of Airborne Diseases” and Table 3.

| ID | Candidate RU / EN | Exact evidence and applicability | Limits / proposed stable ref |
| --- | --- | --- | --- |
| LIFE3-01 | **Цепь передачи возбудителя включает источник/резервуар, выход из него, путь переноса, вход в хозяина и восприимчивого хозяина. / A pathogen transmission chain includes a source or reservoir, exit, transport route, host entry, and a susceptible host.** | LIFE3-S1 explicitly enumerates the chain components and their functions. General infectious-disease model. | A model of necessary links, not evidence that any link exists in a scene or that transmission succeeded. `wk:biology_physiology:infection-transmission-chain` |
| LIFE3-02 | **Пути переноса могут быть прямыми или непрямыми; CDC lists contact, droplets and bites among direct modes, and contaminated objects, vectors, food and water among indirect modes. / Transport routes can be direct or indirect; CDC lists contact, droplets and bites as direct modes, and contaminated objects, vectors, food and water as indirect modes.** | LIFE3-S1, “Modes of Transport”. General category relation. | The list is not an assertion that an object, food, water, or vector is contaminated, nor a route-specific disease rule. `wk:biology_physiology:infection-transmission-modes` |
| LIFE3-03 | **Порталом входа могут быть естественные отверстия или нарушение кожного барьера. / A portal of entry can be a body opening or a break in the skin barrier.** | LIFE3-S1, “Portal of Entry”: examples include mouth, eyes, respiratory tract, incisions and wounds. | It describes possible entry paths, not exposure, infection, wound severity, or a requirement that every opening transmits infection. `wk:biology_physiology:infection-portal-entry` |
| LIFE3-04 | **Для воздушной передачи туберкулёза CDC names airborne droplet-nuclei concentration and exposure duration as factors affecting severity and outcomes. / For airborne tuberculosis, CDC names airborne droplet-nuclei concentration and exposure duration as factors affecting severity and outcomes.** | LIFE3-S2, Table 3 “Factors affecting severity and outcomes”. | Explicitly limited to the table’s tuberculosis context; it is not a universal dose-duration equation and carries no numerical threshold or individual prediction. `wk:biology_physiology:airborne-exposure-conditions` |
| LIFE3-05 | **Восприимчивость хозяина зависит от нескольких факторов; CDC lists age, health, comorbidities, immune system, nutrition, infective dose and medications. / Host susceptibility has multiple contributing factors; CDC lists age, health, comorbidities, immune system, nutrition, infective dose, and medications.** | LIFE3-S1, “Susceptible Host”. | A qualitative multi-factor framework only.  It cannot infer any named actor’s susceptibility, immune status, medication, or outcome. `wk:biology_physiology:infection-host-susceptibility` |

### Deliberate exclusions

No treatment, prophylaxis, dose, duration threshold, disease diagnosis, or
person-specific risk claim is proposed.  LIFE3-S2’s facility-specific infection
control and disease examples are evidence for narrowly worded mechanisms, not
rules for a historical scene.
