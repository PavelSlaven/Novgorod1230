# PR92: повторный Contract + retrieval/latency audit

**Current PR92 contract verdict: PASS_WITH_LIMITS.** Current bindings preserve
Knowledge Core as read-only factual context: it is neither state,
materialization nor NPC-decision owner. Categories remain open factual
coverage, not command/action/recipe whitelists; actor-role facets stay
request-safe; canonical contract documents are registered/generated; and the
one-repair, unavailable-reference boundary remains fail-closed. The retained
original-policy stage is still marked `PROPOSED`, not asserted active.

**Current retrieval/grounding verdict: PASS_WITH_P2_LIMITS.** Full33/current516
automatic hybrid gate passed and independent review confirms no current prose
P1. Automatic class/ref checks are supplemented by that review; remaining
citation-completeness and verbosity observations are P2.

**Combined contract/retrieval/grounding scope: PASS_WITH_P2_LIMITS.**
Factual-readiness and verification aggregation are recorded by their owning
audits, not inferred here; DB/browser/final-CI readiness is outside this file.

**Historical baseline verdict: PASS.** P0: 0; P1: 0; P2: 1 for the earlier
54-claim/9-case retrieval and contract scope recorded below. Only prior
findings were checked in that worktree. P2 did not block that versioned
cutover, but limited the claim of independent source verification.

## P1 findings rechecked

| Previous finding | Current verdict | Exact evidence |
|---|---|---|
| Encoder outage made vector retrieval a single point of failure | **RESOLVED** | [`world-knowledge-grounding.js`](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js:86) catches encoder/index failure, records `structured_lexical_fallback`, then calls Core without vector scores. Regression test covers worker-exit code `WK_VECTOR_WORKER_EXIT`: [`world-knowledge-grounding.test.js`](../../../../../apps/game-server/test/world-knowledge-grounding.test.js:54). |
| Runtime could fetch model/code from network | **RESOLVED** | Runtime worker uses `local_files_only=True` for tokenizer and model: [`giga-query-worker.py`](../../../../../apps/game-server/src/infrastructure/embedding/giga-query-worker.py:26); parent process also forces `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1`: [`giga-query-encoder.js`](../../../../../apps/game-server/src/infrastructure/embedding/giga-query-encoder.js:41). Missing local weights now fail worker startup rather than downloading. Authoring encoder remains network-capable; it is not gameplay runtime. |
| Contract active status conflicted with production wiring | **RESOLVED** | Contract now states `ACTIVE` for `4.13.0-world-knowledge.1` / spatial-v3 production v15: [`world_knowledge_platform_implementation_contract.md`](../../../../../data/knowledge-source/corpus/DOCUMENTS/world_knowledge_platform_implementation_contract.md:4). Contract index names same active cutover: [`CONTRACT_INDEX.md`](../../../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md:86). Release pins pack/profile and remains `validated_candidate_not_active` until existing activation readback: [`production-spatial-v3-release.js`](../../../../../apps/game-server/src/composition/production-spatial-v3-release.js:19), [`production-spatial-v3.js`](../../../../../apps/game-server/src/composition/production-spatial-v3.js:128). |
| No held-out three-mode pipeline evidence | **RESOLVED** | Nine held-out RU/EN domain probes and accepted answer classes: [`pipeline-v1.json`](../benchmarks/pipeline-v1.json). Report compares `without_wk`, `structured_lexical`, `hybrid`, records factual correctness, unsupported-premise rate, cold/warm embedding, planner/retrieval/semantic/total latency and provider token usage: [`pipeline-v1-report.json`](../benchmarks/pipeline-v1-report.json). Reported hybrid: correctness 1, unsupported premise rate 0, cold embedding 15,588.56 ms, warm embedding 92.06 ms, total pipeline mean 4,174.69 ms. Method is executable: [`world-knowledge-pipeline-eval.js`](../../../../../tools/world-catalog-workflow/src/world-knowledge-pipeline-eval.js:1). Monetary estimate is correctly `null` because no project-owned immutable price schedule exists. |
| Vector metadata bound only partially | **RESOLVED** | Loader validates metadata schema, pack/revision/profile, model ID/revision, dimension, normalization and pooling; `validEntries()` requires every concept/claim × locale exactly once with matching domain and nonempty retrieval text: [`world-knowledge-production.js`](../../../../../apps/game-server/src/internal/world-knowledge-production.js:41). Core still treats vectors only as retrieval candidates. |
| Planner had independent token cap / no cost telemetry | **RESOLVED** | Planner override now contains only deterministic temperature: [`world-knowledge-grounding.js`](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js:173). Diagnostic records `planner_ms` and provider usage per planner call: [`world-knowledge-grounding.js`](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js:110). Pipeline report carries planner and semantic token totals. |

## P2 finding

### WK-CR-01 — independent source-verification verdict is not linked to production records

Compiler/Core correctly require approved source, evidence, concept and claim statuses, source/evidence lineage, anchors and nonempty notes: [`world-knowledge-pack.js`](../../../../../tools/world-catalog-workflow/src/world-knowledge-pack.js:107), [`world-knowledge.js`](../../../../../packages/world-knowledge/src/world-knowledge.js:152). Production evidence notes name independently reopened URLs. Separate domain-verification reports exist under `data/world-catalogs/novgorod/world-knowledge/verification/`.

However, `production-v1/authoring.json` has no `verification_ref` (or equivalent reviewed-decision reference), and compiler does not consume such a link. Therefore this audit can verify the strict declared approval chain and cited anchor shape, but cannot mechanically establish that every production source/evidence record was covered by a separate verifier verdict. This is a traceability limit, not evidence that any of the 54 production claims is false or unsafe.

## Other checked invariants

- **Strict schema/Core: PASS.** Query/bundle validation is exact; applicability and knowledge access filter candidates before slice packing. [`world-knowledge.js`](../../../../../packages/world-knowledge/src/world-knowledge.js:152).
- **Bilingual identity: PASS.** Localizations retain canonical refs; production test confirms RU/EN surface resolves the same claim. [`world-knowledge-pack.test.js`](../../../../../tools/world-catalog-workflow/test/world-knowledge-pack.test.js:48).
- **Giga exact profile: PASS.** Runtime loader and worker pin profile/ref/revision/dimension/pooling/normalization. [`world-knowledge-production.js`](../../../../../apps/game-server/src/internal/world-knowledge-production.js:28), [`giga-query-worker.py`](../../../../../apps/game-server/src/infrastructure/embedding/giga-query-worker.py:14).
- **Noise/applicability: PASS with bounded evidence.** Retrieval report has hybrid Recall@10 0.963, hard-constraint recall 1 and applicability precision 1; pipeline report has zero unsupported premise refs. Its 27 retrieval and nine pipeline probes are regression evidence, not a claim of exhaustive domain coverage.

## Checks run

`node --test packages/world-knowledge/test/*.test.js apps/game-server/test/world-knowledge-grounding.test.js tools/world-catalog-workflow/test/world-knowledge-pack.test.js test/spatial-v3/pr8-production-v3-composition.test.js` — 43 pass, 0 fail.

`git diff --check` — pass.

## Post-edit check — focus owner-domain clarification (495 snapshot)

**PASS for the scoped planner defect; no schema or policy finding.** The only
candidate guidance added to `runPlanner()` is: “For each selected focus_ref,
select the domain owning its needed facts; its own namespace can own facts as
well as additional mapped domains. Do not substitute a domain suggested only by
the intended application for the domain containing the material/tool
relationship.” It is prompt guidance within the existing immutable
`allowed_domains`, approved focus refs, three-domain limit and six-key plan;
it neither expands a request nor creates a domain, predicate, factual record or
planner output field.

The paired real-production diagnostic
`.tmp-pr92-sources/focus-owner-domain-probe-output.json` holds each request,
available current495 refs, limits and temperature at zero. Only this sentence
differs between baseline and `focus_owner` calls.

| Case | Baseline → candidate result | Independent verdict |
| --- | --- | --- |
| `hemp_processing_materials_ru` | Baseline selects `craft_technology` + `architecture_settlement`, omitting the material-culture owner and `claim:agriculture-fauna-tow-log-gaps`. Candidate selects those two **plus** `material_culture`, retains architecture, and returns all three required hemp/tow/log-gap relations. | **PASS.** This is the target owner-selection repair, not automatic expansion: the third domain supplies the independently requested material/tool relationship while the application domain remains available. |
| `prepared_hide_tanning_en` | Both runs return `claim:vegetable-tanning-prepared-hide` and `claim:vegetable-tanning-collagen-stabilization`; candidate does not substitute a non-owner application domain for the chemical relationships. | **PASS.** Both required HLP premises survive; no tanning-specific fact is invented. |
| `hard_stone_abrasive_limits_en` | Both runs return the two CSP hard-stone relations. Candidate removes the broad `woodworking` focus while retaining stone/cutting-tool focus and the required sawing/shaping premises. | **PASS.** The clarification does not introduce woodwork padding or lose either independent hard-stone relationship. |

This is a focused diagnostic, not a rerun of the full canonical pipeline or a
global readiness/PASS declaration. I independently ran
`node --test apps/game-server/test/world-knowledge-grounding.test.js`: 6 pass,
0 fail.

## Post-edit check — cross-domain planner focus (491 snapshot)

**PASS; no P0/P1 finding.** `runPlanner()` now derives its prompt-only
`crossDomainFocus` map from the compiled
`exact_indexes.concept_to_claim_refs`, resolves each claim's actual domain, and
retains it only when that domain is both allowed by the immutable request and
different from the focus concept's own domain. It neither changes
`allowed_domains`, the six-key planner-plan schema, planner validation, nor the
existing `max_domains: 3` limit. The prompt expressly treats the map as a
domain-owner hint, not a factual answer or a command to select every mapped
domain. See [`world-knowledge-grounding.js`](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js:162).

The production `vegetable-tanned-leather` focus now exposes only its compiled
cross-domain owners (`chemistry_process`, `physics_material_science`), and the
new regression selects `chemistry_process` and retrieves the two tanning claims
without widening selected domains. The same test confirms cross-domain iron
metadata and omission of a same-domain fish focus. [`world-knowledge-grounding.test.js`](../../../../../apps/game-server/test/world-knowledge-grounding.test.js:67).

**Non-blocking observation (P2):** for this corpus/purpose the derived prompt
map has 65 entries (about 4,096 JSON characters). It is bounded by the compiled
allowed concept set and is covered by planner telemetry, but its token/latency
effect should remain visible in ordinary pipeline measurements rather than be
treated as free.

Checks run after the edit:

`node --test apps/game-server/test/world-knowledge-grounding.test.js` — 6 pass,
0 fail.

`node --test apps/game-server/test/lower-dvina-trace-conversation-llm-grounding.test.js`
— 5 pass, 0 fail.

`git diff --check` — pass.

## Proposal check — focus/domain retrieval coherence (495 snapshot)

**P1 — approve minimal validator change.** The proposed rule is structural,
not a semantic-domain expansion: for each selected `focus_ref`, read its
already compiled `concept_to_claim_refs`; if those refs own at least one domain
inside immutable `request.allowed_domains`, the selected `plan.domains` must
intersect that indexed domain set. It only rejects a plan that keeps an exact
focus yet makes every indexed fact for that focus unqueryable. It neither
requires every possible domain, adds a domain, chooses a factual relationship,
changes the six-key schema, or calls another model.

Current contract validation checks that focus is caller-authorized and domains
are allowed, but not that they can retrieve one another:
[`query-planner-contract.js`](../../../../../packages/world-knowledge/src/query-planner-contract.js:35).
The actual compiled `wk:material_culture:hemp-tow` maps to
`claim:agriculture-fauna-tow-log-gaps`, whose only claim domain is
`material_culture`; a plan retaining that focus while selecting only
`craft_technology` and `architecture_settlement` is therefore internally
incoherent and loses the exact fact before Core packing.

Smallest correct owner is `validateWorldKnowledgeQueryPlan()`, after existing
focus/domain authorization. Reuse the compiled index and claim-domain lookup;
return one structural error per incoherent focus. Existing
`requestWorldKnowledgeQueryPlan()` already performs exactly one repair using
validator errors, so no repair topology change is justified
([`world-knowledge-grounding.js`](../../../../../packages/turn/src/world-knowledge-grounding.js:11)).
Add one contract regression: allowed focus with indexed `material_culture`
claim plus a plan selecting only another allowed domain fails; adding
`material_culture` passes. Keep empty-focus and a focus with no indexed allowed
claim domain valid. Omitted focus/bort remains a separate semantic quality gap;
this validation cannot force a planner to select it.

## Post-edit check — focus/domain retrieval coherence

**PASS — prior P1 resolved.** The implementation is in the shared read-only
contract owner, `validateWorldKnowledgeQueryPlan()`: it derives only indexed
claim domains that are already in `request.allowed_domains`, then rejects a
retained focus only when none intersects selected `plan.domains`
([`query-planner-contract.js`](../../../../../packages/world-knowledge/src/query-planner-contract.js:40)). It does not
auto-expand a domain, alter the six-key DTO, choose relevance, or add a model
call. The existing one-repair path receives the structural error and may either
select a factual owner or remove the unnecessary focus
([`world-knowledge-grounding.js`](../../../../../packages/turn/src/world-knowledge-grounding.js:11)).

The regression covers the original `hemp-tow` incoherence, its
`material_culture` repair, a cross-domain `iron → chemistry_process` focus,
and both empty and zero-index focus cases
([`query-planner-contract.test.js`](../../../../../packages/world-knowledge/test/query-planner-contract.test.js:39)). Contract §52 now matches exact runtime behavior.

**P2 future-quality limit:** validator deliberately sees the compiled index,
not runtime applicability or actor access. A retained focus whose only indexed
allowed-domain claim is later filtered by context can trigger a repair/domain
that ultimately yields no fact. This cannot create an unsupported fact or
expand authority; it is possible unnecessary planner work. Keep it visible in
repair/latency telemetry. Planner omission of a relevant focus (for example
`bort`) remains a semantic retrieval-quality issue, correctly outside this
structural validator.

## Pre-change review — classification/use-context bridge instruction (499)

**PASS WITH WORDING CHANGE.** Active §§51–52 make planner sole owner of bounded domain/ref/hint selection. Proposed instruction stays inside immutable allowed domains, approved focus refs, three-domain/eight-ref limits and existing one-plan/one-repair topology. No fact, schema key, owner, Core fallback, or model call changes. Contract-compatible.

Use narrower form, avoiding noun-padding conflict with §92:

> When an answer would apply a general property to a named material, or infer or limit an activity from an observed tool, include approved classification or use-context relationship needed for that application and select its owning domain as well. Do not assume that connecting premise from model memory.

This complements existing smallest-sufficient/most-specific focus rule. Select bridge only when answer needs it; no authorization to select every material, tool, or mapped domain. Existing validator still catches retained focus with no queryable owner-domain fact; it cannot force omitted bridge focus. Prompt guidance is correct bounded owner.

### Smithy relevance-oracle review

`claim:occupation-smith-iron-input` remains most direct visible-iron premise: its runtime text expressly denies that described iron input establishes a working smith in current scene. `claim:occupation-smith-hammer`, `claim:occupation-smith-role`, and `claim:occupation-smith-anvil` are also supported alternatives for distinct no-present-smithy limits: historical hammer attestation is not mandatory kit/scene item; smith role creates no workshop or fuel; anvil attestation establishes no present access. Not arbitrary tool facts.

Recommended benchmark-only delta: append those three exact refs to `craft_smithy_assumption_en.relevant_claim_refs`, retaining existing two refs, at-least-one relevant-premise rule, answer classes, unsupported-ref rule and all expected groups. Do **not** add tongs or every smithing claim. This records documented alternatives; it does not convert missing scene evidence to pass.

## Pre-change diagnosis — rollback focus/domain coherence gate

**APPROVE MINIMAL ROLLBACK.** The added §52 focus-index/domain-intersection
rule turns semantic relevance into structural validity. Captured
`spinning_fibre_capability_en` selects needed
`physics_material_science` / `wk:physics_material_science:fibre-twisting`, but
also carries allowed `wk:craft_technology:spinning`, whose indexed historical
claims live in `material_culture`. Validator rejects extra focus before Core
can retrieve `claim:textile-fibres-twist-yarn`; one repair repeats plan.

Unused approved focus is neither malformed DTO nor authority/trust breach.
§§51–52 authorize and bound planner choices; they do not make compiled index a
semantic-necessity judge. Remove added claim-domain loop from
`validateWorldKnowledgeQueryPlan`, its §52 paragraph, and its
focus-intersection regression. Keep ref/domain/predicate/bound validation,
prompt-only cross-domain map, and one repair. Do not replace with
subject-index variant: same semantic-heuristic defect.

Required regression: captured plan with extra
`wk:craft_technology:spinning` and selected
`physics_material_science` / `wk:physics_material_science:fibre-twisting`
validates, then Core returns `claim:textile-fibres-twist-yarn`. No dummy claim
or forced material-culture domain is justified.

## Post-edit check — focus/domain coherence rollback

**PASS.** `validateWorldKnowledgeQueryPlan()` again enforces only the active
§52 structural boundary: exact six-key shape, supported locale, allowed and
bounded domains/focus refs/search hints, and predicates registered for selected
domains. The compiled-index focus/domain-intersection loop is absent. The
active §52 validation text has likewise returned to those rules; no mixed
semantic invariant remains.

The new server regression holds the captured pattern: an approved but unused
`wk:craft_technology:spinning` focus may coexist with selected
`craft_technology`/`physics_material_science` domains and the physical
fibre-twisting focus. It performs one planner call, does not force
`material_culture`, and returns `claim:textile-fibres-twist-yarn`. Existing
cross-domain prompt metadata remains advisory, and existing authorization,
limits, predicates and one structural repair remain unchanged. This repairs a
pre-retrieval false failure without adding authority, a model call, schema, or
fallback.

## Post-normalization contract check — ORP historical episode context

**PASS_WITH_LIMITS.** Two new `npc_daily_life` `supported_fact` claims reuse
the existing `occupation-context` authoring owner and have no schema, planner,
profile, permission, or call-topology delta. Their literal values and RU/EN
runtime text retain Fedor/1224 and Volodislav/1228 as named chronicle
episodes. `domain_internal_only` prevents them from becoming player/NPC
profile knowledge or current-world state.

The 1200–1300 Novgorod-Land envelope is explicitly inferred/medium; direct
high evidence remains limited to each source record. The shared
`posadnik-role-context` concept is therefore an indexed documentary context,
not a generic occupation-to-practice rule. It must continue to exclude office
duty, authority, current personnel/boats/conflict, or inference about another
officeholder. This matches active factual grounding boundaries without a new
owner or public contract.

## Diagnostic — removing evidence-establishment planner instruction (513)

**REJECT as production change.** In matched regional-bort replay, baseline
retrieved both required hook and rural-context premises. Removing only the
instruction about whether supplied evidence establishes a proposition dropped
the material/craft owner and hook premise while retaining
craft/architecture/NPC domains. Original bort control remained fully covered.

Corrected architecture-only control retained its required fact in both arms,
but deletion added hypothetical-origin hints. The first architecture harness
result had undefined expected groups and is excluded. This is evidence of
regression, not an instruction-priority fix: retain current prompt and make no
schema, bound, topology or readiness conclusion from this probe.

## Post-edit check — complete focus claim-domain metadata (516)

**PASS_WITH_COST.** `runPlanner()` now derives `focusClaimDomains` from the
compiled exact concept-to-claim index and actual claim owners, retaining only
request-authorized focus refs and immutable allowed domains. Unlike prior
cross-domain-only metadata, this includes a focus's own actual owner (for
example, tree-climbing hook → `material_culture`). It is advisory metadata,
not facts or an automatic domain union: planner still returns the existing
bounded six-key DTO and selects at most the caller limit.

Matched structured probe fixes regional bort's omitted hook premise while
wet-hemp, tanning and spinning controls retain expected coverage; spinning
selects a cleaner minimal slice. The production test asserts visible hook,
environment and cross-domain owner entries, and preserves selective domains.
No schema, contract authority, repair topology or Core ranking behavior
changed.

**P2 cost:** captured planner prompts grew from about 6.9k to 13.8k tokens;
full33 now records 469,674 hybrid planner-prompt tokens (about 14.2k/case),
42,181 ms cold embedding, 137 ms warm mean embedding, and 4,667 ms mean total
pipeline time. This is measured runtime cost, not a schema/authority defect or
a global grounding PASS.

## Post-edit check — exact unavailable focus repair

**PASS.** `validateWorldKnowledgeQueryPlan()` still rejects every focus ref
outside caller-authorized `available_knowledge_refs`; its structural error now
contains the deterministic JSON list of those model-supplied invalid refs.
No allowlist, schema key, bound, ranking rule, fact, automatic replacement, or
extra repair was added. Existing one-repair flow receives the more actionable
error and remains fail-closed on a repeated invalid plan.

Captured hard-stone probe confirms cause and scope: generic error repeats
`wk:craft_technology:stone`; exact error removes it and retrieves both existing
hard-stone claims. This is a paired structured-retrieval result, not answer
acceptance or global readiness evidence. The interrupted 44-run report remains
an incomplete failure record.

## Current PR92 structural contract verdict (516)

**PASS_WITH_LIMITS.** Current binding changes preserve the active separation
of responsibilities:

- `@rus/world-knowledge` returns an approved, applicability-filtered factual
  slice only; it has no state, presence, materialization, NPC-decision,
  persistence, network, or LLM owner. The lower-Dvina bridge remains a
  consumer of that slice, not another resolver or materializer.
- Factual categories remain coverage vocabulary, not a command/action/recipe
  whitelist. `unresolved` stays a factual gap rather than a prohibition on a
  free actor attempt.
- NPC-facing role facets are projected from
  `request.npc.social_role.role_ref` for the two NPC schemas; actor-supplied
  or generic safe-state role fields do not override that projection. Existing
  decision and conversation owners still choose/commit NPC action.
- The canonical contract and index are present in corpus registration and
  generated manifests/module index. The original-policy stage remains labelled
  `PROPOSED`; this audit does not misstate it as active production behaviour.
- Exact unavailable `focus_refs` remain rejected against immutable caller
  authorization. The diagnostic lists only invalid refs, preserves the six-key
  DTO and all limits, allows one existing structural repair, and fails closed
  when repair repeats invalid output.

No new owner, public schema, materialization permission, actor authority,
fallback, or call topology was introduced. Limits: this is a structural
contract verdict; it does not replace source/readiness-owner verdicts or the
independent answer-prose finding below.

## Historical full33 hybrid prose audit — pre-epistemic closure

**Superseded by session 36262 below.** This pre-closure report recorded two
P1 outputs; it remains as historical evidence, not current verdict.

1. **P1 — `architecture_single_find_function_ru`.** Cited
   `claim:contextual-evidence-classes` establishes only that one find does not
   determine a building function. “Кладка могла быть частью любого каменного
   сооружения” adds an unsupported historical/architectural alternative. Safe
   conclusion ends after “не доказывает церковь”; no supplied claim establishes
   another stone-building function.
2. **P1 — `bort_hook_household_inference_en`.** The hook claim supports a
   bounded tree-climbing-for-honey relation and the rural claim says
   tree-based practice is not default domestic-hive evidence. “not with
   domestic hives” asserts a stronger non-association of the excavated tool
   itself. Supplied facts support “does not establish a domestic hive,” not
   that the hook is historically unassociated with every domestic hive.

**P2 — `spinning_fibre_capability_en`.** The capability/non-guarantee result
is grounded. Its long inventory of unspecified preparation, species, fibre
length, tool, worker, time and strength is unnecessary evidence-gap prose, not
an asserted factual premise. Do not count it as a P1.

The remaining 30 hybrid outputs, including new winter-sledge, probable-bowl
and restraint cases, retain cited claim qualifiers/conditions and introduce no
separate P1 found in this review. In particular, wet-hemp keeps conditional
pathways, oil distinguishes conditional states without a false negative,
ship joint/caulking keeps use/function bindings, debt remains current-scene
non-inference, and smithy does not turn attested tools into a mandatory kit.

## Current516 full33 hybrid prose audit — session 36262

**Automatic gate: PASS (33/33 hybrid). Independent grounding:
PASS_WITH_P2_LIMITS.** The retained short epistemic closure resolves the
preceding architecture/bort P1 outputs. `physics_wet_grain_ru` is also PASS:
its directional swelling/shrinkage → bounded warping explanation is the same
G-05 inference already accepted and does not assert current damage/outcome.
The earlier P1 classification was inconsistent and is superseded. The P2
uncited-use/noisy-inventory observations are recorded in
`final-grounding.md`; no current hybrid P1 was found.
