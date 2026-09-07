# Foundations readiness — integrated factual-need review

Scope: the local persisted production-profile runtime is the current
873-claim compilation; this is not a claim of deployment or merge.
This review asks whether the declared basic causal gameplay envelopes have
qualified universal premises. It does not require an encyclopedia, a numerical
prediction, a scene fact, current weather, actor/NPC state, diagnosis, or a
code-owned outcome.

| Cell | Verdict | Basis and limits |
| --- | --- | --- |
| `wk:science:mechanics` | COVERED_WITH_LIMITS | Drag, impulse, interaction forces, resistance/flow, pressure outflow, surface tension, conservation, equilibrium, support and levers cover force/momentum/flow/static-support reasoning. Exact trajectory, load and damage remain out of scope. |
| `wk:science:heat` | COVERED_WITH_LIMITS | Heat-flow direction, convection, vaporization demand, expansion, reaction-rate conditions and fuel/oxidizer/oxygen constraints support heat/cooling/drying/burning reasoning. No particular ignition, temperature or rate follows. |
| `wk:science:chemistry` | COVERED_WITH_LIMITS | Reaction/transport/equilibrium, electrolyte and corrosion relations, neutralization, solvation, saturation and precipitation, plus HAZ exposure modifiers and routes, cover the stated reaction/solution/corrosion/exposure envelope. They neither identify a substance nor diagnose harm. |
| `wk:science:materials` | COVERED_WITH_LIMITS | Wood, stone, glass, bone, horn and antler premises cover declared structure, directional response, damage and ordinary working. They do not identify an arbitrary material's strength, tool, safe load or finished object. |
| `wk:science:waves` | COVERED_WITH_LIMITS | Sound source/medium/reflection/absorption, refraction/transmission and elementary electrical relations cover sound/light/electrical reasoning. No scene audibility, visibility or electrical outcome follows. |
| `wk:science:physiology` | COVERED_WITH_LIMITS | Cell/metabolism, digestion/absorption, respiration/circulation, regulation/movement/sensation, development, protective-system and exposure-not-illness premises cover body-function reasoning. They do not diagnose a person or produce a bodily result. |
| `wk:science:infection` | COVERED_WITH_LIMITS | Infection-chain, possible transport-mode and possible-entry relations support conditional infection reasoning without inferring a scene infection. |
| `wk:science:ecology` | COVERED_WITH_LIMITS | Tolerance, competition, mutualism, consumer allocation, trophic/energy and cycling/photosynthesis premises cover resource/food-web/environment relations. They do not establish a species, local food web, population or harvest. |
| `wk:science:geology` | COVERED_WITH_LIMITS | Soil phases/water, rock formation/weathering, hardness, groundwater flow/balance, infiltration/runoff, and slope-force/water-trigger relations cover soil/rock/groundwater/weathering/stability reasoning. They do not create a local aquifer, ore, soil layer or usable water source. |
| `wk:science:weather` | COVERED_WITH_LIMITS | Water-cycle/runoff, fog/rime, pressure-driven wind, cloud condensation/rain, cloud radiation and ice-jam relations cover water/wind/cloud/fog/ice reasoning. They do not forecast or assert present weather. |
| `wk:science:psychology` | COVERED_WITH_LIMITS | Attention, perception, memory, skill learning, attribution, individual variation, qualified acute-stress, reappraisal, expression/experience and uncertainty premises cover the declared general behavior envelope. They do not establish an actor's emotion, belief, intent or choice. |
| `wk:science:social` | COVERED_WITH_LIMITS | Group pressure/persuasion, affiliation, helping, conflict, roles and norms cover influence/affiliation/cooperation/conflict reasoning. They do not establish a current relationship, consent, norm, duty, authority, reputation or social outcome. |

## Decision

All twelve declared scientific families are **COVERED_WITH_LIMITS** in the
current 873-claim runtime. This is a functional readiness judgment for basic
causal gameplay, not a claim of exhaustive science. The 23 foundations probes
are useful retrieval/grounding evidence; lack of a probe for a cell is not by
itself a source gap.

## Legacy P2 materials reassessment

| Existing cell | Verdict | Exact basis and limits |
| --- | --- | --- |
| `wk:material:bone-horn` | COVERED_WITH_LIMITS | Existing bone/horn structure and response premises, historical material-class context, and `claim:foundations-physical-material3-01-antler-osseous-not-horn` distinguish antler as osseous rather than keratin horn. This supports material-class reasoning, not a scene item's identity, strength or availability. |
| `wk:process:bone-horn` | COVERED_WITH_LIMITS | `claim:foundations-physical-material3-03-antler-water-workability` is explicitly an experiment on naturally shed red-deer antler with exposed cancellous bone; `claim:foundations-physical-material3-04-osseous-shaping-operations` records distinct operations in a replica-bronze-knife experiment on bone and red-deer antler. Together they close the declared open-class working relation, while preserving their material, tool and experimental conditions. They are not a universal recipe or guarantee for a particular blank. |
| `wk:material:lime-glass` | COVERED_WITH_LIMITS | Existing lime transformation plus universal glass thermal-fracture, scattering and transmission premises cover basic causal use/response. Medieval glass production or local mineral procurement remains a separate historical-availability question. |

## Original-audit axis check

The broader foundations audit identified three useful basic relations beyond
the first twelve labels. They are now present in the runtime:

| Axis | Verdict | Current bounded basis |
| --- | --- | --- |
| Chemical hazard and exposure | COVERED_WITH_LIMITS | HAZ01/03 provide route, concentration, duration/frequency and individual-modifier premises; HAZ02 preserves that exposure does not itself establish illness. |
| Wet soil and slope stability | COVERED_WITH_LIMITS | HAZ04 supplies the force-versus-strength relation; HAZ05 limits water-trigger reasoning to a slope already close to loss of stability. |
| Psychology — regulation/uncertainty | COVERED_WITH_LIMITS | MS4 supplies experimentally bounded reappraisal, expression-versus-subjective-experience, and uncertainty/cognitive-control premises; none establishes an unknown actor state or outcome. |

No remaining factual research need is identified for the declared basic
foundations envelopes or the three legacy material cells. This does not close
historical availability, local presence, precise mechanics, clinical judgment,
or any other code-owned/state-owned question.

## Contract and planner-boundary review

The current foundation/profile binding is contract-compatible. New scientific
claims are universal literal `supported_fact` with `domain_internal_only`.
The existing environment predicate's `either` applicability signature keeps
historical contextual facts and universal science distinct; the separate
scientific environment profile does not alter historical applicability.
`psychology_behavior` and `social_behavior` are limited to semantic
resolution, materialization support and source-grounded QA—not NPC decision,
conversation or narration. The data therefore add conditional premises, not
state, motives, knowledge, consent, relationships, duties, exact mechanics or
gameplay authority.

`createProductionWorldKnowledgeGrounder` now canonicalizes
`allowed_domains` as a sorted set of active profile domains. This removes the
duplicate `environment` value introduced by the historical and scientific
profiles, without expanding or filtering the allowed domain set and without
changing validation, profile applicability, claim admission, repair count, or
planner schema. The focused server regression asserts the planner request
equals the sorted unique active-domain set. Verdict: **PASS**.

## Formal contract audit finding

```text
CONTRACT AUDIT FINDING

scope:
  Current 873-claim foundation runtime, its production profiles/domains, and
  planner-request allowed_domains canonicalization.
source_set:
  AGENTS.md §§2, 6–7, 10, 25.1; CONTRACT_INDEX.md §8; active World Knowledge
  platform implementation contract §§15–16, 35, 68–70; @rus/world-knowledge
  MODULE.md; production-v1 authoring/foundation/runtime bindings; grounder and
  focused server test.
source_statuses:
  AGENTS.md — governing; CONTRACT_INDEX.md — active contract index; World
  Knowledge platform contract — active; MODULE.md — active module contract;
  production-v1 authoring/foundation/runtime — active production binding;
  research/verification records — source-review inputs, not governing norms.
observed_implementation:
  The runtime has 873 claims, 664 concepts, 259 sources, 543 evidence records
  and 12 production profiles. Universal science facts use literal
  supported_fact/domain_internal_only. Psychology, social behavior, and the
  scientific environment profile are production-bound only for semantic
  resolution, materialization support, and source-grounded QA. The grounder
  sends a sorted unique set of active profile domains.
required_by_active_contract:
  Keep factual premises distinct from state/mechanics authority; preserve
  applicability and profile-purpose boundaries; expose only bounded,
  deterministic planner input; do not create an NPC-facing knowledge path from
  scientific claims.
target_if_any:
  The requested scientific-foundations extension is implemented in this local
  candidate; deployed/merged behavior is not asserted.
conflict:
  None found. Two environment profiles previously made a duplicate request
  value; set canonicalization removes that representation defect without
  changing authority or admission.
precedence_resolution:
  Active governing contracts and production bindings prevail; verification
  records support data quality only.
first_bad_boundary:
  None.
correct_owner:
  createProductionWorldKnowledgeGrounder owns planner-request construction;
  production-v1 foundation/profile bindings own claim and profile scope.
required_code_delta:
  Implemented: sorted Set canonicalization of allowed_domains only.
required_docs_delta:
  None beyond this current readiness finding.
required_tests:
  Focused server assertion for the exact sorted unique active-domain set;
  The first 115 profile tests and 133 retrieval cases passed. Independent
  review of the first 23-case/69-run pipeline found one unsupported directional
  drag inference. Two existing physics premises were then sharpened from
  independently checked textbook sections (projected-area drag conditions and
  average net force). Final 115 profile tests, 133 retrieval cases,
  deterministic compile and exact embedding comparison pass. After provider
  recovery, foundations-pipeline-v1-complete-report.json completed all 69 runs,
  with 23/23 hybrid automatic PASS. Independent fresh prose review of all 23
  final hybrid answers found P0=0/P1=0 (verification-foundations-life-library.md,
  complete-rerun section). Prior incomplete attempts and the first prose
  finding remain historical evidence, not substitutes for this complete run.
severity: P3
verdict: PASS
```
