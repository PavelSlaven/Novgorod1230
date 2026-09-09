# PR92 Grounding / Open-world / Materialization / Persistence / NPC-mind audit

> Historical runtime/prose audit. Its PASS labels apply only to the explicit
> snapshots and probes below, not to current data completeness or PR merge
> readiness. The September 4 review requires per-claim approval binding,
> independent category cartography and green exact-HEAD CI. Existing
> preflight/grounding integration is not proof that all location category
> families are populated.

**Current verdict: PASS_WITH_P2_LIMITS.** Full33/current516 (session 36262)
passes its automated hybrid gate. Independent current prose review resolves
the prior architecture/bort P1s and finds no current P1. Remaining uncited-use
and verbosity observations are P2 limits, not factual-grounding blockers.
These findings were not part of original runtime-audit scope.

**Historical runtime-audit verdict: PASS.** At time of the checks recorded in
this document, P0/P1 were not found in player/NPC/materialization/persistence
scope; G-01 and G-02 were closed or dismissed after contract review.

## Standard and checked runtime

- Сверены [implementation plan](C:/Users/Slaven/Downloads/World_Knowledge_Platform_PR92_IMPLEMENTATION_PLAN.md#L1226)
  §14.2--14.3 и [implementation contract](C:/Users/Slaven/Downloads/World_Knowledge_Platform_implementation_contract_PR92.md#L1863)
  §53--54: planner не назначает time/place/identity/state; orchestrator
  добавляет authoritative context после planning.
- Inspected active production composition: scenario bundle supplies the pinned
  calendar profile to W/K ([composition](../../../../../apps/game-server/src/composition/production-spatial-v3.js#L83)); release becomes active only after exact committed activation readback
  ([activation owner](../../../../../apps/game-server/src/composition/production-v2-activation-state.js#L3)).
- Tests run: 64 focused W/K, S1, N1 and ordinary-materialization tests; all
  passed. `git diff --no-index --check` passed for this audit file.

## Resolved blockers

| ID | Previous result | Current verdict | Evidence |
| --- | --- | --- | --- |
| G-01 | P1: static `1230` / regional context | **RESOLVED** | Grounder now derives year from the current safe clock through the pinned `projectCalendar`, and merges safe position plus explicit owner-supplied refs ([context projection](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L219)). S1 supplies its current safe clock and exact target/envelope place refs ([S1](../../../../../apps/game-server/src/runtime/releases/lower-dvina-trace-s1-production.js#L63)); N1 supplies its visible safe clock and materialized NPC location ([N1](../../../../../apps/game-server/src/runtime/releases/lower-dvina-trace-n1-production.js#L76)). Focused regression test proves year `1231`, current G5/location refs and exclusion of hostile actor data. |
| G-02 | P1: required plan factual-premise validator | **NOT A DEFECT** | Exact contract does **not** require `factual_premise_refs` in public semantic plans. Strict semantic DTOs prohibit authoritative facts/state; existing domain owners revalidate and commit exact mechanics/state. Grounder traces `request_identity`, planner use and selected slice claim refs ([diagnostics](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L109)), while same bounded applicable slice is injected into the semantic call ([grounder](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L77)). Prompt closure is composition rule, not replacement for owner validation. A content validator here would require a second semantic judge or closed factual whitelist, neither prescribed by contract and both contrary to the open-world boundary. |

## Passed controls

| Area | PASS evidence |
| --- | --- |
| Player free turn / single semantic path | Player model grounds its existing request, then invokes existing `turn_step` model; grounder returns factual context, never a game plan ([phase-2](../../../../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-llm.js#L37)). No parallel planner/resolver found. |
| Authoritative context and safe facets | `authoritativeContextOf()` derives time/place from safe request and explicit owner projection; `actorFacetsOf()` no longer falls back to `request.actor` ([grounder](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L205)). |
| Retrieval resilience and trace | Vector/encoder failure yields structured lexical resolution, not an invented fact or runtime outage ([grounder](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L87)). Diagnostics link request identity, planner use and selected applicable claim refs. Regression test passed. |
| Authority envelope / desire is not evidence | S1 explicitly says actor wording is not evidence and forbids identity, people, ownership, routes, topology, mechanics and hidden/authoritative facts ([S1 DTO boundary](../../../../../packages/turn/src/spatial-semantic-remainder.js#L33)). W/K closure says compatibility is never present committed state ([closure](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L130)). |
| S1 materialization and persistence | Resolver gives W/K only a bounded semantic descriptor request; materializer writes via existing atomic owner. Committed local resolution is replayed before model call ([S1](../../../../../apps/game-server/src/runtime/releases/lower-dvina-trace-s1-production.js#L42)). Tests passed for safe projection, ambiguity rejection, replay and local movement without rematerialization. |
| N1 mind boundary | N1 only applies to one visible, already materialized background NPC with schedule/profile evidence; committed remainder replays before model ([N1](../../../../../apps/game-server/src/runtime/releases/lower-dvina-trace-n1-production.js#L28)). It supplies bounded observable context plus safe clock/location to W/K. Tests passed for no invented activity, proposal audit and same factual slice to proposal/audit. |
| Ordinary materialization | `preflight()` returns `already_resolved` for known candidate ([presence owner](../../../../../packages/turn/src/ordinary-materialization-presence.js#L48)); focused tests passed for no reroll, causal basis/placement/mechanics bounds and rejection of hidden/historical/significant truth. General compatibility remains distinct from presence. |
| NPC conversation/autonomous decisions | Production bindings route W/K to NPC semantic/autonomous paths. Their semantic prompts limit W/K to factual context; operation construction, exact checks, consequences and commits remain existing code owners. No hidden-state bypass found in inspected safe projections. |
| Open-world / unseen case | Inspected S1, N1 and ordinary owners accept bounded generic semantic remainder rather than a name/action whitelist. No special production branch for a named occupation/object was found. Existing envelope and owner constraints, not a closed action list, govern admissibility. |

## Non-blocking limits

| ID | Severity | Limit |
| --- | --- | --- |
| G-03 | P2 | Production grounder currently uses planner for every active covered-purpose lookup ([grounder](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L27)); it has not yet selected `NONE` / exact-direct fast paths exposed by `@rus/turn`. This is cost/contract-completeness follow-up, not grounding or authority failure. |
| G-04 | P3 | N1 proves safe semantic remainder for an existing NPC, not broader NPC creation. That is an intentional current scope boundary, not fabricated presence. |

## Pipeline grounding residuals

Latest inspected internal pipeline report uses the 414-claim compiled corpus
and 14 hybrid cases, including the two water probes. This is a prose-grounding
audit, not a general PASS claim or a replacement for the production gate.

| ID | Severity | Finding | Required next action |
| --- | --- | --- | --- |
| G-05 | RESOLVED | Fresh report cites `claim:population-material-wood-shrinkage`, which directly states bound-water gain swelling and directional magnitude, plus the conditional end-grain uptake claim. Its explanation keeps object-specific moisture/dimensions/damage unresolved. | The old `claim:wood-anisotropy-moisture` is no longer sole relevant evidence: direct swelling claim is a genuine alternative. `коробление` is bounded inference from directional dimensional change, not a current-object damage assertion. |
| G-06 | P2 CURRENT | In the 420-claim rerun, Article 29 is no longer selected. Article 50 is stated with its actual conditions and only denies a *general* self-seizure right, so it does not fabricate a current actor procedure. It is nevertheless irrelevant recitation of a conditional historical rule whose trigger is absent. | Keep the uncertainty/no-present-right conclusion from debt-accounting facts; planner/retrieval relevance must avoid carrying adjacent conditional law into a current debt question. This is now a relevance/instruction breach, not the earlier P1 procedural fabrication. |
| G-07 | P1 REGRESSION | `smith_tools_en` again cites only three tool claims and omits available `claim:occupation-smith-iron-input`, although the question independently asks for material and tools. The unchanged expected evidence group correctly fails. A corrected one-shot A/B used the recorded 420 planner query with matching current-425 Core/vector artifacts: its projected six facts and actual order match the report's available refs, and both actual-order and iron-first payloads cite iron plus all tools. `semanticMessages()` contains no planner focus. This is not a 60391 reconstruction because that artifact snapshot is unavailable. | Do not weaken the group. Order and direct planner-focus leakage do not reproduce the omission under current-425 artifacts; one A/B does not prove a generic production delta. Retain the gate as the observable detector rather than add a prompt/owner change from this result. |
| G-08 | P1 GATE | `craft_smithy_assumption_en` is clean of forge/kit invention, but cites hammer/anvil/workshop compatibility claims rather than either declared direct premise. Those claims do not establish that the visible hammer and iron fragment are insufficient evidence of a current working smithy. | Do not add them as relevant alternatives. `claim:occupation-smith-iron-input` is available and directly says the described input does not establish a current working smith; establish why semantic output omits it. |
| G-09 | P2 | The damp-iron answer says a knife under rain “covers with rust,” whereas cited claims say it *may* rust and that corrosion is usually accelerated by water and oxygen. | Preserve the modal qualifier; no retrieval or oracle change is needed. |
| G-10 | RESOLVED IN 420 RERUN | The prior biology/leather answer-class mismatch is absent from the 420-claim, 14-case report. | Preserve accepted classes; this does not alter the independent G-07/G-08 evidence failures. |

`craft_smithy_assumption_en` no longer requires only
`claim:metalworking-broad-context`: `claim:occupation-smith-iron-input` is an
equivalent direct no-inference premise because it explicitly denies that the
described iron input establishes a working smith in the current scene. This
does not relax evidence requirement.

## Gate decision

Historical grounding/open-world/materialization/persistence/NPC-mind gate:
**PASS** for scope and checks recorded above. Code remains owner of committed
presence, mechanics, revalidation and atomic write state; W/K is bounded
factual compatibility context. Typicality and player/NPC desire do not become
evidence of pre-existing world state.

Current combined grounding status: **BLOCK / incomplete**. The previous
442-claim, 16-case hybrid production gate (run 58148) was **FAIL** on
`hemp_processing_materials_ru` (relevant and expected evidence),
`wet_hemp_cord_ru` (expected evidence), `biology_one_meal_ru` (relevant
evidence), and `smith_tools_en` (expected evidence). This supersedes, but does
not erase, the prior 30637 measurement: `wet_unknown_hide_ru` and the leather
case are now automated-pass; `craft_smithy_assumption_en` remains pass.
`architecture_single_find_function_ru` now cites its direct contextual premise
but still has P1 prose below. Automated acceptance is not prose approval.

## Pipeline grounding residuals — earlier compiled 442 / run 30637

| ID | Severity | Finding | Required next action |
| --- | --- | --- | --- |
| G-11 | P1 evidence coverage, not fabricated prose | `wet_unknown_hide_ru` correctly returns uncertainty and cites `claim:material-water-rawhide-wet-dry`. Its rawhide text itself supports the distinction from tanned leather. But the answer's reason that an unknown tanning/process prevents a confident prediction needs available `claim:material-water-leather-water-processing`; it is neither cited nor declared relevant. The expected group failure is real. | Keep both required premises. Run one bounded semantic slice experiment with the same question and the two direct premises to distinguish retrieval omission from citation/coverage omission before changing a general prompt. |
| G-12 | P1 | `architecture_single_find_function_ru` omits available direct `claim:contextual-evidence-classes`, which says one find does not determine building function. It instead cites church-only masonry comparison and invents that the same technique served other monumental buildings and that the fragment may have been transported. Neither assertion follows from supplied cited claims. The answer's conclusion is sound; its explanatory factual alternatives are not. | Do not add invented alternatives to oracle. Run one bounded matched-premise semantic slice with `contextual-evidence-classes` alone (or exact relevant slice) to establish retrieval/planner versus semantic-use cause; then fix that general boundary only. |
| G-13 | Oracle stale, not a gate weakening | `material_leather_personal_item_ru` cites `claim:population-leather-case`, whose direct/high localization explicitly attests leather purses in Novgorod and retains no-current-presence limit. This is stronger and more specific than broad `claim:novgorod-leather-items`; no unsupported ref or prose overclaim occurs. | Add the direct purse claim as an explicit relevant-evidence alternative to this non-acceptance benchmark case. This preserves factual-evidence requirement; it does not accept an unrelated leather claim. |
| G-14 | P2 modality | `bort_hook_household_inference_en` passes required refs and correctly denies proof of a household hive. “The hook is associated with … wild tree cavities, **not with domestic hives**” is too exclusive: supplied facts support tree-climbing/tree-based wild-bee context and non-proof of a domestic hive, not an exclusion of every domestic-hive association. | Preserve `does not establish a domestic hive`; remove/avoid the exclusive contrast on next generic insufficiency-prose review. No retrieval, oracle, or production fact change follows from this P2 finding. |

The latest run retains prior G-06 and G-09 as historical residuals unless a
new prose audit supersedes them; it does not reproduce the prior smithy/tool
evidence failures. No current-442 verdict has been inferred from old 420/414
measurements.

## Pipeline grounding residuals — current compiled 442 / run 58148

| ID | Severity | Finding | Required next action |
| --- | --- | --- | --- |
| G-15 | P1 evidence retrieval | `hemp_processing_materials_ru` exact-focus refs name hemp processing/tow, but planner selects `produces_form`, `attested_use`, and `historically_compatible`. In Core these predicates restrict candidates and exclude all three approved AFP `supported_fact` premises. The answer substitutes ship-caulk/cordage facts; no cited ref is unsupported, but required evidence is absent. | Apply only general planner predicate-filter clarification: predicates are restrictive, not topic keywords; leave them empty unless selected predicates unambiguously cover every independently needed premise. No Core ranking/filter change, call, schema, repair, or fixture branch. |
| G-16 | P1 evidence retrieval | `smith_tools_en` selects `requires_tool` and `requires_input`; Core consequently returns iron but excludes three exact-focus tool claims, whose predicate is `attested_use`. Answer correctly says tools are absent from supplied facts, exposing retrieval rather than semantic failure. A deterministic Core check restores all four expected claims only when this predicate filter is empty. | Same general planner clarification as G-15. It preserves attestation versus necessity: do not use a requirement/input/tool predicate to retrieve an attested example. Do not weaken tool evidence groups. |
| G-17 | P1 evidence coverage | `wet_hemp_cord_ru` cites swelling plus textile-load/contaminant facts, but omits required `claim:material-water-plant-fibre-cellulose`, while stating that hemp fibres are natural. The conclusion against irreversible damage remains appropriately conditional; no unsupported cited ref is present. | Keep both expected premises. Current report alone establishes a coverage failure, not a new prompt delta; reassess after general predicate fix/re-run. |
| G-18 | Oracle stale, not a factual pass by label alone | `biology_one_meal_ru` omits old `claim:food-energy-nutrients`, but directly cites `claim:reduced-atp-reserves-can-cause-muscle-fatigue` and `claim:work-intensity-duration`. Both are genuine factual alternatives for rejecting one exclusive cause after work. `activity-fluid-balance` is additional prose, not needed as a blanket oracle alternative. | Add only ATP-fatigue and work-intensity claims as explicit alternatives to this non-acceptance case's relevant evidence. Keep food-energy reference; do not treat arbitrary physiology claims as interchangeable. |
| G-12 | P1 remains | Planner now retrieves and cites `claim:contextual-evidence-classes`, so the no-inference conclusion is grounded. It still adds that masonry fragment could be a building material, a weight, or another item. Supplied claims do not establish those alternatives. | Preserve the direct sufficiency limit and remove hypothetical alternative identities in a later generic factual-closure/prose compliance check; no oracle expansion makes this P1 grounded. |

The proposed G-15/G-16 clarification is contract-compatible: query planner is
the owner of bounded domain/ref/predicate/hint selection; §§52, 55, 58 and 60
remain unchanged because the delta changes neither query schema nor Core's
deterministic rank/filter semantics. It is evidenced by the exact-focus,
no-vector Core reproductions, not a fixture-specific vocabulary rule.

### Predicate-policy controlled probe — compiled 442 / run 62570

After the failed full run 58148, a controlled four-case pipeline probe on the
same compiled-442 corpus measured **PASS** with the implemented semantic
planner policy `requested_predicates: []`. This is evidence that the general
predicate-filter correction reaches the affected retrieval path; it is not a
full production-gate run, a prose-grounding review, or a claim that the
combined gate has passed. The then-current full-gate result remains the
58148 **FAIL** recorded above until a completed successor report is audited.

## Verification record

### Source-faithful focus correction after the 414-claim A/B probe

An isolated real-model A/B run reproduced the debt error with the full slice
including Articles 29/50; the same request and instructions with only matching
debt premises returned uncertainty without a procedure. The planner previously
saw the misleadingly broad concepts `property-claim` and
`merchant-credit-journey`, although the source claims concern recognition of
lost/stolen property and loss of another's goods/funds during a trading journey.

With Contract Auditor approval, these unreleased concept identities and
RU/EN labels were narrowed to `lost-stolen-property-recognition` and
`merchant-journey-loss-of-third-party-goods-or-funds`. Generic property/credit
aliases were removed. Claim identities, text, evidence, applicability and
qualifiers remain unchanged; no procedural knowledge, schema, runtime filter
or owner was removed or added. A focused regression proves both procedures
remain retrievable under their actual conditions. Full planner/hybrid
revalidation is still required; this authoring correction alone is not PASS.

The evaluation-only answer-class instruction now separates the main question
type from explanatory prose: a yes/no answer remains yes/no even when it gives
reasons, while requested what/how/which parts must each be answered or marked
as an evidence gap. Expected classes and evidence groups are unchanged.

### G-08 shared-closure correction under evaluation

The Contract Auditor approved a shared rendering constraint for all existing
consumers: when facts only limit what can be established, do not invent or
list hypothetical missing components, conditions or evidence unless a
supplied claim explicitly asserts them. It imposes no new prose field on
strict materialization DTOs and changes no owner, schema, model-call count or
repair policy. The existing code-owned-context exception remains intact.
Conversation and evaluation composition checks failed before the change and
passed after it. With the rebuilt 414-claim bundle and matching vectors, the
latest 38 selected grounding, conversation, autonomous NPC, frozen-message,
ordinary-seed and evaluation tests pass. These tests prove instruction
delivery, not semantic compliance: the latest real report still exposes
G-06--G-09 as recorded above.

The same independent audit approved exactly two relevance-oracle alternatives:
`claim:population-material-wood-shrinkage` directly supports directional
moisture swelling; `claim:social-debt-records-accounting-amount` explicitly
does not establish present debt, parties or terms. Existing acceptance classes,
required multi-part evidence groups and unsupported-citation checks are
unchanged. This does not waive the separate prose-grounding gate.

Historical focused set: `node --test` 64 pass, 0 fail. Latest focused set:
38 pass, 0 fail. These are distinct runs. Included server W/K grounding,
`@rus/turn` grounding/core, W/K pack, S1/N1, spatial remainder and ordinary
presence/seed tests. `git diff --no-index --check -- /dev/null
data/world-catalogs/novgorod/world-knowledge/audits/final-grounding.md`:
passed.

### Current-442 controlled focus diagnostic

Four fresh semantic calls replayed the saved 442 planner queries through the
real Core, pinned encoder and flat index. Both original slices reproduced
their saved claim lists exactly. For masonry, changing only `focus_refs` to
the already-approved contextual-evidence concept supplied the missing premise
and produced a bounded answer citing it; the original focus still failed the
relevant-evidence gate and recited unrelated stone-weight context. This
isolates a planner selection defect, without claiming that one successful
semantic response proves reliability.

The wet-hide replay passed with the original focus but failed after focusing
the two required claims: both facts remained supplied, yet only rawhide was
cited. This is semantic evidence-use variability, not a demonstrated missing
retrieval fact or a fixed defect. Both expected premise groups remain required.

The independent Contract Auditor approved a general planner-only clarification:
evidential-inference questions need the evidence-to-conclusion relationship or
its limits, not attributes of the proposed conclusion; hints must not invent
alternative histories or causes. No example-specific ref, schema, rank,
model-call, repair or ownership change was made. The instruction-delivery
regression failed before the change; all 13 selected server/turn/evaluator
tests and `architecture:check` passed afterward. Real-pipeline and prose
verification remain separate gates; these tests alone do not close G-11/G-12.

## Prior compiled 451 / full run 69955

**Automated hybrid gate: FAIL.** All 17 answer classes are accepted and no
used claim ref is unsupported. The sole gate failure is
`wet_hemp_cord_ru`: `claim:material-water-plant-fibre-cellulose` is absent
from `available_claim_refs`, so its required group cannot be met. This is not
a semantic citation omission: the semantic response cannot cite a claim it
never received. The recorded plan has empty `requested_predicates`, but its
focus omits `wk:physics_material_science:plant-cellulosic-fibres`; the bounded
slice instead contains water-response and textile-damage claims. Thus the
smallest established cause is retrieval selection after planning, not the
semantic answer step. Whether focus selection or bounded ranking excludes that
eligible claim needs one deterministic Core replay before changing either.

### Independent prose review

| Cases | Verdict against used claim text |
| --- | --- |
| `grain_processing_waste_ru`, `hemp_processing_materials_ru`, `bort_hook_household_inference_en` | PASS. Answers retain the source probability/compatibility and do not turn historical equipment, products or practices into current household state. |
| `wet_hemp_cord_ru` | P1 gate coverage above. Its statement that hemp fibres are natural lacks the required plant-cellulosic premise. The added statement that water itself is not a contaminant is only an absence-based limit, not a supplied factual relation; do not count it as affirmative evidence. The conditional water-load effects and no-irreversibility conclusion otherwise retain supplied qualifiers. |
| `wet_unknown_hide_ru`, `architecture_single_find_function_ru` | PASS. The hide answer preserves the unknown-processing limit; the masonry answer uses only the direct one-find/contextual-evidence limit and no longer invents alternative building histories. |
| `biology_one_meal_ru`, `chemistry_damp_iron_ru` | PASS. ATP/work/sleep and iron-corrosion/coating statements match their cited limits; neither establishes actor-specific state or immediate damage. |
| `craft_smithy_assumption_en`, `environment_fishing_presence_ru`, `material_leather_personal_item_ru`, `npc_combined_resource_skills_ru`, `physics_wet_grain_ru`, `smith_tools_en` | PASS. The smithy and tools answers preserve historical attestation versus present-scene absence. Fishing, leather and NPC answers retain their scope limits. Wood answer confines itself to directional material response and declines a numeric property for the particular object. |
| `social_debt_seizure_ru` | P2 modality. “Долговая запись фиксирует обязательство” drops `claim:debt-needs-parties-and-basis`’s “может”; subsequent current-parties/basis and no-automatic-recovery limits are correct. Conditional court/authority records are correctly said not to prove an actor procedure. |
| `ship_joint_caulking_en` | **P1 cited-but-unsupported relation.** Tarred tow and iron-clamp claims support sealing plank gaps. The cited animal-glue claim supports glue between mechanically pegged planks and expressly does not guarantee an arbitrary wooden seam; pine resin is attested on boat surfaces. Neither supports saying animal glue or pine resin could *seal plank gaps*. This is semantic aggregation of adjacent boat-construction facts, not retrieval failure and not an oracle issue. |
| `shirt_materials_buttons_ru` | PASS. Linen/thin wool, gussets and one-or-more collar buttons, including bone/bronze examples, match cited qualified claims. |

Run 69955 therefore does **not** establish combined readiness even if the
single automated coverage failure is later fixed: the ship answer needs its
unsupported caulking relation removed or separately supported. No benchmark
weakening, new judge, repair call, or production filter follows from this
audit. The smallest factual correction is to preserve each supplied method's
attested relationship rather than promote an adjacent surface/joining example
to gap sealing.

### Shared relationship-binding closure — 458 revalidation

The Contract Auditor approved and the shared `wkClosure()` now states that a
supplied factual relationship remains bound to its subject, function, object
and context; it permits a new application composed from supplied causal
premises, but forbids relabelling an observed use as evidence for another
function merely because material or setting matches. If the connecting causal
premise is absent, the model must preserve that gap. This is a general
open-world composition rule, not an authored-result/recipe requirement and
not a named-reference restriction.

It is consumed unchanged by evaluation, conversation, autonomous-NPC and
ordinary-materialization callers. The focused instruction-delivery regression
was red before and green after the one-sentence delta. It changes no schema,
owner, Core filter/rank, call count or repair path. The completed 458 full
pipeline below confirms the earlier ship relation is no longer relabelled; it
does not close the separate masonry recurrence or the current **BLOCK**
verdict.

## Current compiled 458 / full run 32684

**Automated hybrid gate: PASS.** All 17 answer classes are accepted; all
required acceptance groups are cited; and no used claim ref is unsupported.
This measures the gate only. It is not a global readiness declaration and it
does not prove every sentence in `answer_text` follows from cited claims.

### Independent prose review

| Cases | Verdict against used and available claim text |
| --- | --- |
| `grain_processing_waste_ru`, `hemp_processing_materials_ru` | PASS. Both retain their historical/probabilistic scope and do not create current process, stock, tool or building state. |
| `bort_hook_household_inference_en` | P2 modality. The claims support tree-climbing equipment in a borts context and non-proof of a domestic hive; “not for domestic hives” overstates that non-proof as an exclusive function. |
| `wet_hemp_cord_ru` | PASS. The new direct hemp-cellulosic classification and natural-fibre swelling premise are both supplied and cited. Water-load and contaminant statements retain their conditional/time limits; no present wet damage or irreversibility is inferred. |
| `wet_unknown_hide_ru` | PASS. It preserves the unknown-processing distinction between rawhide and leather. |
| `architecture_single_find_function_ru` | **P1 recurrence.** `claim:contextual-evidence-classes` supports only the one-find/function limit. “Could be part of any stone building or building material” adds two factual hypotheses that no cited or available claim establishes. This is not a logical restatement of the limit. |
| `biology_one_meal_ru`, `environment_fishing_presence_ru`, `material_leather_personal_item_ru`, `npc_combined_resource_skills_ru`, `physics_wet_grain_ru`, `shirt_materials_buttons_ru`, `smith_tools_en` | PASS. Each answer preserves supplied causal, historical-compatibility or present-scene limits; physics gives no object-specific numeric result and tools remain attested rather than present. |
| `chemistry_damp_iron_ru` | P2 modal compression remains: its opening “ржавеет под дождём” is broader than the cited “может ржаветь,” although subsequent wording restores the conditional and no immediate loss follows. |
| `craft_smithy_assumption_en` | P2. Its no-current-smithy conclusion is grounded, but “other required equipment” is an unnecessary unsupported necessity category; cited tool attestations expressly are not a mandatory kit. |
| `social_debt_seizure_ru` | PASS. “Может фиксировать” restores claim modality; the final absence of an out-of-court procedure preserves a gap rather than inventing one. |
| `ship_joint_caulking_en` | PASS. The answer now keeps each observed join/caulking method in its cited function and omits prior animal-glue/pine-resin promotion to gap sealing. This validates the relationship-binding closure on this output only. |

The 458 automated PASS therefore cannot change the combined verdict from
**BLOCK**: the masonry P1 is an unsupported factual-hypothesis recurrence.
Do not weaken its oracle or add another prompt sentence from this one result.
The existing closure already prohibits expanding insufficient evidence; first
diagnose its semantic non-compliance. P2 modal/necessity wording remains a
separate prose-quality follow-up, not a factual-gate pass.

### Matched masonry slice diagnostic — current 458 artifacts

One controlled A/B is retained in
`.tmp-pr92-sources/masonry-slice-ab-probe-output.json`. It re-created the
saved 458 hybrid query with the matching current bundle/vectors and reproduced
its 12 available claim refs exactly. With the same question, shared closure,
role and temperature, the full slice again added unsupported masonry
classification/origin prose. A slice containing only the cited
`claim:contextual-evidence-classes` produced the bounded one-find answer and
cited only that premise.

This establishes that the model can answer correctly from the direct premise
and that extra retrieved context induces the unsupported elaboration. It does
not identify one causal claim among the 11 added facts, nor prove a
deterministic fix. The earlier 451 review recorded a clean direct-limit answer,
but its exact corpus/vector snapshot is not available for a byte-identical
comparison. The smallest next diagnostic, if needed, is one same-config call
with the direct premise plus only `construction-compared-church-masonry`; do
not add a further prompt rule, filter or full pipeline run from this pair.

That follow-up is retained in
`.tmp-pr92-sources/masonry-comparator-probe-output.json`. It used the saved
458 input with only the direct premise plus
`claim:construction-compared-church-masonry` and returned the clean one-find
limit. The church-masonry comparator alone is therefore not sufficient to
induce the P1. Semantic messages do not contain planner `focus_refs`, so focus
can affect prose only through the retrieved slice. Current evidence brackets
the cause to the remaining full-slice context (or output variability), not the
direct premise or this single comparator. No further prompt/runtime delta
follows; any next test must use a deliberately bounded subset of remaining
facts, not a blind full-pipeline repeat.

The one-call H1 subset in
`.tmp-pr92-sources/masonry-procurement-subset-probe-output.json` added only
the church-construction auxiliary-work and quarry-procurement facts to that
clean pair. It also returned a clean, correctly qualified one-find answer.
Thus neither the comparator nor that procurement pair is individually
sufficient. The full 12-fact saved slice produced P1 prose in both the 458
report and its matched replay, while the 1-, 2- and 4-fact slices are clean.
The current reproducible diagnosis is semantic over-association induced by
some remaining broad context combination, or output variability; it is not a
missing premise, a direct-focus leak, or a demonstrated single bad claim.

No production prompt/closure change is justified by this evidence: the shared
closure already states the violated limit. The smallest general candidate,
only after a contract-scoped design/reproduction, is relevance compaction at
the existing Core-to-semantic slice boundary so an insufficiency answer does
not receive tangential factual clusters. That boundary must remain generic and
cannot be a masonry ref/filter. Until a load-bearing subset or a general
compaction rule is proved, retain the prose audit as the red-capable detector.

### Modal-premise closure — saved 458 full-slice replay

The Contract Auditor approved the shared clarification that an unsupported
`may`/`could` possibility is still a missing factual premise, while preserving
causal composition from supplied premises. It is compatible with §§10.8--10.9,
62--64 and 74: it changes neither owner nor factual authority, schema, Core,
call count or repair policy.

One exact-variable replay is retained in
`.tmp-pr92-sources/masonry-modal-closure-replay-output.json`. It reuses the
saved 458 full 12-fact slice, question, role and temperature; only the current
shared system closure differs. Despite delivery of that exact sentence, the
answer again says the masonry *could* be from any stone building or be building
material, citing only `claim:contextual-evidence-classes`. Those remain the
same unsupported propositions: the cited claim establishes a one-find function
gap, not either alternative. This single replay proves prompt delivery but not
semantic compliance or a fix. It does not justify another prompt layer, a full
PASS, or changing the current **BLOCK** verdict.

### Limited current470 livestock pipeline review

The targeted current470 run in
`.tmp-pr92-sources/livestock-pipeline-report.json` covers two new cases in
three modes. Its hybrid gate passes. This is a limited prose review, not a
replacement for the current combined **BLOCK** verdict: the unresolved masonry
P1 remains outside these two cases.

| Hybrid case | Verdict against cited current470 claims |
| --- | --- |
| `goat_hay_digestion_en` | **PASS.** Ruminant membership, rumen-bacteria forage digestion, and fermentation products as possible nutrient/energy sources are each directly cited. The answer's no-current-feed conclusion preserves the forage-digestion claim's explicit gaps: safety, presence, adequacy, acceptance, season, stock and feeding competence. It does not use the forbidden horse-forage claim. |
| `swine_ruminant_feeding_ru` | **PASS.** The cited monogastric-omnivore classification and comparative higher-energy/lower-fibre diet support the requested pig-versus-ruminant distinction. The rumen statements retain their mature-ruminant and possible-source limits. The final refusal to infer an exact individual ration, present animal, or historical practice matches the cited exclusions; it does not invent a ration or ban roughage. |

No prompt, oracle, Core, data, or runtime change follows from this bounded
PASS.

### Limited current476 ceramic / religion pipeline review

The two-case current476 report is retained at
`.tmp-pr92-sources/ceramic-religion-pipeline-report.json`. Its hybrid gate is
**FAIL** only for the missing hard-stone sawing evidence group. This limited
review neither changes the current combined **BLOCK** verdict nor reopens the
separate masonry P1.

| Hybrid case | Verdict against cited and available current476 claims |
| --- | --- |
| `church_statute_current_court_ru` | **PASS.** Both cited Olenin claims support a historical-textual statutory category and adjudication norm. The answer correctly declines to infer a current local court or a particular person's jurisdiction; neither is established by the cited records. |
| `hard_stone_abrasive_limits_en` | **BLOCK — missing factual relationship.** The cited shaping claim grounds smoothing/limited shaping and its rock/grit limits. It does not answer the independently requested sawing relation. `claim:hard-stone-abrasive-sawing` is absent from the bounded hybrid slice although it is the required direct premise. This is a retrieval/packing omission, not unsupported prose and not an oracle weakening candidate. |

No prompt, semantic model, or evidence expectation change follows from this
review.

### Current476 ranked ceramic / religion replay

The ranked replay is retained in
`.tmp-pr92-sources/ceramic-religion-pipeline-ranked-report.json`. Its two-case
hybrid gate passes after the lexicographic Core ranking update. This is not a
global readiness declaration and does not erase the prior failing report or
the separate masonry P1.

The earlier causal wording is corrected: both hard-stone claims were already
exact-focus candidates through `wk:material_culture:stone`. The old additive
rank put historically specific low-relevance wood facts above the universal
hard-stone facts within that same tier. It was not a lexical candidate absence.

| Hybrid case | Verdict against cited current476 claims |
| --- | --- |
| `hard_stone_abrasive_limits_en` | **PASS.** Both independently requested methods are now cited. Each retains the suitable-blank/compatible-abrasive condition, inferred possibility, and no-every-rock/no-every-knife-or-grit guarantee. The answer adds no current availability, tool possession, time, or outcome claim. |
| `church_statute_current_court_ru` | **PASS.** The two statutory claims support the historical-textual category and its limited adjudication norm only. The answer correctly preserves the absence of proof for a current local court, enforcement, or individual jurisdiction. |

The ranking change affects bounded factual ordering only; it does not change
applicability, access, authority, planner output, semantic prompt, model, or
oracle.

### Current476 full 21-case pipeline review

Canonical `benchmarks/pipeline-v1-report.json` is current476 with 21 hybrid
cases. Its automatic gate is **FAIL** only on `wet_unknown_hide_ru` for a
missing mandatory evidence group. This full prose review keeps the combined
status **BLOCK**; it neither weakens that group nor converts any limited pass
into global readiness.

| Cases | Groundedness verdict |
| --- | --- |
| `hard_stone_abrasive_limits_en`, `church_statute_current_court_ru`, `goat_hay_digestion_en`, `swine_ruminant_feeding_ru`, `grain_processing_waste_ru`, `hemp_processing_materials_ru`, `architecture_single_find_function_ru`, `biology_one_meal_ru`, `craft_smithy_assumption_en`, `environment_fishing_presence_ru`, `material_leather_personal_item_ru`, `npc_combined_resource_skills_ru`, `physics_wet_grain_ru`, `social_debt_seizure_ru`, `shirt_materials_buttons_ru`, `smith_tools_en` | **PASS.** Cited premises cover stated historical, biological, material, or present-scene limits. Masonry now confines itself to the one-find/function limit and adds no alternative building hypothesis. |
| `wet_unknown_hide_ru` | **BLOCK — mandatory factual relationship missing.** `claim:material-water-rawhide-wet-dry` supports rawhide's qualified wet/dry response and distinction from leather. It does not establish that leather water response depends on processing/finish/condition. Available `claim:material-water-leather-water-processing` is the required bridge and is uncited. The answer's uncertainty is directionally safe, but cannot satisfy the covered leather-processing need without that premise. |
| `ship_joint_caulking_en` | **P1 unsupported function leap.** Tarred tow and clamps support caulking plank gaps. Pine resin is only attested on surfaces of an earlier boat; “To seal a gap ... or apply pine resin” promotes that surface observation into a gap-sealing function. No cited connecting premise supports it. |
| `wet_hemp_cord_ru` | **P1 unsupported exclusivity.** The cited contaminant claim gives one conditional, time-dependent weakening pathway and says water alone is not declared a contaminant. “Необратимая порча могла бы возникнуть лишь” from contaminating liquid and time turns that sufficient pathway into an exclusive necessary condition; neither cited textile claim establishes it. |
| `bort_hook_household_inference_en` | **P2 modality.** The borts claims support association with wild tree borts and non-proof of a domestic hive. “Not with domestic hives” overstates non-proof as exclusive function. |
| `chemistry_damp_iron_ru` | **P2 modal compression.** Opening “ржавеет под дождём” is broader than cited “может ржаветь”; later sentence restores modality but does not erase the initial overstatement. |

The gate failure is a real evidence-coverage failure, independent of the three
prose findings. Do not alter expected groups. Ship and wet-hemp require removal
or a genuinely supplied relation, not a new prompt or evaluator relaxation.

### Directionality-closure matched 3-case A/B

`.tmp-pr92-sources/closure-directionality-probe-output.json` retains paired
production-role calls over the same rehydrated current476 slices, question,
role and temperature. The one changed variable is the shared directionality
sentence. No planner or retrieval call was repeated. Delivery coverage was
red before and green after the shared production change.

| Case | Baseline → directionality result | Independent verdict |
| --- | --- | --- |
| `wet_unknown_hide_ru` | Baseline repeats the rawhide-only answer. Directionality answer cites rawhide plus `claim:material-water-leather-water-processing`, explicitly states that the leather reaction depends on processing, finishing and condition, and keeps the prediction uncertain. | **PASS for this replay.** The formerly missing mandatory relation is now used and supports the stated limit. |
| `wet_hemp_cord_ru` | Both outputs retain “необратимая порча могла бы возникнуть лишь” from contaminating liquid and later oxidation. | **P1 remains.** One supplied conditional pathway is still treated as an exclusive necessary condition. |
| `ship_joint_caulking_en` | Directionality output is textually unchanged: pine resin observed on earlier boat surfaces remains coordinated as an option after “To seal a gap between planks.” | **P1 remains.** Surface compatibility is still relabelled as gap-sealing function. |

This A/B proves delivery and a limited wet-hide improvement only. It neither
clears the other two P1 findings nor establishes a full-pipeline or global
grounding pass. No further model call follows from this audit.

### Isolated enabled-thinking support probe

`.tmp-pr92-sources/closure-thinking-probe-output.json` is one same-alias,
captured directionality-input call. It uses an injected runner environment copy
with `TURN_STEP_PLANNER_THINKING=enabled`; no settings, default, schema or
production-policy value was written.

The provider accepted the request under `deepseek-v4-flash`: 19.7 s and 5,521
total tokens, including 1,996 reasoning tokens. The comparable directionality
baseline was about 3.1 s and 3,374 total tokens. The enabled response removes
the wet-hemp exclusive-cause claim: it states only that the cited contaminant
and time pathway is needed for *that* late stain-oxidation weakening path.
This is a real limited logical improvement against the cited claims.

It is nevertheless **not gate-valid**: its `answer_class` is `no` for a
what/how question whose accepted class is `explain`. The content improvement
cannot waive that strict output contract. One successful isolated call also
does not justify enabling thinking for production: the active Flash-first
policy remains disabled-thinking, and a cutover would require separate policy
review plus representative cost, latency, structural-validity and grounding
evidence. Raw reasoning is not used as factual evidence.

The second isolated enabled-thinking probe,
`.tmp-pr92-sources/closure-thinking-ship-probe-output.json`, is structurally
valid (`explain`) but does **not** clear ship P1. Tarred tow plus clamps still
ground the plank-gap caulking method. Pine resin on surfaces and resin-coated
bast lashings support an earlier observed surface/lashing treatment and generic
technical compatibility only; the bast record expressly does not establish
waterproofness. “Compatibility for resin-based sealing/treatment” therefore
still introduces an unprovided sealing function. The 8.82 s / 3,114-token call
(603 reasoning tokens) is a limited benchmark observation, not a reason to
promote enabled thinking or make further calls.

### Entailment-closure matched 3-case probe

`.tmp-pr92-sources/closure-entailment-probe-output.json` contains nine matched
calls over the same captured current476 slices: baseline, evaluator-only
removal of the request for a “possible explanation,” and the shared entailment
replacement.  It is not a full-pipeline result and does not alter the combined
**BLOCK** verdict.

| Case | Independent result |
| --- | --- |
| `wet_hemp_cord_ru` | **Evaluator-only and shared variants are directionally grounded.** Both retain conditional swelling, water-load damage and contaminant-mediated weakening without converting the latter pathway into the only cause of irreversible damage.  Baseline remains P1: “лишь” makes that pathway exclusive; its final “temporary changes” is also not supplied, because absence of proof of permanence does not prove temporariness. |
| `ship_joint_caulking_en` | **P1 persists in all three variants.** Tarred tow and clamps ground caulking.  The surface-resin observation does not ground an alternative gap-sealing function.  Evaluator-only says it indicates sealing compatibility; shared says it indicates use for sealing, so the replacement provides no benefit on the target defect. |
| `wet_unknown_hide_ru` | **Uncertainty is safe in every variant.** The shared variant lists the leather-processing claim, but does not state its material relation (that response depends on processing, finish and condition).  Citation alone is not an independent prose-grounding benefit; evaluator-only remains a bounded rawhide-versus-leather limit. |

Accordingly, this sample does **not** demonstrate a production benefit of the
shared entailment replacement beyond the evaluator-only clarification.  The
smallest evidence-based course is to retain the evaluator-tail removal and
restore the prior shared relationship/gap wording rather than claim the shared
replacement repairs either P1.  Any later shared-boundary change needs a
captured-slice result that changes the relevant factual proposition, not merely
its citation list.

### Current491 full 24-case cross-domain pipeline review

Canonical `benchmarks/pipeline-v1-report.json` is a new complete 72-run
(24 cases × three modes) production-v1 run.  It adds and executes the three
cross-domain probes `prepared_hide_tanning_en`, `care_cloth_waterproofing_ru`,
and `conditional_household_care_en`; it is not the earlier 21-case report.
The hybrid gate is **FAIL** with two evidence-coverage failures.  Hybrid has
no unsupported cited refs and all answer classes are accepted, but those
mechanical results do not clear the prose findings below.  The combined
readiness verdict remains **BLOCK**.

| Hybrid cases | Groundedness verdict |
| --- | --- |
| `prepared_hide_tanning_en`, `care_cloth_waterproofing_ru`, `conditional_household_care_en` | **PASS.** Tanning separately cites the prepared-hide/tannin process and collagen stabilization against putrefaction.  Care preserves the already-bleeding, clean/open, waterproof, contaminated-water, probability, and no-guarantee bounds; ordinary cloth is not equated with the waterproof condition.  The Extended Pravda answer retains both narrow conditional textual arrangements and correctly declines a current Novgorod-1230 duty. |
| `hard_stone_abrasive_limits_en`, `church_statute_current_court_ru`, `goat_hay_digestion_en`, `swine_ruminant_feeding_ru`, `wet_hemp_cord_ru`, `biology_one_meal_ru`, `environment_fishing_presence_ru`, `material_leather_personal_item_ru`, `npc_combined_resource_skills_ru`, `physics_wet_grain_ru`, `ship_joint_caulking_en`, `shirt_materials_buttons_ru`, `smith_tools_en` | **PASS.** Each answer uses its cited direct/conditional premises without asserting present stock, status, outcome, or a mandatory kit.  The hemp answer now includes the hemp-to-plant-cellulosic-fibre bridge; the ship answer now omits the unsupported resin-sealing function. |
| `hemp_processing_materials_ru` | **BLOCK — automatic retrieval/packing omission.** The required `claim:agriculture-fauna-tow-log-gaps` is absent from the available hybrid slice, so the answer truthfully says the supplied facts do not state that construction use.  This is not a prose fabrication, but it fails the mandatory expected group and requires a retrieval/packing diagnosis. |
| `wet_unknown_hide_ru` | **BLOCK — semantic evidence-usage omission.** `claim:material-water-leather-water-processing` is available but uncited; only rawhide is cited.  The uncertainty sentence is directionally safe, but it does not state or evidence the required processing/finish/condition bridge.  This is a semantic citation/use miss, not a reason to weaken the expected group. |
| `architecture_single_find_function_ru` | **P1 unsupported alternatives.** The contextual-evidence claim supports only that one masonry fragment does not identify function.  “Could be any stone building or building material” adds two factual alternatives with no supplied premise. |
| `bort_hook_household_inference_en` | **P1 unsupported exclusion.** The claims associate hooks with wild tree borts and do not establish a domestic hive; “not with domestic hives” turns that absence of connection into an exclusion. |
| `chemistry_damp_iron_ru` | **P2 modal compression.** “Железный нож ржавеет под дождём” is categorical, while the cited relation is conditional/possible.  The later “может ржаветь” does not erase the opening overstatement. |
| `grain_processing_waste_ru` | **P2 qualifier drift.** The threshing-to-chaff relation is represented as medium-confidence/inferred although its approved source relation is direct/high; the answer should preserve the claim's actual directness/confidence rather than lower it. |
| `social_debt_seizure_ru` | **P2 relevance/conditional-rule recitation.** Its final uncertainty and refusal to infer a present self-help right are grounded.  But it unnecessarily reprises the conditional entrusted-goods/merchant rules whose triggers are absent, contrary to the closure's current-world instruction.  This is not evidence for a current procedure or right. |

`craft_smithy_assumption_en` remains a grounded current-presence limit: it does
not turn attested tools into a working smithy, and its lack-of-establishment
formulation does not invent a missing kit.  No conclusion in this review
authorizes an oracle, prompt, Core, or data change; the two automatic
omissions and listed P1/P2 findings remain independently actionable.

### Claim-wording matched 2-case probe

`.tmp-pr92-sources/claim-wording-probe-output.json` is a four-call
exact-variable test over captured slices, claim order, model and prompts.  The
shared closure is restored to its prior relationship/gap wording and the
evaluator-only request for a possible explanation is absent.  The sole changed
input is the corresponding claim runtime text and its `context_text` copy.
This is evidence for wording normalization only, not a global pipeline pass.

| Case | Baseline → normalized wording | Independent verdict |
| --- | --- | --- |
| `ship_joint_caulking_en` | Broad “technical compatibility” yields pine-resin-as-sealing P1.  The narrowed surface-observation wording makes the answer omit resin and retain only peg/nails, tarred tow, and clamps. | **PASS.** Each of the five cited claims directly supports the stated joint or plank-gap relationship; no present stock, mandatory kit, or resin sealing function is asserted. |
| `wet_hemp_cord_ru` | The former condition sentence yields “irreversible damage would require” the contaminant pathway.  The normalized “for this contamination-mediated pathway” wording yields only conditional contaminant weakening and no exclusivity. | **P1 cleared; residual cited-bridge omission.** The three cited physical claims support their conditional reactions and the no-irreversibility conclusion.  But the answer applies the natural-fibre response to the asked hemp cord without citing supplied `claim:material-water-hemp-cellulosic-fibre`, the classification bridge.  This is not a reason to restore the old wording or to weaken any expected group; the semantic answer must cite that actually used bridge. |

The new pine-resin wording is source-faithful because it reports the observed
resin-on-surface fact without assigning a function.  The contaminant wording
preserves the same mechanism and conditions while limiting their necessity to
that mechanism.  Neither normalization creates a claim, hard constraint,
historical practice, or present-world fact.

### Current491 full 24-case hybrid prose audit

I independently compared every current491 hybrid answer with its supplied
`factual_premise_refs`, available slice and runtime limits in
`benchmarks/pipeline-v1-report.json`. This is a prose-entailment audit, not an
oracle or gate change. The canonical gate's four failures are real.

| Hybrid case(s) | Verdict | Grounding result |
| --- | --- | --- |
| `prepared_hide_tanning_en` | **BLOCK — two required premises absent; additional overreach.** | Neither vegetable-tanning claim is supplied/cited. The cited hide distinction, drying and generic solute facts do not establish tanning of a prepared hide, collagen stabilization, tannin-specific durability/flexibility, or the asserted reversibility on rewetting. |
| `care_cloth_waterproofing_ru` | **PASS.** | Direct pressure remains conditional and non-guaranteed; the waterproof-cover record supports refusing to equate ordinary cloth with the supplied waterproof condition. No treatment outcome is promised. |
| `conditional_household_care_en` | **PASS.** | All three §93/§96 conditions and the comparative-only boundary are cited. The answer retains textual conditionality and denies enacted 1230 law/current duty. |
| `hard_stone_abrasive_limits_en` | **PASS.** | Both sawing and shaping relations are cited with suitable-blank/compatible-abrasive limits and no every-rock/tool guarantee. |
| `church_statute_current_court_ru` | **PASS.** | The historical-textual adjudication records support the refusal to infer a current court or a person's jurisdiction. |
| `goat_hay_digestion_en`; `swine_ruminant_feeding_ru` | **PASS.** | The cited membership/digestion and comparative-diet facts support species-level biology only; both outputs withhold an individual ration, feed safety, presence, adequacy, or practice. |
| `grain_processing_waste_ru`; `hemp_processing_materials_ru` | **PASS.** | Each process/output relation is cited and the grain answer preserves the source's probabilistic/inferred status. |
| `bort_hook_household_inference_en` | **REVISE — P2 modal overstatement.** | The facts associate the hook with tree borts and do not prove a domestic hive. “Not with domestic hives” converts non-proof into an exclusive function; it should say the hook does not establish a domestic hive. |
| `wet_hemp_cord_ru` | **PASS.** | The hemp-cellulosic bridge is now cited. Water response and the liquid-contaminant pathway remain conditional; the revised text no longer makes that pathway the only cause or invents permanent damage. |
| `wet_unknown_hide_ru` | **BLOCK — required bridge omitted.** | Rawhide is correctly kept distinct from tanned leather, but the supplied leather-processing/finish/condition claim is not cited. The output therefore cannot ground the requested unknown-leather limitation completely. |
| `architecture_single_find_function_ru` | **BLOCK — unsupported alternatives.** | The cited one-find/context claim supports refusal to identify function, not the added alternatives that the masonry could be any stone building or generic building material. |
| `biology_one_meal_ru`; `craft_smithy_assumption_en`; `environment_fishing_presence_ru`; `material_leather_personal_item_ru`; `npc_combined_resource_skills_ru`; `physics_wet_grain_ru`; `social_debt_seizure_ru` | **PASS.** | The citations support the stated causal or historical compatibility limits, and each answer withholds the relevant present-scene, actor, possession, debt-party, authority, or individual-condition inference. |
| `chemistry_damp_iron_ru` | **REVISE — P2 modality.** | “Железный нож ржавеет под дождём” is categorical; the cited relation says iron *may* corrode under moisture and oxygen. The first clause must retain `может`. |
| `ship_joint_caulking_en` | **PASS.** | Pine resin is omitted. The cited nails/peg and tarred-tow/clamp claims directly support the stated attested/reconstructed joint and gap methods without current stock or universal-kit inference. |
| `shirt_materials_buttons_ru` | **PASS.** | Cited shirt material, gusset and fastening/button-material records support the listed possible forms; the output explicitly keeps them non-mandatory. |
| `smith_tools_en` | **BLOCK — required iron-input group omitted.** | Anvil, hammers and tongs are cited, but the sentence that smithing involved working iron and steel requires the supplied `claim:occupation-smith-iron-input`, which is available but absent from factual refs. |

**Conclusion:** no further global prose overclaim was found beyond the four
gate omissions, the architecture alternatives, and the two P2 modal issues
(`bort_hook_household_inference_en`, `chemistry_damp_iron_ru`). Care, HHO,
resin-dependent ship wording and hemp water wording are grounded in the
current491 slice. The result remains **FAIL/BLOCK** until the four gate
omissions are actually supplied and cited; the architecture and two P2
sentences should be narrowed rather than relaxing the evaluator.

### Scoped current491 cross-domain planner replay

`.tmp-pr92-sources/cross-domain-focus-report.json` is a post-fix, three-case
pipeline run. Its hybrid terminal gate is **PASS**. This verifies the focused
planner-discovery repair only; the full 24-case canonical report predates the
fix and remains **FAIL**, so this section is not a global PASS.

### Run-scope correction — bort hook wording

The `bort_hook_household_inference_en` P2 finding above belongs to the
historical **current491** raw response: “associated with obtaining honey from
wild tree borts, **not with domestic hives**.” That contrast is the precise
overstatement: the supplied facts establish a bounded tree-bort function and
non-proof of a household hive, not an exclusion of every domestic-hive
association.

The canonical report was later overwritten by **current495**. Its different
hybrid response says only that the supplied facts do not establish the
household's domestic hive or current practice. It does **not** make the former
exclusive-function proposition, so it neither reproduces nor resolves the
current491 P2. Current495 instead has a separate automatic
`EXPECTED_EVIDENCE_MISSING`: `claim:agriculture-fauna-rural-tree-borts` is
absent from the hybrid available slice. That is a retrieval/packing failure,
not a new prose P1 and not a reason to revise the preserved current491 audit.

### Compiled 499 focused coherence attempt — execution BLOCK

`.tmp-pr92-sources/focus-coherence-report.json` is **not** a completed
five-case, three-mode/hybrid evidence run. Its recorded decision is fail with
`PIPELINE_EXECUTION_FAILED` on `prepared_hide_tanning_en` in
`structured_lexical`: both the original planner output and its one permitted
repair retain `wk:material_culture:hide` in `focus_refs` while selecting only
`chemistry_process`, `craft_technology` and `physics_material_science`.
The plan validator correctly rejects that focus ref because its claims are
available only through unselected `material_culture`. No hybrid output exists
for the five cases, so this report cannot establish a 499 prose or shared
validator result.

The completed structured cases are narrowly sound: `textile_dye_application_en`
cites both direct dye premises and retains that immersion is usual, not
necessary, and mordant fixation optional; `fur_skin_preservation_ru` cites
both FPP premises and preserves their `могут / can` causal limits. Those two
outputs are only partial observation, not an audit of the aborted set. The
next action is the existing planner/one-repair validity path for a focus-domain
mismatch; no benchmark, factual premise, closure, repair-count or gate
relaxation follows from this failed attempt.

### Compiled 499 actionable focused coherence run — scoped PASS

`.tmp-pr92-sources/focus-coherence-actionable-report.json` is a separate,
completed 15-call run (five cases × three modes). Its hybrid production gate
passes all five designated cases. This follows the focused repair-message
change; it is not a replacement for the retained failed coherence attempt or
a claim about a full canonical corpus run.

| Hybrid case | Independent prose/citation verdict |
| --- | --- |
| `textile_dye_application_en` | **PASS.** It cites both FPD premises, lists the supported fibre/yarn/fabric/finished-article stages, preserves “usually” for immersion, and explicitly does not make immersion or a mordant necessary for every application. No dyestuff, colour, historic supply or recipe is invented. |
| `fur_skin_preservation_ru` | **PASS.** It cites both FPP premises and retains `могут` for cooling/cleansing and hair-loosening bacterial risk. It supplies no temperature, deadline, pelt, worker, historic practice or guarantee. |
| `prepared_hide_tanning_en` | **PASS.** It distinguishes vegetable-tannin treatment of an already prepared hide from mere drying without claiming a drying chemistry or present tanning. Collagen/tannin stabilization and increased resistance to putrefaction are exactly the cited relation. |
| `hard_stone_abrasive_limits_en` | **PASS.** Sawing and limited smoothing stay conditional on a suitable hard-stone blank and compatible abrasive. The answer retains the claim limits on every rock/grit, means, time, outcome and availability. |
| `hemp_processing_materials_ru` | **PASS.** All three required premises are cited: historical hemp-stem fibre, tow as processing byproduct, and the described use of tow when laying logs and caulking log gaps. It does not create stock, a current building or guaranteed sealing. |

No unsupported factual premise ref occurs in the five hybrid outputs. The
result proves this bounded new-material and regression set only; it does not
alter the historical run scopes, global readiness, benchmark thresholds,
factual groups, repair policy or production ownership.

| Hybrid case | Independent prose/citation verdict |
| --- | --- |
| `prepared_hide_tanning_en` | **PASS.** Both HLP claims are supplied and cited. They directly support treatment of an already prepared hide with tannin-containing plant material/liquor, collagen–tannin bonds, stabilization and greater putrefaction resistance. “Drying does not introduce tannins or create such bonds” is a bounded contrast, not a claim about a particular hide, drying outcome, or historical practice. |
| `care_cloth_waterproofing_ru` | **PASS.** The two BC claims support conditional direct-pressure control without guaranteed cessation, and a waterproof bandage’s possible reduction of infection chance under relevant contaminated-water exposure. The answer only says ordinary non-waterproof cloth is not the same condition and is not proved sufficient; it adds no sterility, guaranteed protection, present wound, or treatment outcome. |
| `hard_stone_abrasive_limits_en` | **PASS.** Both CSP claims are supplied and cited. The answer retains suitable hard-stone blank and compatible abrasive conditions, limits shaping, and rejects an every-rock/every-knife-or-grit guarantee. Its statement that suitability depends on the specific rock and abrasive is the direct conditional boundary of those claims, not a new tool, availability, or outcome premise. |

No unsupported closing sentence or condition was found in these three hybrid
answers. The evidence demonstrates cross-domain discovery for the tested
cases; it does not re-run, supersede, or clear the pre-fix 24-case canonical
failure.
+

### Current495 full 24-case hybrid prose audit

I independently checked every hybrid answer in the current canonical
`benchmarks/pipeline-v1-report.json` against its supplied
`factual_premise_refs`, available slice, expected groups, and applicable
runtime limits. The prior one-sentence planner candidate has been **reverted**;
this is an audit of current495, not evidence for that candidate or a global
pass.

| Hybrid case(s) | Verdict | Grounding result |
| --- | --- | --- |
| `prepared_hide_tanning_en`, `care_cloth_waterproofing_ru`, `conditional_household_care_en` | **PASS.** | Tanning cites both prepared-hide/tannin treatment and collagen stabilization; care retains conditional pressure, non-guarantee, clean/open-wound and waterproof-cover limits; the *Russkaya Pravda* answer remains a conditional comparative text, not enacted 1230 duty. |
| `hard_stone_abrasive_limits_en`, `church_statute_current_court_ru`, `goat_hay_digestion_en`, `swine_ruminant_feeding_ru`, `grain_processing_waste_ru`, `wet_unknown_hide_ru`, `ship_joint_caulking_en`, `shirt_materials_buttons_ru`, `smith_tools_en` | **PASS.** | Required evidence groups are supplied and cited. Statements retain relevant material conditions, biological/non-individual limits, historical-textual status, or no-current-scene inference. Ship uses only peg/nail and tarred-tow/clamp evidence; it does not reinstate resin sealing. |
| `biology_one_meal_ru`, `chemistry_damp_iron_ru`, `craft_smithy_assumption_en`, `environment_fishing_presence_ru`, `material_leather_personal_item_ru`, `npc_combined_resource_skills_ru`, `physics_wet_grain_ru`, `social_debt_seizure_ru` | **PASS.** | These negative/current-state answers cite their stated limits and do not manufacture a nutrition cause, current smithy, catch, possession, combined profession, object condition, or self-help right. `chemistry_damp_iron_ru` now preserves `может`, rather than categorical rain-rust language. |
| `architecture_single_find_function_ru` | **P1 — unsupported positive alternatives.** | `claim:contextual-evidence-classes` supports only that one find does not determine building function. It does not supply «частью любого каменного сооружения» or «строительным материалом». Non-proof of a church does not license either alternative; answer must stop after refusal, unless a supplied premise establishes a stated alternative. |
| `hemp_processing_materials_ru` | **BLOCK — retrieval/packing omission, not prose invention.** | Answer accurately says supplied facts omit timber-gap use, but required `claim:agriculture-fauna-tow-log-gaps` is absent from available slice and citations. Expected group is genuinely unsatisfied. |
| `bort_hook_household_inference_en` | **BLOCK — retrieval/packing omission, not prior exclusion wording.** | Current495 avoids old false exclusive “not with domestic hives” formulation. But `claim:agriculture-fauna-rural-tree-borts` is absent from available slice/citations, leaving required historical rural-tree relation unprovided. |
| `wet_hemp_cord_ru` | **BLOCK — classification-bridge citation omission.** | Conditional water-load and contaminant pathway prose is bounded and non-exclusive. Yet `claim:material-water-natural-fibres-water-swelling`, required to apply natural-fibre water response, is absent from factual refs; cited hemp-cellulosic classification alone cannot supply response. |

No other prose overclaim was found across current495's 24 hybrid answers.
Terminal **FAIL** remains real for the three stated expected-evidence
omissions; independent of that gate, the architecture answer retains the P1
positive-alternative defect. Do not turn either into PASS by relaxing
evaluation or restoring reverted prompt wording. This audit makes no runtime,
schema, Core, planner, or production-data change.

### Current499 full 26-case hybrid prose audit

This is an independent audit of the current canonical
`benchmarks/pipeline-v1-report.json`: 26 hybrid outputs, with a terminal
**FAIL**. It is not a replacement for the scoped 499 focused run or evidence
of overall readiness. The production gate records exactly three misses:
`bort_hook_household_inference_en` and `wet_hemp_cord_ru`
(`EXPECTED_EVIDENCE_MISSING`), and `craft_smithy_assumption_en`
(`RELEVANT_EVIDENCE_MISSING`).

| Hybrid case(s) | Verdict | Grounding result |
| --- | --- | --- |
| `textile_dye_application_en`, `fur_skin_preservation_ru`, `prepared_hide_tanning_en`, `care_cloth_waterproofing_ru`, `conditional_household_care_en` | **PASS.** | The new dye and pelt answers cite both direct premises and preserve `usually`/`can`, rather than making a mordant, cooling, cleansing, or outcome mandatory. Tanning, wound-care, and conditional *Russkaya Pravda* limits remain confined to their stated relations and conditions. |
| `hard_stone_abrasive_limits_en`, `church_statute_current_court_ru`, `goat_hay_digestion_en`, `swine_ruminant_feeding_ru`, `grain_processing_waste_ru`, `hemp_processing_materials_ru`, `wet_unknown_hide_ru`, `biology_one_meal_ru`, `chemistry_damp_iron_ru` | **PASS.** | Each cited answer keeps the applicable material, biological, confidence, historical-textual, or individual-scene limit. In particular, stone work remains conditional on a suitable blank and compatible abrasive; hemp/tow keeps its historical and non-current-stock boundaries; and damp iron retains `может`. |
| `environment_fishing_presence_ru`, `material_leather_personal_item_ru`, `npc_combined_resource_skills_ru`, `physics_wet_grain_ru`, `social_debt_seizure_ru`, `ship_joint_caulking_en`, `shirt_materials_buttons_ru`, `smith_tools_en` | **PASS.** | The citations support historical compatibility without turning it into present fact, duty, kit, possession, or automatic procedure. Ship construction binds pegs/nails and tarred tow/clamps to their supplied functions; it does not revive the resin-to-sealing inference. |
| `architecture_single_find_function_ru` | **P1 — unsupported positive alternatives persists.** | `claim:contextual-evidence-classes` supports only the negative conclusion that a building function is not determined from one find. «Кладка могла быть частью любого каменного сооружения или строительным материалом» adds two factual possibilities not supplied by that premise. The available church-masonry comparison is also not evidence for either alternative. |
| `bort_hook_household_inference_en` | **BLOCK — planner/retrieval omission plus an ungrounded contrast.** | The plan chooses `material_culture`/`npc_daily_life` and hook/honey/wax focuses, but omits `craft_technology` and `wk:craft_technology:tree-bort-practice`. Thus the slice and cited premises contain only `claim:agriculture-fauna-bort-climbing-hooks`; required `claim:agriculture-fauna-rural-tree-borts` is absent. The answer's “not with domestic hives” contrast is expressly bounded by the absent rural-tree-borts record, so it is not licensed by the cited hook record alone. The smallest evidenced cause is planner domain/focus selection, not an oracle relaxation. |
| `wet_hemp_cord_ru` | **BLOCK — missing classification bridge.** | The planner selects only physics focus refs for natural-fibre response and textile damage. It retrieves/cites swelling, water-load, and contaminant-pathway records, but not required `claim:material-water-hemp-cellulosic-fibre`, despite explicit hemp search hints. Calling the rope a natural fibre and applying the natural-fibre response therefore lacks its supplied bridge. The other conditional water-pathway prose is cited and bounded; the failure is coverage/retrieval, not unsupported cited refs. |
| `craft_smithy_assumption_en` | **Benchmark relevance set needs a narrow evidence review; do not automatically waive the gate.** | `claim:metalworking-broad-context` is not available. However, the three cited available records are genuine direct current-scene limits: hammer says attestation neither makes a mandatory kit nor creates a scene item; role says it creates no workshop or fuel for a particular NPC; anvil says it does not establish presence/access. They support the answer's no-current-smithy conclusion alongside the omitted, more iron-specific `claim:occupation-smith-iron-input`. This is not a fabricated answer. The current two-ref `relevant_claim_refs` set is likely stale/narrow after those direct limit records were normalized. Before changing it, confirm the intended premise is the general no-present-smithy limit (then add those three documented alternatives as relevant, retaining the at-least-one requirement), rather than specifically the visible-iron-fragment relationship (then retain the existing failure and correct semantic selection). |

No additional P1/P2 prose defect was found in the other 22 current499 hybrid
outputs. The current canonical decision remains **FAIL/BLOCK**: two genuine
retrieval/coverage misses, one relevance-oracle ambiguity requiring the narrow
review above, and the independent architecture P1. This entry changes no
benchmark, runtime, prompt, evaluator, or production data.

### Scoped connecting-premise probe — current499 / seven cases

`.tmp-pr92-sources/connecting-premise-report.json` is a separate completed
seven-case / 21-call run. Its hybrid gate is **FAIL** only on
`bort_regional_use_context_en` (`EXPECTED_EVIDENCE_MISSING`). It measures the
retained narrow planner bridge wording; it does not rescore either failed
experimental wording or establish a full-corpus pass.

| Hybrid case(s) | Verdict | Grounding result |
| --- | --- | --- |
| `prepared_hide_tanning_en`, `bort_hook_household_inference_en`, `craft_smithy_assumption_en` | **PASS.** | Tanning cites both direct treatment/stabilization premises. Original bort inference now cites hook and rural-tree context, while requiring hook only. Smithy cites the documented hammer/anvil/role alternatives and does not invent a kit, current workshop, fuel, or active smith. |
| `wet_hemp_cord_ru` | **PASS with P2 relevance note.** | The new classification bridge is supplied and cited with natural-fibre swelling; water-load effects remain conditional and no irreversible damage follows. “These facts do not prove that this rope got wet” is unnecessary because wetness is stated by the question, but it is not a new factual premise or a denial of the stated observation. |
| `bort_regional_use_context_en` | **BLOCK — omitted hook premise.** | The plan chooses `craft_technology`, `architecture_settlement`, and `npc_daily_life`, with tree-bort/rural/household focuses, but omits `material_culture` and `wk:material_culture:tree-climbing-hook`. The slice supplies rural practice plus honey/wax, not `claim:agriculture-fauna-bort-climbing-hooks`; nevertheless the answer asserts the hook association. Both expected groups are genuinely required by this explicitly two-part question. This is planner coverage/model-memory use, not an oracle failure. |
| `oil_treatments_distinct_skin_states_en` | **P1 — unsupported physical negative.** | Both required oil claims are supplied/cited and the rawhide moisture-resistance, vegetable-tanned-leather water response, rawhide wet/dry, and end-tanning flexibility statements are supported. “The flexibility treatment … **does not confer water resistance**” is not: its cited claim establishes flexibility purpose only. The final “does not imply water resistance” is the supported epistemic limit. Narrow the former to the latter; do not infer a physical no-water-resistance relation. |
| `architecture_single_find_function_ru` | **P1 persists.** | Direct contextual-evidence citation supports only that one find cannot determine function. “Could come from any stone building or building material” remains an unprovided factual alternative; `architectural-material-classes` merely names broad evidence classes and does not establish it. |

The narrow bridge wording demonstrably reaches the hemp classification premise,
but the report remains **FAIL/BLOCK** for the omitted explicit hook premise and
the two independent P1 prose findings. No prompt expansion, oracle relaxation,
or production change follows from this scoped result.

### Scoped 506 dye-identification probe — hybrid PASS

`.tmp-pr92-sources/dye-identification-report.json` is a completed single-case,
three-mode probe. Its hybrid gate passes. Independent prose review also
**PASSES**: `novgorod_thirteenth_century_colourants_en` cites exactly
`claim:textile-lac-dye-analysis` and `claim:textile-indigo-yellow-analysis`.
It preserves lac-dye as a source-qualified medium-confidence inference,
indigo plus unidentified yellow colourant and green textile colour in the
specified sample, possible imported origin, and the limits on local
cultivation/dyeing, bath contents, colourant source and present textiles. It
adds no named source, recipe, local production or current item. This narrow
probe does not supersede the current full-corpus BLOCK findings.

### Scoped spinning-capability fixed replay — hybrid PASS

`.tmp-pr92-sources/spinning-capability-fixed-report.json` is the completed
three-mode retry of the captured spinning plan after rollback of the erroneous
focus/domain coherence gate. Its hybrid production gate passes.

**Independent prose verdict: PASS.** `spinning_fibre_capability_en` cites
`claim:textile-fibres-twist-yarn`, supplies its required group, and preserves
capability rather than a usable-yarn guarantee. The plan retains the same extra
`wk:craft_technology:spinning` focus with craft/physics domains; no artificial
repair or material-culture expansion occurs. The additional cited
`claim:material-water-plant-fibre-cellulose` is not needed by the question but
is accurately bounded as a classification supplying neither wet strength,
present material nor historical availability; it is irrelevant context, not a
false premise. This is one fixed regression only and does not supersede the
known full-corpus P1/BLOCK findings.

### Current513 full 30-case hybrid prose audit

Independent audit of current canonical `benchmarks/pipeline-v1-report.json`:
30 hybrid outputs. Terminal production gate is **FAIL** for
`bort_regional_use_context_en` and `wet_unknown_hide_ru`; correct answer class
does not supersede either missing evidence group.

| Hybrid case(s) | Verdict | Grounding result |
| --- | --- | --- |
| Other 28 cases | **PASS.** | Cited premises support stated relations and retain qualifications. Architecture now stops at non-proof of a church; oil keeps “does not establish a direct comparison”; ship keeps join/caulking functions bound to claims; wet hemp retains class bridge and conditional water response. |
| `bort_regional_use_context_en` | **BLOCK — retrieval/packing omission plus unsupported prose premise.** | Query asks hook-associated activity and rural setting. Slice/citations contain rural tree-bort, honey and wax facts but omit `claim:agriculture-fauna-bort-climbing-hooks`; answer nevertheless asserts hook association. Both expected groups remain necessary; not oracle false failure. |
| `wet_unknown_hide_ru` | **Evaluator/benchmark expected-group defect; prose PASS.** | Cited rawhide text itself says its wet/dry response is distinct from tanned leather. Query supplies unknown tanning, and answer states only that this prevents transfer; it does not assert direct-water damage or dependency on processing/finish/condition. Available `claim:material-water-leather-water-processing` is a legitimate optional premise, not mandatory evidence for this narrower uncertainty conclusion. Remove it from required expected group; retain rawhide group and unsupported-ref guard. |

No other P1/P2 prose overclaim found in current513. This records no global
readiness or runtime/prompt/data prescription.

### Current516 verification-acceptance ledger

This is a read-only ledger reconciliation of the current516 production
fragments against existing independent verification records. Sources were not
re-opened. It covers the post-current513 / explicitly requested claim set only
and does **not** assert a global pipeline, readiness, retrieval, compiler or
test PASS.

| Production claim(s) found once in fragment owner | Independent approval record | Ledger result |
| --- | --- | --- |
| `claim:posadnik-fedor-conflict-1224`, `claim:posadnik-volodislav-pursuit-1228` in `occupation-context.json` | `verification-occupation-role-practices.md` ORP-01/02 and its exact-normalization review | **ACCEPTED.** Both stay named 1224/1228 chronicle episodes, `1200–1300`, `inferred/medium`, internal-only; neither becomes a general posadnik duty, force, boat, command, scene or current actor. |
| `claim:burial-plank-coffin-nails`, `claim:burial-coffin-lid-transverse-plank`, `claim:burial-hollowed-log-container` in `social-institutions.json` | `verification-burial-observance.md` BOP-01/02/03 and its exact-normalization review | **ACCEPTED.** One preliminary early-XII, mostly child/damaged burial report remains the source-specific basis. Each record retains broad `1100–1300`, `inferred/medium` compatibility and excludes a uniform coffin form, rite, present burial or inventory. |
| `claim:early-rus-hunting-ground-terms` in `agriculture-fauna.json` | `verification-trapping-plant-use.md` TPU-07 and exact-normalization review | **ACCEPTED.** It retains only the chronicle terms `lovishcha`/`perevesishcha` in a princely resource-ground context, with earlier-Rus-to-Novgorod compatibility inferred/medium. No trap mechanics, net/rope arrangement, current site, animal, stock, right or access is imported. |
| `claim:transport-winter-sledge-1220` in `historical-processes.json` | `verification-transport-operations.md` SW-05 and exact-normalization review | **ACCEPTED.** Literal and RU/EN retain the one winter-1220 Tverdislav-on-sledges episode; they exclude a calendar, ordinary vehicle availability, traction, route conditions, medical practice and current season. |
| `claim:probable-travel-chalice-communion` in `social-institutions.json` | `verification-religious-practices.md` RPO-03 and exact-normalization review | **ACCEPTED.** The literal and localizations preserve the museum's `вероятнее всего` / “most likely” attribution. No material, findspot, manufacture, medieval-Novgorod provenance/presence, clergy, church, consecration, wine, rite, access or authenticity has been introduced. `region_novgorod_land` is only the record's explicitly inferred/medium compatibility envelope, never provenance. |

All eight reviewed claims have a single corresponding approved evidence ref,
`supported_fact`, `domain_internal_only`, and the independently approved
time/directness/confidence envelope. No unsupported import was found in this
set. Deliberate exclusions were also checked: RPO-01/RPO-02 have no matching
new production claim, and rejected TPU-08 has no production relation for its
1604 rope/net mechanism. Existing `wax-candles.json` uses the same SHM exhibit
for independently approved candle facts; that pre-existing source reuse is
not an RPO-01/RPO-02 import.

### Current516 full independent-verification aggregation gate

**Verdict: NOT ESTABLISHED — traceability gate fails, without a new source
verdict.** The prior full-scope document is
`audits/final-contract-retrieval.md`, but it explicitly covers only the
historical 54-claim scope and records that production has no verifier-decision
link. It is therefore **not** a full independent-verification baseline for
current516.

I reconciled all **516 unique production `claim_ref`s** against the union of
existing `verification/*.md`, that historical audit, and this checkpoint. A
claim is traceably linked only where that union contains its exact claim ref,
an exact evidence ref, or the cited source URL. Result: **392 linked; 124
unlinked/orphaned; 0 production claims marked rejected; 0 production claims
marked disputed.** Every production record itself has `review_status:
approved`, but that field is authoring status, not an independent-verifier
receipt. Thus `392` is a source/record trace count, not a claim that all 392
have a separately identifiable approval sentence.

The 124 exact orphans are below, grouped by fragment. They are not rejected
facts and this audit did not re-investigate their sources; they lack a
discoverable independent-verification link in the existing ledger union.

| Fragment | Exact orphan claim refs |
| --- | --- |
| `biology-physiology.json` (21) | `claim:aerobic-muscle-atp-regeneration-depends-on-oxygen`; `claim:animal-energy-availability-depends-on-food-derived-nutrients`; `claim:animal-homeostasis-responds-to-internal-external-change`; `claim:cellular-atp-production-can-cause-metabolic-heat`; `claim:coagulation-reduces-blood-loss`; `claim:continued-sweating-can-cause-body-water-loss`; `claim:dietary-macronutrients-support-cellular-energy`; `claim:endotherm-insulation-reduces-heat-loss`; `claim:fluid-osmotic-balance-depends-on-water-solutes`; `claim:fungal-decomposition-affects-nutrient-recycling`; `claim:human-thermoregulation-depends-on-heat-exchange`; `claim:intact-skin-reduces-pathogen-entry`; `claim:plant-development-responds-to-light`; `claim:plant-growth-depends-on-light-water-carbon-dioxide-minerals`; `claim:plant-root-uptake-depends-on-water-and-inorganic-nutrients`; `claim:seasonal-plant-development-depends-on-photoperiod`; `claim:skeletal-muscle-contraction-depends-on-atp`; `claim:stomatal-opening-affects-gas-water-exchange`; `claim:stomatal-regulation-responds-to-light-water-carbon-dioxide`; `claim:sweat-evaporation-reduces-surface-heat`; `claim:tissue-injury-can-cause-inflammatory-repair-response` |
| `environment-biology.json` (6) | `claim:common-reed-rhizome-produces-stems-in-wetland-habitat`; `claim:food-drying-depends-on-humidity-airflow`; `claim:food-drying-reduces-microbial-growth-conditions`; `claim:stored-grain-condition-depends-on-temperature-moisture`; `claim:water-temperature-affects-aquatic-organism-range`; `claim:white-willow-depends-on-moist-lit-riparian-habitat` |
| `environment-ecology.json` (14) | `claim:animal-pollination-affects-flowering-plant-reproduction`; `claim:medieval-novgorod-fishing-attests-major-occupation-food-context`; `claim:medieval-novgorod-food-base-attests-domestic-animals-and-crops`; `claim:medieval-novgorod-landscape-attests-volkhov-ilmen-woodland-meadow-context`; `claim:medieval-novgorod-wild-mammal-remains-attest-limited-dietary-use`; `claim:pre1300-novgorod-context-attests-shorter-cold-extreme-recurrence`; `claim:river-flow-affects-sediment-transport-deposition`; `claim:seasonal-bird-migration-affects-seasonal-food-climate-exposure`; `claim:soil-texture-affects-infiltration-rate`; `claim:troitsky-bilberry-incidence-indicates-northern-heath-clearing-exploitation`; `claim:troitsky-cereal-millet-remains-probably-link-to-poozerie`; `claim:troitsky-gathered-plants-probably-link-to-southern-deciduous-woodland`; `claim:troitsky-nonwood-plant-remains-probably-local`; `claim:wetland-hydric-soil-depends-on-saturation` |
| `environment-p1.json` (9) | `claim:environment-p1-bird-taxa`; `claim:environment-p1-buried-soil`; `claim:environment-p1-cattle`; `claim:environment-p1-horse-meat`; `claim:environment-p1-horse-transport`; `claim:environment-p1-pig`; `claim:environment-p1-sheep-goat`; `claim:environment-p1-waterlogged-layer`; `claim:environment-p1-wildfowl-season` |
| `food-processes.json` (10) | `claim:drying-reduces-microbial-growth-conditions`; `claim:fermentation-depends-on-microbe-substrate-conditions`; `claim:heating-reduces-microbial-viability`; `claim:lactic-bacteria-can-convert-carbohydrate-to-acid-carbon-dioxide`; `claim:lactic-fermentation-affects-acidity-and-food-proteins`; `claim:low-temperature-reduces-many-microbial-metabolic-rates`; `claim:microbial-growth-depends-on-available-moisture`; `claim:microbial-growth-depends-on-species-temperature-range`; `claim:solute-concentration-reduces-available-water-for-many-microbes`; `claim:yeast-can-convert-sugars-to-ethanol-under-low-oxygen` |
| `foundation.json` (3) | `claim:buoyancy-pressure-phase-change`; `claim:dry-friction`; `claim:force-contact-geometry` |
| `historical-population.json` (10) | `claim:population-household-storage`; `claim:population-leather-straps`; `claim:population-shoe-form`; `claim:population-shoe-output`; `claim:population-storage-role`; `claim:population-storage-vessels`; `claim:population-tack-context`; `claim:population-weaving-practice`; `claim:population-woodwork-material`; `claim:population-woodwork-practice` |
| `joining-metals.json` (14) | `claim:population-joining-assembly-expansion`; `claim:population-joining-bond-contact`; `claim:population-joining-bond-contamination`; `claim:population-joining-bond-cure`; `claim:population-joining-bond-moisture`; `claim:population-joining-bond-pressure`; `claim:population-joining-bond-weak-link`; `claim:population-joining-metal-anneal`; `claim:population-joining-metal-cold-work`; `claim:population-joining-metal-fatigue`; `claim:population-joining-metal-melt`; `claim:population-joining-steel-quench`; `claim:population-joining-steel-temper`; `claim:population-joining-wax-soften` |
| `material-response.json` (9) | `claim:population-material-copper-iron-contact`; `claim:population-material-iron-coating`; `claim:population-material-iron-rust`; `claim:population-material-leather-dry`; `claim:population-material-leather-mould`; `claim:population-material-wood-combustion`; `claim:population-material-wood-decay`; `claim:population-material-wood-loading`; `claim:population-material-wood-pyrolysis` |
| `mineral-pigments.json` (10) | `claim:pigment-blue-layer-order`; `claim:pigment-blue-lime-basis`; `claim:pigment-carbon-black-pigment`; `claim:pigment-celadonite`; `claim:pigment-lazurite`; `claim:pigment-lime-plaster`; `claim:pigment-red-lead-pigment`; `claim:pigment-red-ochre`; `claim:pigment-wet-dry-techniques`; `claim:pigment-yellow-ochre` |
| `physical-interaction.json` (14) | `claim:population-physics-conduction-gradient`; `claim:population-physics-elastic-recovery`; `claim:population-physics-evaporation-below-boiling`; `claim:population-physics-evaporation-humidity`; `claim:population-physics-floating-shape`; `claim:population-physics-freezing-condensation-energy`; `claim:population-physics-immersion-buoyancy`; `claim:population-physics-load-deformation`; `claim:population-physics-melting-vaporization-energy`; `claim:population-physics-point-pressure`; `claim:population-physics-section-response`; `claim:population-physics-sliding-friction`; `claim:population-physics-static-friction`; `claim:population-physics-stress-failure` |
| `technology-boundaries.json` (4) | `claim:technology-circuit-prerequisite`; `claim:technology-motor-boundary`; `claim:technology-newcomen-boundary`; `claim:technology-rotation-prerequisite` |

Consequently the requested union does **not** cover current516. Closing this
gate requires a bounded linkage/approval decision for these 124 records (or a
separately evidenced historical baseline that names them); it does not
authorize reinterpreting, rejecting, changing or re-researching them here.

### Correction — substantive reconciliation of the former 124 string misses

The preceding `124` is a **textual-link diagnostic only**, not a finding that
124 claims lack independent approval. It is superseded as an orphan count by
this content reconciliation. Existing verifier reports use candidate IDs and
semantic wording rather than current production refs, so exact-string matching
was insufficient.

| Current fragment / production claims reconciled | Existing independent candidate approval and current mapping | Result |
| --- | --- | --- |
| `biology-physiology.json`: 21 former string misses (`activity-fluid`/ATP/heat, sweating/fluid, muscle/oxygen, injury/coagulation/skin, animal energy/homeostasis/insulation, plant growth/root/light/photoperiod/stomata/fungi, dietary macronutrients) | `research/verification-biology-physiology.md`: BP01→fluid balance; BP02→sweating; BP03–05→heat exchange/sweat evaporation/ATP heat; BP06–08→muscle ATP/aerobic oxygen; BP09–13→injury, coagulation and skin; BP14–16→animal energy, endothermy and homeostasis; BP20–26→the listed plant/fungi/diet relations. The current literals, `evidence:bp-*` records and internal-only RU/EN limits retain those scoped meanings. | **21 APPROVED mappings.** No medical outcome, threshold, current body state or actor expertise was added. |
| `food-processes.json`: 10 former string misses | `research/verification-food-processes.md`: FP01–05 map respectively to heating, cold, drying, species/temperature and solute/water conditions; FP07 maps moisture; FP09–11 map fermentation condition/lactic-food-medium/oxygen condition; FP12–13 map lactic-bacteria and yeast transformations. Current `evidence:fp-physical`, `fp-temperature`, `fp-water`, `fp-fermentation`, `fp-oxygen`, `fp-umn` and localizations preserve conditions/exceptions. | **10 APPROVED mappings.** No recipe, food safety, duration or historic availability was introduced. |
| `physical-interaction.json`: 14 former string misses | `research/verification-population-general-physical-interaction.md`: GPI01–14 map in order to load/deformation, elastic recovery, fracture, rod section response, point pressure, static/sliding friction, buoyancy/float shape, phase-energy relations, conduction, evaporation and humidity. Current physical claims/evidence/localizations preserve the verifier's conditional material/geometry/load/phase limits. | **14 APPROVED mappings.** No tool, material, load, heat, water or guaranteed result is materialized. |
| `mineral-pigments.json`: 10 former string misses | `verification/verification-mineral-pigments.md`: MP01–10 map to lime plaster, yellow/red ochre, celadonite, lazurite, red lead, carbon black, blue-sample lime basis, layer order, and mixed wet/dry technique. Current pigment claim/evidence/localization wording remains sample-specific St George Cathedral compatibility. | **10 APPROVED mappings.** No general palette, household stock, local manufacture or present church follows. |

This establishes **55 additional claim-level independent approvals**. The
verified aggregation is now: **516 current production claims; 447 linked by
existing exact ledger or substantive candidate-to-claim reconciliation; 69
remaining traceability-unresolved; 0 production rejected; 0 production
disputed.** The remaining 69 are the non-listed rows in the preceding
string-diagnostic table; they require the same content mapping before they can
be called orphans. The final verification gate therefore remains **NOT
ESTABLISHED**, but the former assertion of 124 approval orphans is withdrawn.

### Completion — reconciliation of the remaining 69 former string misses

I completed the same candidate-ID/source/evidence/localization reconciliation
for the remaining rows. This reads existing verifier records only; no source
was re-opened. Every mapping below retains the verifier's qualified scope,
and none turns a research-only or rejected candidate into production.

| Current fragment / claims | Existing independent approval mapping | Result |
| --- | --- | --- |
| `foundation.json`: `buoyancy-pressure-phase-change`, `dry-friction`, `force-contact-geometry` (3) | `verification-material-craft-physics.md` PMS-01, PMS-02 and PMS-03 respectively. | **3 APPROVED.** Universal physics only. |
| `environment-p1.json`: nine bird, soil/waterlogged, cattle/sheep-goat/pig/horse/horsemeat/transport and wildfowl rows | `research/verification-environment-p1.md`: root follow-up ENV-P1-01–07; ENV-P1-03 is correctly split in current production rather than retained as one pig/horse composite. | **9 APPROVED_WITH_LIMITS.** Assemblage/context, never present animals or terrain. |
| `environment-biology.json`: reed, drying, stored-grain, water-temperature and willow rows (6) | `research/verification-population-environment-biology.md`: corrected ENV-POP-12–16 and final replacement checks. | **6 APPROVED.** Species/material and condition limits remain explicit. |
| `environment-ecology.json`: pollination, regional fishing/food/landscape/wild-mammal context, cold recurrence, river/soil/seasonal-bird relations and four Troitsky rows (14) | `verification-environment-npc-social-chemistry.md` ENV/FAU/SEA/SOI approvals, `research/verification-population-environment-biology.md` corrected ENV-POP approvals, and the exact contextual normalization records (`verification-wetland-stems.md` where applicable). | **14 APPROVED_WITH_LIMITS.** Regional/environmental compatibility is not scene presence, yield, catch or calendar. |
| `historical-population.json`: storage, leather strap/shoe, tack, weaving and woodwork rows (10) | `research/verification-population-historical-context.md` PHC-14, PHC-16, PHC-18, PHC-19, PHC-22 and PHC-23; atomic split is permitted by its recorded Rybina material/process passages. | **10 APPROVED_WITH_LIMITS.** No workshop, kit, output, actor skill or current stock. |
| `joining-metals.json`: all 14 assembly/bond and metal heat-treatment rows | `research/verification-population-joining-metals.md`: every listed `bond-*`, `metal-*`, `steel-*`, `wax-soften` and `assembly-expansion` candidate is **APPROVE**. | **14 APPROVED.** Conditional universal mechanics only. |
| `material-response.json`: copper/iron, coating/rust, leather dry/mould and wood combustion/decay/loading/pyrolysis rows (9) | `research/verification-population-causal-materials.md`: final current approvals 4–5, 9–11 and 16–18. | **9 APPROVED.** Replaced stale anchors are explicitly corrected in that verifier; no historical practice is claimed. |
| `technology-boundaries.json`: circuit, motor, Newcomen and rotation rows (4) | `verification/verification-population-technology-boundaries.md`: TECH-BOUND-01–04 are **APPROVE**; TECH-BOUND-05 is explicitly not promoted and is absent. | **4 APPROVED.** Technology-boundary limits only. |

**Final aggregation result — PASS_WITH_TRACEABILITY_LIMITS.** The approval
union now covers **516/516 current production claims**: 392 had an existing
exact claim/evidence/source-ledger trace; the 124 initially missed by literal
matching are now substantively mapped (55 in the preceding correction and 69
here). **Approved: 516. Rejected production claims: 0. Disputed production
claims: 0. Unresolved production claim refs: 0.** This is a verification
ledger acceptance only; it neither reopens sources nor asserts semantic
pipeline, readiness, runtime or UI PASS.

### Current516 full33 hybrid prose review — session 36262

**Automatic gate: PASS (33/33 hybrid). Independent grounding:
PASS_WITH_P2_LIMITS.** The retained epistemic closure resolves the prior P1s:
`architecture_single_find_function_ru` now stops at non-establishment rather
than inventing another building function, and
`bort_hook_household_inference_en` now says only that the hook does not prove a
domestic hive rather than asserting that it is historically unassociated with
all hives. Oil retains conditional treatment/state distinctions; hard stone,
unknown-hide, smithy and conditional-household answers preserve their stated
limits; no mandatory kit, present object, automatic legal procedure or false
oil negative was found.

**Correction — `physics_wet_grain_ru`: PASS.** The current answer says only
that direction-dependent dimensional response explains the difference in
swelling and warping along/across grain. This is the same bounded inference
accepted in existing G-05: it follows from differential directional expansion,
does not assert a new historical/scientific premise, and does not establish
damage, dimensions, moisture, strength or a current outcome for this stake.
The preceding P1 classification was an inconsistent stricter criterion and is
superseded.

**P2 citation/prose limits.** `architecture_single_find_function_ru` mentions
compared church-construction characteristics available in its slice but cites
only `claim:contextual-evidence-classes`; this is uncited-use discipline, not
an unsupported fact. `ordinary_restraint_grounded_geometry_en` and
`spinning_fibre_capability_en` retain long inventories of unspecified scene
details. Their substantive conclusions are grounded; the inventories are
unnecessary and violate the intended concision/no-inventory style, but add no
new factual premise. No further P1 was found in the remaining hybrid outputs.

## Final independent Grounding / Verification / Open-world audit — `fc3ac52982890051f473d3ba9cb47b5e87e3851c`

Scope is the static PR92 pack and its active runtime wiring, not a claim of
world completeness or a live-gameplay campaign.

- **Grounding: PASS.** `@rus/turn` validates the bounded planner output, resolves it only through the read-only Core, and `apps/game-server` injects that bounded slice with the explicit no-model-memory closure. The current-state boundary remains explicit: compatibility does not establish presence, ownership, price, legal outcome, quantity, access, hidden facts, mechanics, or mutations. `partial`/`unresolved` resolves as a gap rather than an invented fact.
- **Verification: PASS.** Recompiled authoring and the committed runtime both contain **1,579** approved claims. The authoring pack contains **1,579** verification records and the runtime has **1,579** unique `verification_ref`s. Every claim has exactly one matching `APPROVE` record with a current digest, matching checked evidence, independent reviewer/candidate fields, and the runtime bundle equals deterministic compiler output.
- **Open-world: PASS.** The Knowledge Core is a pure bounded factual retriever, not a materializer, state owner, object/place whitelist, price/law/outcome generator, or action resolver. Missing factual support is `unresolved`; ordinary semantic paths remain with the existing turn/materialization owners. The reviewed static-phase contract keeps Gameplay Gap Auditor/live campaigns outside this phase.

Findings in this final scope: **P0 0, P1 0, P2 0**. Checked evidence: §100–102 of the active WK contract; `packages/world-knowledge/test/*.test.js`; `tools/world-catalog-workflow/test/world-knowledge-{pack,population}.test.js`; `apps/game-server/test/{world-knowledge-grounding,lower-dvina-trace-world-knowledge-bridge}.test.js` — **104/104 PASS**.
